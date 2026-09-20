import { validateAgainstSchema } from "@rtq/security";
import { config } from "./config.js";
import type { AegisRuntime } from "./rtq.js";

export type AiSource = "ollama" | "planner";

export interface AiProposal {
  capability: string;
  input: Record<string, unknown>;
  origin: string;
  explanation: string;
}

export interface AiEvaluationResult {
  validation: { valid: boolean; errors: string[] };
  risk: { level: string; base: string; contributions: { label: string; value: number; note?: string }[] };
  questions: { field: string; question: string; options?: string[] }[];
  policy: {
    decision: string;
    reason?: string;
    matchedRules: { id: string; name: string; effect: string }[];
  };
  strategyHint: string;
}

export interface AiSuggestionItem {
  intent: string;
  source: AiSource;
  model: string | null;
  latencyMs: number;
  proposal: AiProposal;
  evaluation: AiEvaluationResult;
}

export interface OllamaModelInfo {
  name: string;
  size: string;
  modifiedAt?: string;
}

export interface OllamaModelsResponse {
  available: boolean;
  baseUrl: string;
  defaultModel: string;
  models: OllamaModelInfo[];
}

let modelsCache: { at: number; models: OllamaModelsResponse } | null = null;

export async function listOllamaModels(_runtime: AegisRuntime): Promise<OllamaModelsResponse> {
  if (modelsCache && Date.now() - modelsCache.at < config.ollama.modelsCacheMs) {
    return modelsCache.models;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2000);
  try {
    const res = await fetch(`${config.ollama.baseUrl}/api/tags`, { signal: ctrl.signal });
    if (!res.ok) throw new Error("tags non-ok");
    const tags = (await res.json()) as { models?: { name: string; size?: number; modified_at?: string }[] };
    const models: OllamaModelInfo[] = (tags.models ?? []).map((m) => ({
      name: m.name,
      size: m.size !== undefined ? `${(m.size / 1e9).toFixed(1)}GB` : "?",
      modifiedAt: m.modified_at,
    }));
    const out: OllamaModelsResponse = {
      available: true,
      baseUrl: config.ollama.baseUrl,
      defaultModel: config.ollama.model,
      models,
    };
    modelsCache = { at: Date.now(), models: out };
    return out;
  } catch {
    return {
      available: false,
      baseUrl: config.ollama.baseUrl,
      defaultModel: config.ollama.model,
      models: [],
    };
  } finally {
    clearTimeout(timer);
  }
}

interface PlanRule {
  re: RegExp;
  capability: string;
  build: (intent: string) => Record<string, unknown>;
}

const PLAN_RULES: PlanRule[] = [
  {
    re: /(list|see|show|read|open|view|cat)\s+(the\s+)?(file|workspace|welcome|notes)/i,
    capability: "files.read",
    build: (i) => ({ path: "welcome.txt", reason: `AI planner: read workspace for "${i}"` }),
  },
  {
    re: /(write|create|save|add|make|append)\s+(a|an|the)?\s*file|note/i,
    capability: "files.write",
    build: (i) => ({ path: "notes/ai-copilot.md", content: `# AI copilot note\n\nFrom intent: ${i}`, reason: "AI copilot demo" }),
  },
  {
    re: /(delete|remove|trash|clean up|rm)\s+(the\s+)?(file|notes|meeting)/i,
    capability: "files.delete",
    build: () => ({ path: "notes/meeting-notes.md", reason: "AI-planned cleanup (approval required)" }),
  },
  {
    re: /(execute|run|shell|command|invoke|bash)\s+(the\s+)?(command|script|ls|echo)|ls -la|uname|whoami/i,
    capability: "system.execute",
    build: (i) => ({ command: "ls -la && uname -a", reason: `AI copilot command: ${i}` }),
  },
  {
    re: /(ping|health|alive|up|status|diagnos)/i,
    capability: "system.ping",
    build: (i) => ({ label: `copilot-${i.slice(0, 24)}` }),
  },
  {
    re: /(reveal|show|print|peek)\s+(the\s+)?(secret|key|token|password)/i,
    capability: "secrets.reveal",
    build: () => ({ name: "DB_PASSWORD" }),
  },
  {
    re: /(transfer|send|pay|move)\s+(money|funds|payment|usd|inr)/i,
    capability: "payments.transfer",
    build: () => ({ amount: 100, currency: "USD", to: "alice@acme.dev", reason: "AI copilot demo transfer" }),
  },
  {
    re: /(query|select|read|run)\s+(the\s+)?(database|db|sql|table)/i,
    capability: "database.query",
    build: (i) => ({ table: "orders", query: `SELECT * FROM orders WHERE id <= 10 -- ${i}` }),
  },
  {
    re: /(fetch|request|curl|http|get\s+https)/i,
    capability: "network.request",
    build: () => ({ url: "https://httpbin.org/get" }),
  },
  {
    re: /(echo|print)\s+(the\s+)?(message|hello|hi|ping)/i,
    capability: "dev.echo",
    build: (i) => ({ message: `copilot: "${i}"` }),
  },
];

