import type { Origin } from "./types";

export interface Preset {
  label: string;
  note: string;
  input: Record<string, unknown>;
  origin?: Origin;
}

export const PRESETS: Record<string, Preset[]> = {
  "files.read": [
    { label: "Read welcome", note: "low risk · auto allow", input: { path: "welcome.txt" } },
    { label: "Read config", note: "workspace JSON", input: { path: "deploy/config.json" } },
    { label: "Escape attempt", note: "path policy demo", input: { path: "../config.ts" } },
  ],
  "files.write": [
    { label: "Write note", note: "medium · auto", input: { path: "notes/hello-world.md", content: "# Hello from AEGIS\nWritten through a ticket-gated capability." } },
  ],
  "files.delete": [
    { label: "Delete w/o reason", note: "clarification demo", input: { path: "notes/meeting-notes.md" } },
    { label: "Delete w/ reason", note: "biometric approval", input: { path: "notes/meeting-notes.md", reason: "Cleanup per retention policy" } },
  ],
  "network.request": [
    { label: "Public GET", note: "auto allow (local)", input: { url: "https://httpbin.org/get" } },
    { label: "Remote agent GET", note: "risk ⤴ origin → QR", input: { url: "https://httpbin.org/get" }, origin: "remote" },
    { label: "Blocked domain", note: "policy deny", input: { url: "https://blocked.example.com" } },
    { label: "Unknown origin", note: "origin policy deny", input: { url: "https://httpbin.org/get" }, origin: "unknown" },
  ],
  "system.ping": [
    { label: "Ping", note: "low · auto allow", input: { label: "hello from AEGIS" } },
  ],
  "system.execute": [
    { label: "Inspect sandbox", note: "device-verified", input: { command: "uname -a && pwd && whoami" } },
    { label: "Try network", note: "OS network isolation", input: { command: "curl -s -m 3 https://example.com; echo exit=$?" } },
    { label: "List workspace", note: "read inside boundary", input: { command: "ls -la && cat welcome.txt" } },
    { label: "Write to workspace", note: "workspace-only fs", input: { command: "echo dados > inside.txt && cat inside.txt" } },
  ],
  "secrets.reveal": [
    { label: "DB password", note: "QR device approval", input: { name: "DB_PASSWORD" } },
    { label: "Payment key", note: "QR device approval", input: { name: "PAYMENT_KEY" } },
  ],
  "payments.transfer": [
    { label: "Transfer no memo", note: "clarification demo", input: { amount: 1250, currency: "USD", to: "0xVendorAcme" } },
    { label: "Transfer w/ memo", note: "biometric approval", input: { amount: 1250, currency: "USD", to: "0xVendorAcme", memo: "Q3 settlement" } },
  ],
  "database.query": [
    { label: "Events w/o purpose", note: "clarification demo", input: { table: "events", query: "SELECT * FROM events LIMIT 5" } },
    { label: "Events w/ purpose", note: "auto allow", input: { table: "events", query: "SELECT * FROM events LIMIT 5", purpose: "security_review" } },
    { label: "System table", note: "policy deny", input: { table: "sys.sessions", query: "SELECT * FROM sys.sessions", purpose: "debugging" } },
  ],
  "dev.echo": [
    { label: "Echo w/ api key", note: "audit redaction", input: { message: "hello", api_key: "sk_live_8f4c1a2b9d0e-demo-secret" } },
    { label: "Plain echo", note: "low · auto allow", input: { message: "plain hello" } },
  ],
};

export const ACTORS = [
  { id: "sarah@acme.dev", label: "Sarah Chen", role: "human · platform security" },
  { id: "ci-bot@acme.dev", label: "CI Bot", role: "automation · pipelines" },
  { id: "orchestrator@acme.dev", label: "Orchestrator", role: "agent · multi-step" },
  { id: "analyst@acme.dev", label: "Analyst", role: "plugin · extension" },
];

export const ORIGIN_HINTS: Record<Origin, string> = {
  local: "trusted local session — no escalation",
  remote: "remote caller — risk +1",
  mobile: "mobile client — risk +1",
  plugin: "third-party plugin — risk +1",
  agent: "autonomous agent — risk +1",
  automation: "headless automation — risk +1",
  unknown: "unattributable — always dissatisfied",
};

/** Guided tour steps. Each step runs a full pipeline trace in the UI. */
export interface TourStep {
  label: string;
  capability: string;
  input: Record<string, unknown>;
  origin?: Origin;
  actor?: string;
  pitch: string;
}

export const TOUR: TourStep[] = [
  {
    label: "Liveness · zero trust",
    capability: "system.ping",
    input: { label: "ping from the tour" },
    origin: "local",
    actor: "sarah@acme.dev",
    pitch: "Low risk → scheme validated → policy allow → automatic approval → HMAC ticket → run.",
  },
  {
    label: "Read a workspace file",
    capability: "files.read",
    input: { path: "welcome.txt" },
    origin: "local",
    actor: "sarah@acme.dev",
    pitch: "Capabilities are explicitly registered; nothing executes ambiently.",
  },
  {
    label: "Deletion needs a reason",
    capability: "files.delete",
    input: { path: "notes/meeting-notes.md" },
    origin: "local",
    actor: "sarah@acme.dev",
    pitch: "Irreversible op: missing security-critical parameter → clarification, no ticket.",
  },
  {
    label: "Remote network call",
    capability: "network.request",
    input: { url: "https://httpbin.org/get" },
    origin: "remote",
    actor: "ci-bot@acme.dev",
    pitch: "Remote origin escalates risk → QR device approval required.",
  },
  {
    label: "Reveal a secret",
    capability: "secrets.reveal",
    input: { name: "DB_PASSWORD" },
    origin: "remote",
    actor: "ci-bot@acme.dev",
    pitch: "Critical data: QR challenge → enrolled device signs → ticket → redacted audit.",
  },
  {
    label: "Shell in the sandbox",
    capability: "system.execute",
    input: { command: "uname -a && pwd" },
    origin: "local",
    actor: "sarah@acme.dev",
    pitch: "Device-verified critical op runs inside a verified OS sandbox (no network).",
  },
  {
    label: "Blocked domain",
    capability: "network.request",
    input: { url: "https://blocked.example.com" },
    origin: "local",
    actor: "sarah@acme.dev",
    pitch: "Deny-list policy → default-deny wins before any approval.",
  },
];