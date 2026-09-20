import { createSandbox, parseChallenge, signDeviceApproval, validateAgainstSchema } from "@rtq/security";
import { listOllamaModels, suggestCommand } from "./ai.js";
import { Router, type Request, type Response } from "express";
import { CAPABILITY_NAMES, CAPABILITIES, secretNames } from "./capabilities.js";
import { config } from "./config.js";
import { continueApproval, runCommand, type RunResult } from "./pipeline.js";
import type { AegisRuntime } from "./rtq.js";
import { AUDIT_DEFAULT_TAIL } from "./rtq.js";
import { listWorkspaceFiles } from "./workspace.js";

/* -------------------------------------------------------------------------- */
/* SSE hub                                                                    */
/* -------------------------------------------------------------------------- */

export type HubEvent =
  | { type: "audit"; seq: number; event: string; message: string; timestamp: number; capability?: string }
  | { type: "run"; runId: string; decision: string; capability: string }
  | { type: "meta"; message: string };

class EventHub {
  private clients = new Set<Response>();
  private heartbeat: ReturnType<typeof setInterval>;

  constructor() {
    this.heartbeat = setInterval(() => {
      for (const res of this.clients) {
        try {
          res.write(`: hb ${Date.now()}\n\n`);
        } catch {
          this.clients.delete(res);
        }
      }
    }, 15_000);
    this.heartbeat.unref?.();
  }

  subscribe(req: Request, res: Response): void {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write(": connected\n\n");
    this.clients.add(res);
    req.on("close", () => this.clients.delete(res));
  }

  broadcast(event: HubEvent): void {
    const payload = JSON.stringify(event);
    for (const res of this.clients) {
      try {
        res.write(`data: ${payload}\n\n`);
      } catch {
        this.clients.delete(res);
      }
    }
  }
}

export const hub = new EventHub();

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function sendRunEvents(run: RunResult): void {
  hub.broadcast({ type: "run", runId: run.runId, decision: run.decision, capability: run.capability });
  run.stages
    .filter((s) => s.key === "audit" || s.key === "execute")
    .forEach((s) => {
      if (s.key === "audit") {
        hub.broadcast({ type: "audit", seq: 0, event: "AUDIT_SNAPSHOT", message: s.summary, timestamp: Date.now() });
      }
    });
}

function auditPayload(runtime: AegisRuntime, sinceSeq: number, limit: number) {
  const events = runtime.rtq.auditor.snapshot();
  const filtered = events.filter((e) => e.seq > sinceSeq);
  return {
    total: events.length,
    since: sinceSeq,
    events: filtered.slice(-limit).map((e) => ({
      seq: e.seq,
      event: e.event,
      message: e.message,
      timestamp: e.timestamp,
      capability: e.capability,
      ticketId: e.ticketId,
      context: e.context,
    })),
  };
}

/* -------------------------------------------------------------------------- */
/* Router                                                                     */
/* -------------------------------------------------------------------------- */

