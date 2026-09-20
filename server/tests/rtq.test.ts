import { describe, expect, it } from "vitest";
import { signDeviceApproval } from "@rtq/security";
import { buildRuntime } from "../src/rtq.js";
import { ensureWorkspace } from "../src/workspace.js";
import { continueApproval, runCommand } from "../src/pipeline.js";

ensureWorkspace();

const runtime = buildRuntime();

describe("RTQ pipeline invariants (INV-01 … INV-12 family)", () => {
  it("rejects unregistered capabilities (default-deny)", async () => {
    const run = await runCommand(runtime, { capability: "ghost.banana", input: {} });
    expect(run.decision).toBe("denied");
    expect((run.result as { code?: string }).code).toBe("capability.not_registered");
  });

  it("denies input that violates the capability schema", async () => {
    const run = await runCommand(runtime, { capability: "files.read", input: { nope: 1 } });
    expect(run.decision).toBe("denied");
    expect((run.result as { code?: string }).code).toBe("input.invalid");
  });

  it("allows low-risk operations automatically and produces a single-use ticket", async () => {
    const run = await runCommand(runtime, { capability: "system.ping", input: {} });
    expect(run.decision).toBe("allowed");
    expect(run.result).toMatchObject({ decision: "allowed", approvalMethod: "automatic", risk: "low" });
    const ticketId = (run.result as { ticketId: string }).ticketId;

    // Single-use: replay must fail.
    const replay = await runtime.rtq.execute(ticketId);
    expect(replay.ok).toBe(false);
    expect(replay.code).toBe("ticket.replay");
  });

  it("never authorizes with missing security-critical parameters (clarification)", async () => {
    const run = await runCommand(runtime, {
      capability: "files.delete",
      input: { path: "notes/meeting-notes.md" },
    });
    expect(run.decision).toBe("clarification_required");
    const questions = (run.result as { questions: { field: string }[] }).questions;
    expect(questions.map((q) => q.field)).toContain("reason");
  });

  it("blocks path-escape attempts", async () => {
    const run = await runCommand(runtime, {
      capability: "files.read",
      input: { path: "../config.ts" },
    });
    expect(run.decision).toBe("error");
    // Execution reached the handler, which refused the escape.
    expect((run.result as { code?: string }).code).toBe("PATH_ESCAPE_DENIED");
  });

  it("applies deny policy rules (blocked domain + untrusted origin)", async () => {
    const blocked = await runCommand(runtime, {
      capability: "network.request",
      input: { url: "https://blocked.example.com" },
      origin: "local",
    });
    expect(blocked.decision).toBe("denied");
    expect((blocked.result as { code?: string }).code).toBe("policy.blocked_domain");

    const unknownOrigin = await runCommand(runtime, {
      capability: "network.request",
      input: { url: "https://httpbin.org/get" },
      origin: "unknown",
    });
    expect(unknownOrigin.decision).toBe("denied");
    expect((unknownOrigin.result as { code?: string }).code).toBe("policy.untrusted_origin");
  });

  it("raises risk for untrusted origins (authoritative, never caller-lowered)", async () => {
    const local = await runCommand(runtime, {
      capability: "network.request",
      input: { url: "https://httpbin.org/get" },
      origin: "local",
    });
    const remote = await runCommand(runtime, {
      capability: "network.request",
      input: { url: "https://httpbin.org/get" },
      origin: "remote",
    });
    const localRisk = local.stages.find((s) => s.key === "risk")?.data?.level;
    const remoteRisk = remote.stages.find((s) => s.key === "risk")?.data?.level;
    expect(localRisk).toBe("medium");
    expect(remoteRisk).toBe("high"); // escalated by origin, never downgradable
    expect(remote.decision).toBe("approval_required");
    expect(remote.result).toMatchObject({ strategy: "qr" });
  });

  it("requires device verification (QR) and verifies the signed approval", async () => {
    const run = await runCommand(runtime, {
      capability: "secrets.reveal",
      input: { name: "DB_PASSWORD" },
      actor: "ci-bot@acme.dev",
      origin: "remote",
    });
    expect(run.decision).toBe("approval_required");
    const approval = run.approvals![0];
    expect(approval.strategy).toBe("qr");
    expect(approval.qrPayload).toContain("rtq://challenge");

    const keyId = Object.keys(runtime.deviceKeys)[0];
    const deviceKey = runtime.deviceKeys[keyId];
    const signed = signDeviceApproval(deviceKey, approval.challengeId, "granted", keyId);
    const outcome = await continueApproval(runtime, approval.challengeId, {
      type: "device_approval",
      approval: signed,
    });
    expect(outcome.decision).toBe("allowed");
  });

  it("rejects a tampered device approval (signature verification)", async () => {
    const run = await runCommand(runtime, {
      capability: "secrets.reveal",
      input: { name: "API_TOKEN" },
      origin: "local",
    });
    const approval = run.approvals![0];
    const keyId = Object.keys(runtime.deviceKeys)[0];
    const signed = signDeviceApproval("wrong-key-not-enrolled", approval.challengeId, "granted", keyId);
    const outcome = await continueApproval(runtime, approval.challengeId, {
      type: "device_approval",
      approval: signed,
    });
    expect(outcome.decision).toBe("denied");
  });

  it("executes system commands inside a VERIFIED OS sandbox", async () => {
    const run = await runCommand(runtime, {
      capability: "system.execute",
      input: { command: "echo sandbox-ok" },
      origin: "local",
    });
    expect(run.decision).toBe("approval_required");
    const approval = run.approvals![0];
    const keyId = Object.keys(runtime.deviceKeys)[0];
    const signed = signDeviceApproval(runtime.deviceKeys[keyId], approval.challengeId, "granted", keyId);
    const outcome = await continueApproval(runtime, approval.challengeId, {
      type: "device_approval",
      approval: signed,
    });
    expect(outcome.decision).toBe("allowed");
    // Iterate the execution report.
    const execution = outcome.execution as {
      sandboxed: boolean;
      report?: { backend?: string; verified?: boolean };
      result?: { data?: { stdout?: string } };
    };
    expect(execution.sandboxed).toBe(true);
    expect(execution.report?.verified).toBe(true);
    expect(execution.result?.data?.stdout).toContain("sandbox-ok");
  });

  it("redacts secret-shaped values in the audit trail", async () => {
    const secret = "sk_live_totally_secret_0123456789";
    const run = await runCommand(runtime, {
      capability: "dev.echo",
      input: { message: "hello", api_key: secret },
    });
    expect(run.decision).toBe("allowed");
    const trusted = runtime.rtq.auditor.snapshot();
    const serialized = JSON.stringify(trusted);
    expect(serialized).not.toContain(secret);
    expect(serialized).toContain("[REDACTED]");
  });

  it("invalidates tickets when capability version changes", () => {
    const summary = runtime.rtq.diagnostics();
    expect(summary.capabilities.length).toBeGreaterThanOrEqual(10);
  });
});