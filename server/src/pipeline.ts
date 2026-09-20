import {
  validateAgainstSchema,
  type AuthorizationResult,
  type ClarificationQuestion,
  type Command,
  type Origin,
  type RiskContext,
  type RiskEvaluation,
} from "@rtq/security";
import type { AegisRuntime } from "./rtq.js";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type StageState = "pending" | "active" | "done" | "failed" | "skipped";

export interface Stage {
  key: string;
  label: string;
  state: StageState;
  /** Elapsed wall-clock ms measured for this stage. */
  ms: number;
  /** Human-readable summary line. */
  summary: string;
  /** Rich structured payload for the UI. */
  data?: Record<string, unknown>;
}

export type RunDecision =
  | "allowed"
  | "denied"
  | "clarification_required"
  | "approval_required"
  | "error";

export interface ApprovalInfo {
  challengeId: string;
  strategy: string;
  summary: Record<string, unknown>;
  risk: string;
  origin: Origin;
  capability: string;
  expiresAt?: number;
  qrPayload?: string | null;
}

export interface RunResult {
  runId: string;
  capability: string;
  version: number;
  actor: string;
  origin: Origin;
  elapsedMs: number;
  decision: RunDecision;
  result: AuthorizationResult | { decision: "error"; code: string; reason: string };
  stages: Stage[];
  approvals?: ApprovalInfo[];
  auditEventCount: number;
  /** Per-stage pacing hint for the UI playback (ms). */
  tickerMs?: number;
}

let runCounter = 0;

export function nextRunId(): string {
  runCounter += 1;
  return `run_${Date.now().toString(36)}_${runCounter}`;
}

/* -------------------------------------------------------------------------- */
/* The main pipeline                                                          */
/* -------------------------------------------------------------------------- */

export interface RunCommandOptions {
  capability: string;
  version?: number;
  input: Record<string, unknown>;
  origin?: Origin;
  actor?: string;
  resource?: string;
  riskContext?: RiskContext;
  metadata?: Record<string, unknown>;
  /** Per-stage pacing hint for UI playback (ms). */
  stageDelayMs?: number;
}

