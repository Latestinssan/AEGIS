import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/index.js";

const app = createApp();

describe("AEGIS HTTP API", () => {
  it("reports health", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("serves rich metadata: capabilities, policy, clarifications, devices", async () => {
    const res = await request(app).get("/api/meta");
    expect(res.status).toBe(200);
    expect(res.body.capabilities.length).toBeGreaterThanOrEqual(10);
    expect(res.body.policies.some((p: { kind: string }) => p.kind === "deny")).toBe(true);
    expect(res.body.clarifications.length).toBeGreaterThanOrEqual(3);
    expect(res.body.devices.length).toBeGreaterThanOrEqual(1);
    expect(res.body.workspaceFiles).toContain("welcome.txt");
  });

  it("allows a low-risk command end-to-end with a full stage trace", async () => {
    const res = await request(app)
      .post("/api/command")
      .send({ capability: "system.ping", input: { label: "hi" }, actor: "tester@acme.dev" });
    expect(res.status).toBe(200);
    expect(res.body.decision).toBe("allowed");
    expect(res.body.result.ticketId).toBeTruthy();
    const keys = res.body.stages.map((s: { key: string }) => s.key);
    expect(keys).toEqual(["command", "capability", "validate", "risk", "clarify", "policy", "approve", "ticket", "execute", "audit"]);
    expect(res.body.stages.every((s: { state: string }) => s.state === "done")).toBe(true);
  });

  it("rejects unknown capabilities with 400", async () => {
    const res = await request(app)
      .post("/api/command")
      .send({ capability: "nope.missing", input: {} });
    expect(res.status).toBe(400);
  });

  it("returns clarification questions before any authorization", async () => {
    const res = await request(app)
      .post("/api/command")
      .send({ capability: "files.delete", input: { path: "notes/meeting-notes.md" } });
    expect(res.status).toBe(200);
    expect(res.body.decision).toBe("clarification_required");
  });

  it("runs the QR device-approval flow over HTTP (parse → sign → verify → ticket → execute)", async () => {
    const req = await request(app)
      .post("/api/command")
      .send({ capability: "secrets.reveal", input: { name: "DB_PASSWORD" }, origin: "local" });
    expect(req.body.decision).toBe("approval_required");
    const challengeId = req.body.result.challengeId;

    const scanned = await request(app)
      .post(`/api/approval/${challengeId}/device-scan`)
      .send({ decision: "granted" });
    expect(scanned.status).toBe(200);
    expect(scanned.body.signedApproval.signature).toMatch(/^[0-9a-f]+$/);
    expect(scanned.body.decision).toBe("allowed");
    expect(scanned.body.execution.sandboxed).toBe(false);
    expect(scanned.body.execution.result.data.value.length).toBeGreaterThan(0);
  });

  it("denies a biometric approval when the user says no", async () => {
    const req = await request(app)
      .post("/api/command")
      .send({ capability: "files.delete", input: { path: "notes/meeting-notes.md", reason: "cleanup" } });
    expect(req.body.decision).toBe("approval_required");
    const challengeId = req.body.result.challengeId;

    const denied = await request(app)
      .post(`/api/approval/${challengeId}`)
      .send({ type: "custom", verified: false, detail: "Operator declined" });
    expect(denied.body.decision).toBe("denied");
  });

  it("exposes a redacted audit trail", async () => {
    const leak = "sk_live_should_be_redacted_abc";
    await request(app)
      .post("/api/command")
      .send({ capability: "dev.echo", input: { message: "x", api_key: leak } });
    const res = await request(app).get("/api/audit");
    expect(res.status).toBe(200);
    expect(res.body.events.length).toBeGreaterThan(0);
    expect(JSON.stringify(res.body)).not.toContain(leak);
  });

  it("returns diagnostics with the signing key redacted", async () => {
    const res = await request(app).get("/api/diagnostics");
    expect(res.status).toBe(200);
    expect(res.body.config.signingKey).toBe("[REDACTED]");
  });

  it("returns the policy lab analysis", async () => {
    const res = await request(app)
      .post("/api/lab/policy-check")
      .send({ capability: "files.delete", input: { path: "x.md", reason: "r" }, origin: "local" });
    expect(res.status).toBe(200);
    expect(res.body.policy.decision.decision).toBe("allow");
    expect(res.body.risk.level).toBe("high");
  });

  it("default-denies unknown routes with an RTQ-style decision", async () => {
    const res = await request(app).get("/api/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body.decision).toBe("denied");
  });
});