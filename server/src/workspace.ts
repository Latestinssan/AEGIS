import fs from "node:fs";
import path from "node:path";
import { WORKSPACE_DIR, VAULT_DIR } from "./config.js";

/**
 * Demo workspace content. The RTQ policy layer treats everything outside
 * `WORKSPACE_DIR` as out-of-bounds, and the OS sandbox (Seatbelt /
 * bubblewrap / AppContainer) enforces the same boundary at the OS level.
 */

const FILES: Record<string, string> = {
  "welcome.txt": [
    "AEGIS command deck — RTQ demo workspace",
    "",
    "Everything under server/workspace/ is the sandboxed zone.",
    "Capabilities may only touch paths here; any escape attempt",
    "is blocked by path policy AND the OS sandbox.",
  ].join("\n"),
  "deploy/config.json": JSON.stringify(
    {
      service: "aegis-api",
      replicas: 3,
      region: "us-east-1",
      env: "production",
      endpoints: ["https://api.example.com", "https://cdn.example.com"],
    },
    null,
    2,
  ),
  "notes/meeting-notes.md": [
    "# 2026-09-20 — Security Review",
    "- RTQ adoption on track for the agent runtime.",
    "- Default-deny policy reviewed; zero exceptions.",
    "- Next: enroll the on-call device pool.",
  ].join("\n"),
  "team-roster.csv": [
    "name,role,email",
    "Sarah Chen,Platform Security,sarah@acme.dev",
    "Marcus Webb,Agent Runtime,marcus@acme.dev",
    "Ada Okafor,SRE,ada@acme.dev",
  ].join("\n"),
  "secrets/vault.env": [
    "# FAKE demo credentials — never real.",
    "DATABASE_PASSWORD=s3cr3t-hunter2-rotated",
    "PAYMENT_GATEWAY_KEY=sk_demo_8f4c1a2b9d0e",
    "DEPLOY_TOKEN=tkn_demo_q7w2e1r4t5y6",
  ].join("\n"),
};

const SAMPLE_SECRETS: Record<string, string> = {
  DB_PASSWORD: "s3cr3t-hunter2-rotated",
  API_TOKEN: "tkn_demo_q7w2e1r4t5y6",
  PAYMENT_KEY: "sk_demo_8f4c1a2b9d0e",
};

/** Smoke-test file placed OUTSIDE the workspace to prove path-policy busts. */
export const OUTSIDE_MARKER = "YOU SHOULD NEVER SEE THIS OUTSIDE FILE";

export function ensureWorkspace(): void {
  fs.mkdirSync(path.join(WORKSPACE_DIR, "deploy"), { recursive: true });
  fs.mkdirSync(path.join(WORKSPACE_DIR, "notes"), { recursive: true });
  fs.mkdirSync(VAULT_DIR, { recursive: true });
  for (const [rel, content] of Object.entries(FILES)) {
    const target = path.join(WORKSPACE_DIR, rel);
    if (!fs.existsSync(target)) fs.writeFileSync(target, content, "utf8");
  }
}

export function listWorkspaceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string, prefix: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path.join(dir, entry.name), rel);
      else out.push(rel);
    }
  };
  walk(WORKSPACE_DIR, "");
  return out.sort();
}

export function readWorkspaceFile(rel: string): string {
  const abs = path.resolve(WORKSPACE_DIR, rel);
  if (!abs.startsWith(WORKSPACE_DIR + path.sep) && abs !== WORKSPACE_DIR) {
    throw new Error("PATH_ESCAPE");
  }
  return fs.readFileSync(abs, "utf8");
}

export function writeWorkspaceFile(rel: string, content: string): void {
  const abs = path.resolve(WORKSPACE_DIR, rel);
  if (!abs.startsWith(WORKSPACE_DIR + path.sep)) {
    throw new Error("PATH_ESCAPE");
  }
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, "utf8");
}

export function deleteWorkspaceFile(rel: string): void {
  const abs = path.resolve(WORKSPACE_DIR, rel);
  if (!abs.startsWith(WORKSPACE_DIR + path.sep)) {
    throw new Error("PATH_ESCAPE");
  }
  if (!fs.existsSync(abs)) throw new Error("NOT_FOUND");
  fs.rmSync(abs, { recursive: false, force: false });
}

export function getSecret(name: string): string {
  const key = name.toUpperCase();
  if (key in SAMPLE_SECRETS) return SAMPLE_SECRETS[key];
  throw new Error("UNKNOWN_SECRET");
}

export function secretNames(): string[] {
  return Object.keys(SAMPLE_SECRETS);
}