export async function runCommand(runtime: AegisRuntime, options: RunCommandOptions): Promise<RunResult> {
  const { rtq } = runtime;
  const start = Date.now();
  const runId = nextRunId();

  const origin: Origin = options.origin ?? "local";
  const actor = options.actor ?? "operator@aegis.dev";
  const stages: Stage[] = [];

  const command: Command = {
    capability: options.capability,
    version: options.version ?? 1,
    input: options.input,
    origin,
    metadata: options.metadata,
  };
  const opts = { actor, resource: options.resource, riskContext: options.riskContext };

  /** Stage guard: measures elapsed time and pushes a stage on finish(). */
  const stageTimer = (key: string, label: string) => {
    const t0 = performance.now();
    return (state: StageState, summary: string, data?: Record<string, unknown>) => {
      stages.push({ key, label, state, ms: Math.round(performance.now() - t0), summary, ...(data ? { data } : {}) });
    };
  };

  /* Stage 1 — Command */
  const s1 = stageTimer("command", "Command");
  s1("done", `${command.capability} v${command.version} · actor ${actor} · origin ${origin}`, {
    command: {
      capability: command.capability,
      version: command.version,
      input: command.input,
    },
    actor,
    origin,
  });

  // Redaction proof: the raw command input is emitted to the audit trail. Any
  // secret-shaped value (api_key, token, password, PEM keys, …) is scrubbed to
  // [REDACTED] by the @rtq/audit redaction layer before it reaches the sink.
  rtq.auditor.emit("COMMAND_RECEIVED", `Command received: ${command.capability}`, {
    input: command.input,
    actor,
    origin,
  }, { capability: command.capability });

  /* Stage 2 — Capability registry lookup */
  const s2 = stageTimer("capability", "Capability");
  const capability = rtq.capabilities.get(command.capability);
  if (!capability) {
    s2("failed", `"${command.capability}" is not registered (default-deny)`, { code: "capability.not_registered" });
    return finish("denied", {
      decision: "denied",
      code: "capability.not_registered",
      reason: `Capability "${command.capability}" is not registered`,
    });
  }
  s2("done", `${capability.name} v${capability.version} registered`, {
    description: capability.description,
    baseRisk: capability.risk.base,
    approvalStrategy: capability.approval?.strategy ?? "risk-governed",
    sandboxRequirement: capability.sandbox?.requirement ?? "none",
  });

  /* Stage 3 — Schema validation */
  const s3 = stageTimer("validate", "Validate");
  const validation = validateAgainstSchema(command.input, capability.inputSchema);
  if (!validation.valid) {
    const first = validation.errors[0]?.message ?? "Input validation failed";
    s3("failed", first, { errors: validation.errors });
    return finish("denied", {
      decision: "denied",
      code: "input.invalid",
      reason: first,
    });
  }
  s3("done", "Input conforms to the capability schema", { schema: capability.inputSchema });

  /* Stage 4 — Authoritative risk evaluation */
  const s4 = stageTimer("risk", "Risk");
  const baseLevel = capability.risk.base === "custom" ? "medium" : capability.risk.base;
  const riskEval: RiskEvaluation = rtq.risk.evaluate(capability.risk, baseLevel, {
    origin,
    resource: opts.resource,
    ...options.riskContext,
  });
  s4("done", `Risk = ${riskEval.level.toUpperCase()} (base ${riskEval.baseLevel})`, {
    level: riskEval.level,
    baseLevel: riskEval.baseLevel,
    contributions: riskEval.contributions,
    policyVersion: riskEval.policyVersion,
  });

  /* Stage 5 — Clarification */
  const s5 = stageTimer("clarify", "Clarify");
  const questions: ClarificationQuestion[] = rtq.clarifier.evaluate(command.capability, command.input);
  if (questions.length > 0) {
    s5("skipped", "Missing security-critical parameters — awaiting answers", { questions });
    return finish("clarification_required", {
      decision: "clarification_required",
      questions,
      reason: "Security-critical parameters are missing or ambiguous",
    });
  }
  s5("done", "All security-critical parameters present", { count: 0 });

  /* Stage 6 — Policy evaluation (default-deny) */
  const s6 = stageTimer("policy", "Policy");
  const policyDecision = rtq.policy.evaluate({
    capability: command.capability,
    input: command.input,
    origin,
    risk: riskEval.level,
    resource: opts.resource,
  });
  s6("done", `Policy → ${policyDecision.decision.decision.toUpperCase()}`, {
    decision: policyDecision.decision.decision,
    matchedRules: policyDecision.matchedRules,
    policyVersion: policyDecision.policyVersion,
    reason: policyDecision.decision.reason,
  });

  if (policyDecision.decision.decision === "deny") {
    return finish("denied", policyDecision.decision);
  }
  if (policyDecision.decision.decision === "clarification_required") {
    stages.push(stageSkipped("approve", "Approve", "Blocked by policy-mandated clarification"));
    return finish("clarification_required", {
      decision: "clarification_required",
      questions: policyDecision.decision.questions,
      reason: policyDecision.decision.reason,
    });
  }

  /* Stage 7 — Approval (authorize through RTQ) */
  const s7 = stageTimer("approve", "Approve");
  let auth: AuthorizationResult;
  try {
    auth = await rtq.authorize(command, opts);
  } catch (err) {
    s7("failed", "authorize() threw", { error: String(err) });
    return finish("error", {
      decision: "error" as never,
      code: "authorize.threw",
      reason: err instanceof Error ? err.message : String(err),
    });
  }

  if (auth.decision === "denied") {
    s7("failed", `Denied: ${auth.reason}`, auth);
    return finish("denied", auth);
  }
  if (auth.decision === "clarification_required") {
    s7("skipped", "Clarification required", auth);
    return finish("clarification_required", auth);
  }
  if (auth.decision === "approval_required") {
    s7("skipped", `Approval required (${auth.strategy})`, auth);
    stages.push(stageSkipped("ticket", "Ticket", "Awaiting approval to mint ticket"));
    stages.push(stageSkipped("execute", "Execute", "Awaiting approval"));
    stages.push(stageSkipped("audit", "Audit", "Events recorded as the pipeline progresses"));
    const qrPayload = rtq.getApprovalPayload(auth.challengeId);
    return {
      runId,
      capability: command.capability,
      version: command.version,
      actor,
      origin,
      elapsedMs: Date.now() - start,
      decision: "approval_required",
      result: auth,
      stages,
      approvals: [
        {
          challengeId: auth.challengeId,
          strategy: auth.strategy,
          summary: auth.summary,
          risk: auth.risk,
          origin: auth.origin,
          capability: auth.capability,
          qrPayload,
        },
      ],
      auditEventCount: rtq.auditor.snapshot().length,
      tickerMs: options.stageDelayMs,
    };
  }

  s7("done", `Approval granted (${auth.approvalMethod})`, {
    method: auth.approvalMethod,
    risk: auth.risk,
    expiresAt: auth.expiresAt,
  });

  /* Stage 8 — Ticket */
  const s8 = stageTimer("ticket", "Ticket");
  s8("done", `Ticket ${auth.ticketId.slice(0, 12)}… minted (single-use, HMAC-signed)`, {
    ticketId: auth.ticketId,
    signing: "HMAC-SHA256",
    singleUse: true,
    expiresAt: auth.expiresAt,
    boundInputHash: "sha256:canonical-input",
  });

  /* Stage 9 — Execution */
  const s9 = stageTimer("execute", "Execute");
  const exec = await rtq.execute(auth.ticketId);
  if (!exec.ok) {
    s9("failed", `Execution failed: ${exec.reason}`, exec);
    return finish("error", {
      decision: "error",
      code: exec.code,
      reason: exec.reason,
    });
  }
  if (!exec.result.ok) {
    s9("failed", `Capability returned an error: ${exec.result.error}`, exec.result);
    return finish("error", {
      decision: "error",
      code: exec.result.code ?? "capability.failed",
      reason: exec.result.error,
    });
  }
  s9("done", `Executed in ${exec.sandboxed ? "verified OS sandbox" : "process-local context"}`, {
    data: sanitizeForTransport(exec.result.data),
    sandboxed: exec.sandboxed,
    report: sanitizeForTransport(exec.report),
  });

  /* Stage 10 — Audit */
  const s10 = stageTimer("audit", "Audit");
  const auditEvents = rtq.auditor.snapshot();
  s10("done", `${auditEvents.length} structured events recorded (secrets redacted)`, {
    count: auditEvents.length,
    tail: auditEvents.slice(-6).map((e) => ({ event: e.event, message: e.message })),
  });

  return {
    runId,
    capability: command.capability,
    version: command.version,
    actor,
    origin,
    elapsedMs: Date.now() - start,
    decision: "allowed",
    result: auth,
    stages,
    auditEventCount: auditEvents.length,
    tickerMs: options.stageDelayMs,
  };
  // eslint-disable-next-line no-unreachable
  function finish(
    decision: RunDecision,
    result: unknown,
    extra?: Partial<RunResult>,
  ): RunResult {
    return {
      runId,
      capability: command.capability,
      version: command.version,
      actor,
      origin,
      elapsedMs: Date.now() - start,
      decision,
      result: result as AuthorizationResult,
      stages,
      auditEventCount: rtq.auditor.snapshot().length,
      ...extra,
    };
  }
}

