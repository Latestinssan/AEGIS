import cors from "cors";
import express from "express";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { buildRuntime, RTQ_VERSION } from "./rtq.js";
import { buildRouter, hub } from "./routes.js";
import { ensureWorkspace } from "./workspace.js";

ensureWorkspace();

const runtime = buildRuntime();
const app = express();

app.disable("x-powered-by");
app.use(cors({ origin: true }));
app.use(express.json({ limit: "256kb" }));

app.get("/", (_req, res) => {
  res.json({
    name: "AEGIS — RTQ Command Deck",
    tagline: "Risk-Adaptive Capability Security Runtime, visualized.",
    rtq: `@rtq/security ${RTQ_VERSION}`,
    docs: "See README.md and the /api/meta endpoint.",
    endpoints: [
      "GET  /api/health",
      "GET  /api/meta",
      "GET  /api/audit",
      "GET  /api/events  (SSE)",
      "POST /api/command",
      "POST /api/approval/:challengeId/biometric",
      "POST /api/approval/:challengeId/device-scan",
      "POST /api/approval/:challengeId",
      "POST /api/lab/policy-check",
      "POST /api/lab/risk",
      "GET  /api/sandbox",
      "GET  /api/diagnostics",
    ],
  });
});

app.use("/api", buildRouter(runtime));

/** Expose the hub for tests to await flushing. */
export { hub };

export function createApp() {
  return app;
}

/** Boot the HTTP server (not invoked when imported by tests). */
const isMain = process.argv[1] !== undefined && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);

if (isMain) {
  const server = app.listen(config.port, config.host, () => {
    console.log("");
    console.log("  ⚡ AEGIS — RTQ Command Deck");
    console.log(`  ──────────────────────────────────────────`);
    console.log(`  RTQ runtime    @rtq/security ${RTQ_VERSION}`);
    console.log(`  capabilities   ${runtime.rtq.capabilities.getRegisteredCapabilities().length} registered`);
    console.log(`  policy rules   ${runtime.rtq.policy.rulesSnapshot.length} (default-deny)`);
    console.log(`  audit events   ${runtime.rtq.auditor.snapshot().length}`);
    console.log(`  API            http://${config.host}:${config.port}/api`);
    console.log(`  SSE events     http://${config.host}:${config.port}/api/events`);
    console.log("");
  });
  process.on("SIGINT", () => {
    server.close(() => process.exit(0));
    hub.broadcast({ type: "meta", message: "AEGIS shutting down" });
  });
}

export { runtime };