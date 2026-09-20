import type { CapabilityDef, ExecutionContext } from "@rtq/security";
import {
  deleteWorkspaceFile,
  getSecret,
  listWorkspaceFiles,
  readWorkspaceFile,
  secretNames,
  writeWorkspaceFile,
} from "./workspace.js";

/**
 * Capability implementations.
 *
 * In RTQ each capability is the ONLY executable surface: an explicitly
 * registered operation with a validated schema, authoritative risk factors,
 * an approval strategy and a sandbox boundary. The `execute` handlers below
 * are the host's trusted computing base — everything around them (risk,
 * policy, tickets, approvals, sandboxing, audit) is enforced by RTQ.
 */

export const capabilityRegistry: Record<string, CapabilityDef> = {};

function register(def: CapabilityDef): void {
  if (capabilityRegistry[def.name]) {
    throw new Error(`Duplicate capability ${def.name}`);
  }
  capabilityRegistry[def.name] = def;
}

type Handler = (ctx: ExecutionContext, input: Record<string, unknown>) => Promise<{
  ok: true;
  data?: unknown;
} | {
  ok: false;
  error: string;
  code?: string;
}>;

function handler(fn: Handler): CapabilityDef["execute"] {
  return fn;
}

/** Copy a record payload into an ExecutionResult.success shape. */
function okData(data: unknown): { ok: true; data?: unknown } {
  return { ok: true, data };
}

// ---------------------------------------------------------------------------
// files.read — low risk, automatic approval, workspace-only reads
// ---------------------------------------------------------------------------
register({
  name: "files.read",
  version: 1,
  description: "Read a file inside the protected demo workspace",
  inputSchema: {
    type: "object",
    properties: { path: { type: "string" } },
    required: ["path"],
    additionalProperties: false,
  },
  risk: { base: "low" },
  approval: { strategy: "automatic" },
  sandbox: {
    filesystem: { read: ["$WORKSPACE"] },
    network: "none",
    requirement: "recommended",
  },
  execute: handler(async (_ctx, input) => {
    const { path } = input as { path: string };
    try {
      const content = readWorkspaceFile(path);
      return okData({ path, bytes: content.length, content });
    } catch (err) {
      return fail("files.read", err);
    }
  }),
});

// ---------------------------------------------------------------------------
// files.write — medium risk, automatic approval, workspace-only writes
// ---------------------------------------------------------------------------
register({
  name: "files.write",
  version: 1,
  description: "Create or overwrite a file inside the protected demo workspace",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string" },
      content: { type: "string" },
    },
    required: ["path", "content"],
    additionalProperties: false,
  },
  risk: { base: "medium", reversible: true, dataSensitivity: "none" },
  approval: { strategy: "automatic" },
  sandbox: {
    filesystem: { read: ["$WORKSPACE"], write: ["$WORKSPACE"] },
    network: "none",
    requirement: "recommended",
  },
  execute: handler(async (_ctx, input) => {
    const { path, content } = input as { path: string; content: string };
    try {
      writeWorkspaceFile(path, content);
      return okData({ path, written: content.length });
    } catch (err) {
      return fail("files.write", err);
    }
  }),
});

// ---------------------------------------------------------------------------
// files.delete — high risk, irreversible + personal data, biometric approval
// ---------------------------------------------------------------------------
register({
  name: "files.delete",
  version: 1,
  description:
    "Irreversibly delete a file. Requires an explicit reason and biometric approval.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string" },
      reason: { type: "string" },
    },
    required: ["path"],
    additionalProperties: false,
  },
  risk: { base: "high", reversible: false, dataSensitivity: "personal" },
  approval: { strategy: "biometric" },
  sandbox: {
    filesystem: { write: ["$WORKSPACE"] },
    network: "none",
    requirement: "required",
  },
  execute: handler(async (_ctx, input) => {
    const { path } = input as { path: string };
    try {
      deleteWorkspaceFile(path);
      return okData({ path, deleted: true });
    } catch (err) {
      return fail("files.delete", err);
    }
  }),
});