export function buildRouter(runtime: AegisRuntime): Router {
  const router = Router();

  /* Health & metadata ---------------------------------------------------- */
  router.get("/health", (_req, res) => {
    res.json({ ok: true, service: "aegis-rtq", uptime: process.uptime() });
  });

  router.get("/meta", (_req, res) => {
    const rtq = runtime.rtq;
    res.json({
      rtqVersion: "@rtq/security 0.1.0",
      policyVersion: rtq.policy.policyVersion,
      riskPolicyVersion: rtq.risk.policyVersion,
      ticketTTLMs: config.ticketTTLMs,
      capabilities: rtq.capabilities.getRegisteredCapabilities().map((c) => {
        const def = rtq.capabilities.get(c.name);
        return {
          ...c,
          description: def?.description ?? "",
          inputSchema: def?.inputSchema,
          riskFactors: def?.risk,
          sandbox: def?.sandbox,
        };
      }),
      declarations: CAPABILITIES.length,
      originatedFrom: "explicit registration only — no ambient execution",
      policies: runtime.policies.map((p) => ({ ...p })),
      clarifications: runtime.clarifications,
      devices: runtime.devices,
      deviceKeyIds: Object.keys(runtime.deviceKeys),
      workspaceFiles: listWorkspaceFiles(),
      secretNames: secretNames(),
      capabilityNames: CAPABILITY_NAMES,
      origins: ["local", "remote", "mobile", "plugin", "agent", "automation", "unknown"],
      auditEvents: auditPayload(runtime, 0, AUDIT_DEFAULT_TAIL).events,
      diagnostics: rtq.diagnostics(),
    });
  });

  /* Command pipeline ----------------------------------------------------- */
  router.post("/command", async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const capability = String(body.capability ?? "");
    if (!runtime.rtq.capabilities.get(capability)) {
      res.status(400).json({ error: `Unknown capability "${capability}"` });
      return;
    }
    const run = await runCommand(runtime, {
      capability,
      version: typeof body.version === "number" ? body.version : 1,
      input: (body.input ?? {}) as Record<string, unknown>,
      origin: (body.origin as never) ?? "local",
      actor: typeof body.actor === "string" ? body.actor : "operator@aegis.dev",
      resource: typeof body.resource === "string" ? body.resource : undefined,
      stageDelayMs: typeof body.stageDelayMs === "number" ? body.stageDelayMs : 420,
    });
    sendRunEvents(run);
    res.json(run);
  });

  /* Approval continuation — biometric ------------------------------------ */
  router.post("/approval/:challengeId/biometric", async (req: Request, res: Response) => {
    const challengeId = String(req.params.challengeId);
    const verifiedBy = String((req.body ?? {}).verifiedBy ?? "demo-os-biometric");
    const outcome = await continueApproval(runtime, challengeId, { type: "biometric", verifiedBy });
    res.json({ challengeId, verifiedBy, ...outcome });
  });

  /* Approval continuation — simulated enrolled device (QR / device_verification) */
  router.post("/approval/:challengeId/device-scan", async (req: Request, res: Response) => {
    const challengeId = String(req.params.challengeId);
    const decision = (req.body ?? {}).decision === "denied" ? "denied" : "granted";
    const payload = runtime.rtq.getApprovalPayload(challengeId);
    if (!payload) {
      res.status(404).json({ error: "No pending QR challenge for this id" });
      return;
    }
    const parsed = parseChallenge(payload);

    // Simulate the ENROLLED DEVICE (its HMAC key lives in the host keystore).
    // The device parses the QR payload, and the user confirms on-device, then
    // it signs a single-use approval bound to the exact challenge.
    const keyId = Object.keys(runtime.deviceKeys)[0] ?? "";
    const deviceKey = keyId ? runtime.deviceKeys[keyId] : undefined;
    if (!deviceKey) {
      res.status(500).json({ error: "No enrolled device configured on the host" });
      return;
    }
    const signedAt = Date.now();
    const approval = signDeviceApproval(deviceKey, challengeId, decision, keyId, signedAt);

    const outcome = await continueApproval(runtime, challengeId, { type: "device_approval", approval });
    res.json({
      challengeId,
      deviceKeyId: keyId,
      payload,
      parsed: parsed.ok ? parsed.challenge : { error: parsed.reason },
      signedApproval: {
        challengeId: approval.challengeId,
        decision: approval.decision,
        keyId: approval.keyId,
        signedAt: approval.signedAt,
        signature: approval.signature,
      },
      ...outcome,
    });
  });

  /* Approval continuation — device PIN (AEGIS demo) ------------------------ */
  router.post("/approval/:challengeId/pin", async (req: Request, res: Response) => {
    const challengeId = String(req.params.challengeId);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const submitted = String(body.pin ?? "");
    const verified = submitted === config.demoPin;

    if (!verified) {
      res.status(403).json({ error: "Invalid PIN", attemptsRemaining: config.demoPinMaxAttempts - 1 });
      return;
    }

    const decision = body.decision === "denied" ? "denied" : "granted";
    const payload = runtime.rtq.getApprovalPayload(challengeId);
    if (!payload) {
      res.status(404).json({ error: "No pending challenge for this id" });
      return;
    }
    const parseResult = parseChallenge(payload);
    const keyId = Object.keys(runtime.deviceKeys)[0] ?? "";
    const deviceKey = keyId ? runtime.deviceKeys[keyId] : undefined;
    if (!deviceKey) {
      res.status(500).json({ error: "No enrolled device configured on the host" });
      return;
    }
    const signedAt = Date.now();
    const approval = signDeviceApproval(deviceKey, challengeId, decision, keyId, signedAt);
    const outcome = await continueApproval(runtime, challengeId, { type: "device_approval", approval });
    res.json({
      challengeId,
      verifiedBy: "device-pin",
      signedApproval: {
        challengeId: approval.challengeId,
        decision: approval.decision,
        keyId: approval.keyId,
        signedAt: approval.signedAt,
        signature: approval.signature,
      },
      ...outcome,
    });
  });

  /* Generic approval submit (custom / manual proofs) ---------------------- */
  router.post("/approval/:challengeId", async (req: Request, res: Response) => {
    const challengeId = String(req.params.challengeId);
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (body.type === "biometric") {
      const outcome = await continueApproval(runtime, challengeId, {
        type: "biometric",
        verifiedBy: String(body.verifiedBy ?? "demo-os-biometric"),
      });
      res.json(outcome);
      return;
    }
    if (body.type === "device_approval" && (body.approval as Record<string, unknown> | undefined)) {
      const approval = body.approval as {
        challengeId: string;
        decision: "granted" | "denied";
        keyId: string;
        signedAt: number;
        signature: string;
      };
      const outcome = await continueApproval(runtime, challengeId, { type: "device_approval", approval });
      res.json(outcome);
      return;
    }
    if (body.type === "custom") {
      const outcome = await continueApproval(runtime, challengeId, {
        type: "custom",
        verified: body.verified === true,
        detail: typeof body.detail === "string" ? body.detail : undefined,
      });
      res.json(outcome);
      return;
    }
    res.status(400).json({ error: "Unsupported proof type" });
  });

  /* Audit trail ---------------------------------------------------------- */
  router.get("/audit", (req: Request, res: Response) => {
    const sinceSeq = Number(req.query.since ?? 0) || 0;
    const limit = Number(req.query.limit ?? AUDIT_DEFAULT_TAIL) || AUDIT_DEFAULT_TAIL;
    res.json(auditPayload(runtime, sinceSeq, limit));
  });

  /* Live event stream ---------------------------------------------------- */
  router.get("/events", (req: Request, res: Response) => {
    hub.subscribe(req, res);
  });

  /* Policy check helper (lab) -------------------------------------------- */
  router.post("/lab/policy-check", (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const capability = String(body.capability ?? "");
    const input = (body.input ?? {}) as Record<string, unknown>;
    const origin = (body.origin as never) ?? "local";
    const def = runtime.rtq.capabilities.get(capability);
    if (!def) {
      res.status(400).json({ error: `Unknown capability "${capability}"` });
      return;
    }
    const validation = validateAgainstSchema(input, def.inputSchema);
    const baseLevel = def.risk.base === "custom" ? "medium" : def.risk.base;
    const risk = runtime.rtq.risk.evaluate(def.risk, baseLevel, { origin, resource: typeof body.resource === "string" ? body.resource : undefined });
    const questions = runtime.rtq.clarifier.evaluate(capability, input);
    const policy = runtime.rtq.policy.evaluate({ capability, input, origin, risk: risk.level, resource: typeof body.resource === "string" ? body.resource : undefined });
    res.json({
      validation,
      risk,
      questions,
      policy,
      strategyHint: {
        low: "automatic",
        medium: "user_confirmation",
        high: "qr",
        critical: "biometric",
      }[risk.level],
    });
  });

  /* Risk lab -------------------------------------------------------------- */
  router.post("/lab/risk", (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const base = String(body.base ?? "low") as "low" | "medium" | "high" | "critical";
    const evaluation = runtime.rtq.risk.evaluate(
      {
        base,
        reversible: body.reversible !== false,
        dataSensitivity: (body.dataSensitivity as never) ?? "none",
        financialImpact: body.financialImpact === true,
        privilegeImpact: body.privilegeImpact === true,
        requiresNetwork: body.requiresNetwork === true,
        touchesSystem: body.touchesSystem === true,
      },
      base,
      {
        origin: (body.origin as never) ?? "local",
        resource: typeof body.resource === "string" ? body.resource : undefined,
      },
    );
    res.json({ evaluation });
  });

  // AI models list endpoint
  router.get("/ai/models", async (req: Request, res: Response) => {
    const models = await listOllamaModels(runtime);
    res.json(models);
  });

  // AI suggestion endpoint
  router.post("/ai/suggest", async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const intent = String(body.intent ?? "");
    const originHint = String(body.origin ?? "remote");
    const suggestion = await suggestCommand(runtime, intent, originHint);
    res.json(suggestion);
  });



  /* Sandbox diagnostics --------------------------------------------------- */
  router.get("/sandbox", async (_req: Request, res: Response) => {
    try {
      const handle = createSandbox(
        { filesystem: { read: ["/usr/bin"] }, network: "none" },
        { timeoutMs: 2_000 },
      );
      const report = handle.report;
      handle.close();
      res.json({ available: true, report });
    } catch (err) {
      res.json({ available: false, error: (err as Error).message, code: (err as { code?: string }).code });
    }
  });

  /* Diagnostics ------------------------------------------------------------ */
  router.get("/diagnostics", (_req, res) => {
    res.json({ ...runtime.rtq.diagnostics(), config: { ...config, signingKey: "[REDACTED]" } });
  });

  /* Handle unknown routes with RTQ-style default-deny semantics ------------ */
  router.use((_req: Request, res: Response) => {
    res.status(404).json({ decision: "denied", code: "route.not_found", reason: "No such AEGIS route" });
  });

  return router;
}