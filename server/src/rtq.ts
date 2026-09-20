import {
  AuditLogger,
  MemorySink,
  RTQ,
  createRTQ,
  type CapabilityDef,
  type ClarificationRule,
  type DeviceRecord,
  type PolicyRule,
} from "@rtq/security";
import { CAPABILITIES } from "./capabilities.js";
import { config } from "./config.js";

export const RTQ_VERSION = "0.1.0";

/** Enrolled demo device that can approve QR / device-verification challenges. */
const DEMO_DEVICES: DeviceRecord[] = [
  {
    deviceId: "aegis-mobile-1",
    publicKeyJwk: { kty: "OKP", crv: "Ed25519", x: "demo" } as never,
    name: "AEGIS Secure Mobile (Pixel 9)",
    status: "authorized",
    registeredAt: Date.now(),
    platform: "android",
  },
];

/**
 * RTQ policy — declarative, default-DENY. Unlisted capabilities are denied;
 * every rule carries an audit reason.
 */
const POLICIES: PolicyRule[] = [
  { kind: "allow", capability: "files.read", reason: "Workspace reads are safe for all local demand" },
  {
    kind: "allow",
    capability: "files.write",
    when: { path: "/workspace" },
    reason: "Writes confined to the protected demo workspace",
  },
  { kind: "allow", capability: "files.delete", reason: "Delete is allowed only with biometric approval" },
  { kind: "allow", capability: "network.request", reason: "Outbound requests are risk-governed" },
  {
    kind: "deny",
    capability: "network.request",
    when: { field: { name: "url", eq: "https://blocked.example.com" } },
    code: "policy.blocked_domain",
    reason: "blocked.example.com is on the deny list",
  },
  {
    kind: "deny",
    capability: "network.request",
    when: { origin: "unknown" },
    code: "policy.untrusted_origin",
    reason: "Requests from an unknown origin are always denied",
  },
  { kind: "allow", capability: "system.ping", reason: "Liveness probe" },
  { kind: "allow", capability: "system.execute", reason: "Shell execution is ticket + device gated and OS-sandboxed" },
  { kind: "allow", capability: "secrets.reveal", reason: "Secret reveal only with signed device approval" },
  { kind: "allow", capability: "payments.transfer", reason: "Financial ops require biometric approval" },
  { kind: "allow", capability: "database.query", reason: "Read-only analytics queries" },
  {
    kind: "deny",
    capability: "database.query",
    when: { field: { name: "table", eq: "sys.sessions" } },
    code: "policy.system_table",
    reason: "System tables are off-limits to agents",
  },
  { kind: "allow", capability: "dev.echo", reason: "Demo echo capability" },
];

/**
 * Clarification rules — security-critical parameters that must be explicit
 * BEFORE authorization. Without them the pipeline stops at
 * `clarification_required` and no ticket is ever issued.
 */
const CLARIFICATIONS: ClarificationRule[] = [
  {
    capability: "files.delete",
    field: "reason",
    reason: "Deleting a file is irreversible — an explicit reason is required.",
    type: "string",
  },
  {
    capability: "database.query",
    field: "purpose",
    reason: "Queries against personal data need a stated purpose (records retention).",
    type: "string",
    options: ["analytics", "security_review", "compliance", "debugging"],
  },
  {
    capability: "payments.transfer",
    field: "memo",
    reason: "Financial transfers must carry a memo for the ledger.",
    type: "string",
  },
];

/** Device key store — the HMAC keys RTQ uses to verify device approvals. */
const DEVICE_KEYS: Record<string, string> = {
  "aegis-mobile-1": "demo-device-hmac-key-0001-secret-not-for-prod",
};

export interface AegisRuntime {
  rtq: RTQ;
  capabilities: CapabilityDef[];
  policies: PolicyRule[];
  clarifications: ClarificationRule[];
  devices: DeviceRecord[];
  deviceKeys: Record<string, string>;
}

/** Build the AEGIS RTQ runtime. Call once at boot. */
export function buildRuntime(): AegisRuntime {
  const auditor = new AuditLogger(new MemorySink(config.auditMaxEvents));

  const rtq = createRTQ({
    signingKey: config.signingKey,
    ticketTTLMs: config.ticketTTLMs,
    executeTimeoutMs: config.executeTimeoutMs,
    auditor,
    defaultOrigin: "local",
    onUserConfirmation: () => false,
    deviceKeyStore: {
      getDeviceKey(keyId: string): string | Buffer | null {
        return DEVICE_KEYS[keyId] ?? null;
      },
    },
  });

  for (const def of CAPABILITIES) rtq.registerCapability(def);
  rtq.registerPolicy(POLICIES);
  rtq.registerClarification(CLARIFICATIONS);

  return {
    rtq,
    capabilities: CAPABILITIES,
    policies: POLICIES,
    clarifications: CLARIFICATIONS,
    devices: DEMO_DEVICES,
    deviceKeys: DEVICE_KEYS,
  };
}

export const AUDIT_DEFAULT_TAIL = 60;