// ---------------------------------------------------------------------------
// network.request — medium risk, needs network; approval decided by risk
// ---------------------------------------------------------------------------
register({
  name: "network.request",
  version: 1,
  description: "Issue an outbound HTTPS request to a public endpoint",
  inputSchema: {
    type: "object",
    properties: {
      url: { type: "string" },
      method: { type: "string", enum: ["GET", "HEAD"] },
    },
    required: ["url"],
    additionalProperties: false,
  },
  risk: { base: "medium", requiresNetwork: true, reversible: true },
  approval: { strategy: "automatic" },
  sandbox: {
    filesystem: { read: ["$WORKSPACE"] },
    network: { allow: ["httpbin.org", "jsonplaceholder.typicode.com", "api.github.com"] },
    requirement: "required",
  },
  execute: handler(async (_ctx, input) => {
    const { url: rawUrl, method } = input as { url: string; method?: "GET" | "HEAD" };
    const httpMethod = method ?? "GET";
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      return { ok: false, error: "Invalid URL", code: "URL_INVALID" };
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return { ok: false, error: "Only http(s) URLs allowed", code: "PROTOCOL_DENIED" };
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8_000);
    try {
      const res = await fetch(url, {
        method: httpMethod,
        signal: ctrl.signal,
        headers: { "user-agent": "aegis-rtq-demo/1.0" },
      });
      const text = (await res.text()).slice(0, 2_000);
      return okData({
        url: url.toString(),
        status: res.status,
        statusText: res.statusText,
        byteLength: text.length,
        bodyPreview: text,
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return { ok: false, error: "Request timed out after 8s", code: "TIMEOUT" };
      }
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Fetch failed",
        code: "FETCH_FAILED",
      };
    } finally {
      clearTimeout(timer);
    }
  }),
});

// ---------------------------------------------------------------------------
// system.ping — low risk, automatic
// ---------------------------------------------------------------------------
register({
  name: "system.ping",
  version: 1,
  description: "Verify the AEGIS runtime is alive (liveness probe)",
  inputSchema: {
    type: "object",
    properties: { label: { type: "string" } },
    additionalProperties: false,
  },
  risk: { base: "low" },
  approval: { strategy: "automatic" },
  execute: handler(async (ctx, input) => {
    const label = (input as { label?: string }).label ?? "pong";
    return okData({
      pong: true,
      label,
      actor: ctx.actor,
      origin: ctx.origin,
      risk: ctx.risk,
      ticket: ctx.ticketId.slice(0, 8),
      timestamp: Date.now(),
    });
  }),
});

// ---------------------------------------------------------------------------
// system.execute — CRITICAL, touches system, device-verified (QR) approval.
// The handler runs the shell command inside a REAL OS sandbox (Seatbelt on
// macOS / bubblewrap on Linux / AppContainer on Windows).
// ---------------------------------------------------------------------------
register({
  name: "system.execute",
  version: 1,
  description:
    "Run a shell command inside the verified OS sandbox (no network, workspace-only filesystem)",
  inputSchema: {
    type: "object",
    properties: { command: { type: "string" } },
    required: ["command"],
    additionalProperties: false,
  },
  risk: { base: "critical", touchesSystem: true, reversible: false },
  approval: { strategy: "device_verification" },
  sandbox: {
    filesystem: { read: ["$WORKSPACE"], write: ["$WORKSPACE"] },
    network: "none",
    processes: { spawn: false },
    environment: { allow: ["PATH", "HOME"], deny: ["RTQ_SIGNING_KEY"] },
    requirement: "required",
  },
  execute: handler(async (_ctx, input) => {
    const { command } = input as { command: string };
    const { runSandboxedCommand } = await import("./sandbox-runner.js");
    const result = await runSandboxedCommand(command);
    if (!result.ok) {
      return {
        ok: false,
        error: result.error ?? "Sandboxed execution failed",
        code: result.code ?? "SANDBOX_FAILED",
      };
    }
    return okData(result.data);
  }),
});

// ---------------------------------------------------------------------------
// secrets.reveal — CRITICAL, secret data, QR device approval
// ---------------------------------------------------------------------------
register({
  name: "secrets.reveal",
  version: 1,
  description:
    "Reveal a demo secret. Only after a signed device approval (QR challenge). Audit output is automatically redacted.",
  inputSchema: {
    type: "object",
    properties: { name: { type: "string" }, prove: { type: "string" } },
    required: ["name"],
    additionalProperties: false,
  },
  risk: { base: "critical", dataSensitivity: "secret" },
  approval: { strategy: "qr" },
  execute: handler(async (_ctx, input) => {
    const { name, prove } = input as { name: string; prove?: string };
    if (prove) {
      // The 'prove' field is deliberately a secret-shaped value: it must appear
      // REDACTED in the audit trail.
      void prove;
    }
    try {
      const value = getSecret(name);
      return okData({
        name,
        value,
        hint: "The audit trail redacts this automatically.",
      });
    } catch (err) {
      return fail("secrets.reveal", err);
    }
  }),
});

