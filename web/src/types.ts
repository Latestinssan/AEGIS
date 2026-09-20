export type RiskLevel = "low" | "medium" | "high" | "critical";
export type Origin =
  | "local"
  | "remote"
  | "mobile"
  | "plugin"
  | "agent"
  | "automation"
  | "unknown";
export type ApprovalStrategy =
  | "automatic"
  | "user_confirmation"
  | "device_verification"
  | "biometric"
  | "qr"
  | "custom";

export interface PolicyRule {
  kind: "allow" | "deny" | "override" | "requireApproval" | "requireVerification" | "requireClarification";
  capability: string;
  reason: string;
  code?: string;
  risk?: RiskLevel;
  strategy?: ApprovalStrategy;
  when?: {
    path?: string;
    origin?: Origin | Origin[];
    riskAtLeast?: RiskLevel;
    field?: { name: string; eq?: unknown; exists?: boolean };
  };
}

export interface ClarificationRule {
  capability: string;
  field: string;
  reason: string;
  type?: "string" | "number" | "path" | "enum" | "confirmation";
  options?: string[];
}

export interface ClarificationQuestion {
  field: string;
  reason: string;
  type?: "string" | "number" | "path" | "enum" | "confirmation";
  options?: string[];
}

export interface CapabilityInfo {
  name: string;
  version: number;
  description: string;
  baseRisk: RiskLevel | "custom";
  approvalStrategy: ApprovalStrategy;
  sandboxRequirement: string;
  inputSchema: Record<string, unknown>;
  riskFactors: Record<string, unknown>;
  sandbox?: Record<string, unknown>;
}

export interface AuditEvent {
  seq: number;
  event: string;
  message: string;
  timestamp: number;
  capability?: string;
  ticketId?: string;
  context: Record<string, unknown>;
}

export interface Meta {
  rtqVersion: string;
  policyVersion: string;
  riskPolicyVersion: string;
  ticketTTLMs: number;
  capabilities: CapabilityInfo[];
  policies: PolicyRule[];
  clarifications: ClarificationRule[];
  devices: { deviceId: string; name: string; platform?: string; status: string }[];
  deviceKeyIds: string[];
  workspaceFiles: string[];
  secretNames: string[];
  capabilityNames: string[];
  origins: Origin[];
  auditEvents: AuditEvent[];
  diagnostics: Record<string, unknown>;
}

export type StageState = "pending" | "active" | "done" | "failed" | "skipped";

export interface Stage {
  key: string;
  label: string;
  state: StageState;
  ms: number;
  summary: string;
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
  result: Record<string, unknown>;
  stages: Stage[];
  approvals?: ApprovalInfo[];
  auditEventCount: number;
  tickerMs?: number;
}

export interface LabPolicyResult {
  validation: { valid: boolean; errors?: { path: string; message: string }[] };
  risk: {
    level: RiskLevel;
    baseLevel: RiskLevel;
    contributions: { factor: string; detail?: string }[];
    policyVersion: string;
  };
  questions: ClarificationQuestion[];
  policy: {
    decision: { decision: string; reason: string; code?: string; strategy?: string };
    matchedRules: string[];
    policyVersion: string;
  };
  strategyHint: ApprovalStrategy;
}

export interface LabRiskResult {
  evaluation: {
    level: RiskLevel;
    baseLevel: RiskLevel;
    contributions: { factor: string; detail?: string }[];
  };
}



export interface OllamaModelInfo {
  name: string;
  size: string;
  modifiedAt?: string;
}

export interface AiModels {
  available: boolean;
  baseUrl: string;
  defaultModel: string;
  models: OllamaModelInfo[];
}

export interface AiProposal {
  capability: string;
  input: Record<string, unknown>;
  origin: string;
  explanation: string;
}

export interface AiSuggestionItem {
  intent: string;
  source: string;
  model: string | null;
  latencyMs: number;
  proposal: AiProposal;
  evaluation: Record<string, unknown>;
}