function stageSkipped(key: string, label: string, summary: string): Stage {
  return { key, label, state: "skipped", ms: 0, summary };
}

/* -------------------------------------------------------------------------- */
/* Approval continuation                                                      */
/* -------------------------------------------------------------------------- */

export type ApprovalProof =
  | {
      type: "device_approval";
      approval: {
        challengeId: string;
        decision: "granted" | "denied";
        keyId: string;
        signedAt: number;
        signature: string;
      };
    }
  | { type: "biometric"; verifiedBy: string }
  | { type: "custom"; verified: boolean; detail?: string };

export async function continueApproval(
  runtime: AegisRuntime,
  challengeId: string,
  proof: ApprovalProof,
): Promise<{ decision: string; result: unknown; execution?: unknown }> {
  const { rtq } = runtime;
  const auth = await rtq.submitApproval(challengeId, proof);
  if (auth.decision !== "allowed") {
    return { decision: auth.decision, result: auth };
  }
  const exec = await rtq.execute(auth.ticketId);
  if (!exec.ok) {
    return { decision: "error", result: auth, execution: exec };
  }
  return { decision: "allowed", result: auth, execution: exec };
}

/* -------------------------------------------------------------------------- */
/* Transport helpers                                                          */
/* -------------------------------------------------------------------------- */

function sanitizeForTransport(value: unknown): unknown {
  if (value === undefined) return undefined;
  const json = JSON.stringify(value, (_key, v) => {
    if (typeof v === "string" && v.length > 8_000) return `${v.slice(0, 8_000)}…[truncated]`;
    return v;
  });
  return json === undefined ? undefined : JSON.parse(json);
}