function fallbackPlanner(intent: string, originHint: string): AiProposal {
  for (const rule of PLAN_RULES) {
    if (rule.re.test(intent)) {
      return {
        capability: rule.capability,
        input: rule.build(intent),
        origin: originHint,
        explanation: `Planner matched "${intent}" -> ${rule.capability}`,
      };
    }
  }
  return {
    capability: "system.ping",
    input: { label: "copilot-smoke" },
    origin: originHint,
    explanation: `No rule matched "${intent}"; fell back to system.ping`,
  };
}

async function suggestWithOllama(
  runtime: AegisRuntime,
  intent: string,
  originHint: string,
): Promise<{ proposal: AiProposal; model: string } | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.ollama.timeoutMs);
  try {
    const caps = runtime.rtq.capabilities.getRegisteredCapabilities();
    const manifest = caps.map((c) => `- ${c.name}: ${runtime.rtq.capabilities.get(c.name)?.description ?? ""}`).join("\n");
    const system = [
      "You are the RTQ copilot inside a capability-security policy engine.",
      "Map user intent to exactly ONE registered capability with valid input.",
      "Registered capabilities:",
      manifest,
      "Reply with ONLY valid JSON shaped:",
      '{"capability":"<name>","input":{...},"origin":"remote","explanation":"<short>"}',
    ].join("\n");

    const res = await fetch(`${config.ollama.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.ollama.model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: `Intent: "${intent}" (origin hint: ${originHint})` },
        ],
        stream: false,
        format: "json",
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { message?: { content?: string } };
    const content = body?.message?.content?.trim() ?? "";
    const parsed = JSON.parse(content) as { capability?: string; input?: Record<string, unknown>; origin?: string; explanation?: string };
    if (!parsed.capability || !runtime.rtq.capabilities.get(parsed.capability)) return null;
    return {
      model: config.ollama.model,
      proposal: {
        capability: parsed.capability,
        input: parsed.input ?? {},
        origin: parsed.origin ?? originHint,
        explanation: parsed.explanation ?? `Ollama mapped intent to ${parsed.capability}`,
      },
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function evaluateThroughRtq(runtime: AegisRuntime, proposal: AiProposal): AiEvaluationResult {
  const def = runtime.rtq.capabilities.get(proposal.capability);
  const validation = def
    ? validateAgainstSchema(proposal.input, def.inputSchema)
    : { valid: false, errors: [{ path: "", message: `capability "${proposal.capability}" not registered` }] };

  const baseLevel = def?.risk?.base === "custom" ? "medium" : def?.risk?.base ?? "low";
  const resource = typeof proposal.input.resource === "string" ? proposal.input.resource : undefined;
  const risk = runtime.rtq.risk.evaluate(def?.risk ?? { base: "low" }, baseLevel, { origin: proposal.origin as never, resource });
  const questions = runtime.rtq.clarifier.evaluate(proposal.capability, proposal.input);
  const policyResult = runtime.rtq.policy.evaluate({
    capability: proposal.capability,
    input: proposal.input,
    origin: proposal.origin as never,
    risk: risk.level,
    resource,
  });

  const decision = policyResult.decision.decision;
  const reason = policyResult.decision.reason;
  const strategyHint =
    decision === "allow"
      ? "automatic"
      : def?.approval?.strategy ??
        ({ low: "automatic", medium: "user_confirmation", high: "qr", critical: "biometric" } as const)[risk.level] ??
        "user_confirmation";

  return {
    validation: {
      valid: validation.valid,
      errors: (!validation.valid ? validation.errors ?? [] : []).map((e) =>
        typeof e === "string" ? e : (e as { message?: string }).message ?? JSON.stringify(e),
      ),
    },
    risk: {
      level: risk.level,
      base: risk.baseLevel,
      contributions: (risk.contributions ?? []).map((c) => ({
        label: c.factor,
        value: ({ low: 10, medium: 30, high: 60, critical: 90 } as const)[risk.level] ?? 30,
        note: c.detail,
      })),
    },
    questions: questions.map((q) => ({ field: q.field, question: q.reason, options: q.options ? [...q.options] : undefined })),
    policy: {
      decision,
      reason,
      matchedRules: (policyResult.matchedRules ?? []).map((ruleId) => ({
        id: ruleId,
        name: ruleId,
        effect: ruleId?.toLowerCase().includes("deny") ? "deny" : "allow",
      })),
    },
    strategyHint,
  };
}

export async function suggestCommand(
  runtime: AegisRuntime,
  intent: string,
  originHint?: string,
): Promise<AiSuggestionItem> {
  const started = Date.now();
  const origin = originHint ?? "remote";
  const ollama = await suggestWithOllama(runtime, intent, origin);
  const proposal = ollama?.proposal ?? fallbackPlanner(intent, origin);
  const source: AiSource = ollama ? "ollama" : "planner";

  return {
    intent,
    source,
    model: ollama?.model ?? null,
    latencyMs: Date.now() - started,
    proposal,
    evaluation: evaluateThroughRtq(runtime, proposal),
  };
}
