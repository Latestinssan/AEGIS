import type { AuditEvent, LabPolicyResult, LabRiskResult, Meta, RunResult } from "./types";

const json = async <T>(res: Promise<Response>): Promise<T> => {
  const r = await res;
  if (!r.ok) {
    let body: unknown;
    try {
      body = await r.json();
    } catch {
      body = await r.text();
    }
    throw new ApiError(r.status, body);
  }
  return (await r.json()) as T;
};

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown) {
    super(`AEGIS API error ${status}`);
    this.status = status;
    this.body = body;
  }
}

const API = "/api";

export const api = {
  meta: () => json<Meta>(fetch(`${API}/meta`)),
  health: () => json<{ ok: boolean; service: string; uptime: number }>(fetch(`${API}/health`)),

  runCommand: (payload: {
    capability: string;
    version?: number;
    input: Record<string, unknown>;
    origin?: string;
    actor?: string;
    resource?: string;
    stageDelayMs?: number;
  }) =>
    json<RunResult>(
      fetch(`${API}/command`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }),
    ),

  biometricApprove: (challengeId: string, verifiedBy: string) =>
    json<Record<string, unknown>>(
      fetch(`${API}/approval/${challengeId}/biometric`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ verifiedBy }),
      }),
    ),

  deviceScan: (challengeId: string, decision: "granted" | "denied" = "granted") =>
    json<Record<string, unknown>>(
      fetch(`${API}/approval/${challengeId}/device-scan`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision }),
      }),
    ),

  pinApprove: (challengeId: string, pin: string, decision: "granted" | "denied" = "granted") =>
    json<Record<string, unknown>>(
      fetch(`${API}/approval/${challengeId}/pin`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pin, decision }),
      }),
    ),

  aiModels: () =>
    json<{ available: boolean; baseUrl: string; defaultModel: string; models: { name: string; size: string }[] }>(
      fetch(`${API}/ai/models`),
    ),

  aiSuggest: (intent: string, origin?: string) =>
    json<{
      intent: string;
      source: string;
      model: string | null;
      latencyMs: number;
      proposal: { capability: string; input: Record<string, unknown>; origin: string; explanation: string };
      evaluation: Record<string, unknown>;
    }>(
      fetch(`${API}/ai/suggest`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ intent, origin }),
      }),
    ),

  submitApproval: (challengeId: string, proof: Record<string, unknown>) =>
    json<Record<string, unknown>>(
      fetch(`${API}/approval/${challengeId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(proof),
      }),
    ),

  audit: (since = 0, limit = 80) =>
    json<{ total: number; since: number; events: AuditEvent[] }>(
      fetch(`${API}/audit?since=${since}&limit=${limit}`),
    ),

  policyCheck: (payload: {
    capability: string;
    input: Record<string, unknown>;
    origin?: string;
    resource?: string;
  }) =>
    json<LabPolicyResult>(
      fetch(`${API}/lab/policy-check`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }),
    ),

  riskLab: (payload: Record<string, unknown>) =>
    json<LabRiskResult>(
      fetch(`${API}/lab/risk`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      }),
    ),

  sandbox: () =>
    json<{ available: boolean; report?: Record<string, unknown>; error?: string }>(
      fetch(`${API}/sandbox`),
    ),
};