// ---------------------------------------------------------------------------
// payments.transfer — high risk + financial impact, biometric approval
// ---------------------------------------------------------------------------
register({
  name: "payments.transfer",
  version: 1,
  description:
    "Transfer funds between demo accounts. Financial impact → biometric approval + memo. Totally fake.",
  inputSchema: {
    type: "object",
    properties: {
      amount: { type: "number", minimum: 0.01 },
      currency: { type: "string", enum: ["USD", "EUR", "GBP"] },
      to: { type: "string" },
      memo: { type: "string" },
    },
    required: ["amount", "currency", "to"],
    additionalProperties: false,
  },
  risk: {
    base: "high",
    financialImpact: true,
    reversible: false,
    dataSensitivity: "personal",
  },
  approval: { strategy: "biometric" },
  execute: handler(async (_ctx, input) => {
    const { amount, currency, to } = input as {
      amount: number;
      currency: string;
      to: string;
    };
    const id = `txn_${Math.random().toString(36).slice(2, 10)}`;
    return okData({
      transactionId: id,
      amount,
      currency,
      to,
      status: "settled",
      note: "Demo ledger only — no real money moved.",
    });
  }),
});

// ---------------------------------------------------------------------------
// database.query — medium risk; purpose required (clarification), sensitive
// tables denied by policy
// ---------------------------------------------------------------------------
register({
  name: "database.query",
  version: 1,
  description: "Run a read-only query against the demo analytics database",
  inputSchema: {
    type: "object",
    properties: {
      table: { type: "string", enum: ["events", "sessions", "users", "sys.sessions"] },
      query: { type: "string" },
      purpose: { type: "string" },
    },
    required: ["table", "query"],
    additionalProperties: false,
  },
  risk: { base: "medium", dataSensitivity: "personal", reversible: true },
  approval: { strategy: "automatic" },
  execute: handler(async (_ctx, input) => {
    const { table, query } = input as { table: string; query: string };
    const rows: Record<string, number> = {
      events: 12_482,
      sessions: 3_919,
      users: 1_204,
      "sys.sessions": 7,
    };
    return okData({
      table,
      rows: rows[table] ?? 0,
      columns: ["id", "ts", "payload"],
      sample: `EXPLAIN ${query}`,
    });
  }),
});

// ---------------------------------------------------------------------------
// dev.echo — low risk; demonstrates how secret-shaped input fields are
// automatically REDACTED in the audit trail
// ---------------------------------------------------------------------------
register({
  name: "dev.echo",
  version: 1,
  description: "Echo the input back, proving audit redaction of secret fields",
  inputSchema: {
    type: "object",
    properties: {
      message: { type: "string" },
      api_key: { type: "string" },
    },
    required: ["message"],
    additionalProperties: false,
  },
  risk: { base: "low" },
  approval: { strategy: "automatic" },
  execute: handler(async (_ctx, input) => {
    const { message } = input as { message: string };
    return okData({
      echoed: message,
      redaction: "audit trail shows [REDACTED]",
    });
  }),
});

function fail(capability: string, err: unknown): { ok: false; error: string; code?: string } {
  const message = err instanceof Error ? err.message : String(err);
  if (message === "PATH_ESCAPE") {
    return {
      ok: false,
      error: "Path escapes the protected workspace — blocked by path policy + OS sandbox.",
      code: "PATH_ESCAPE_DENIED",
    };
  }
  if (message === "NOT_FOUND") {
    return { ok: false, error: "File not found in workspace", code: "NOT_FOUND" };
  }
  if (message === "UNKNOWN_SECRET") {
    return { ok: false, error: "Unknown secret name", code: "UNKNOWN_SECRET" };
  }
  return { ok: false, error: message, code: `${capability}.failed` };
}

/** Ordered list for registrations (display order in the UI). */
export const CAPABILITY_NAMES = Object.keys(capabilityRegistry);
export const CAPABILITIES: CapabilityDef[] = CAPABILITY_NAMES.map((n) => capabilityRegistry[n]);

export { secretNames, listWorkspaceFiles };
export type { ExecutionContext };