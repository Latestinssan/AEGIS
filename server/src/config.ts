import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Server root = server/ (two levels up from src/). */
export const SERVER_ROOT = path.resolve(__dirname, "..");
export const WORKSPACE_DIR = path.join(SERVER_ROOT, "workspace");
export const VAULT_DIR = path.join(WORKSPACE_DIR, "secrets");

const env = process.env;

export const config = {
  port: Number(env.PORT ?? 8787),
  host: env.HOST ?? "127.0.0.1",
  /** Dev fallback only — production MUST provide RTQ_SIGNING_KEY. */
  signingKey: env.RTQ_SIGNING_KEY ?? "aegis-demo-dev-signing-key-do-not-use-in-prod-2026",
  ticketTTLMs: Number(env.RTQ_TICKET_TTL_MS ?? 90_000),
  executeTimeoutMs: Number(env.RTQ_EXECUTE_TIMEOUT_MS ?? 20_000),
  auditMaxEvents: Number(env.AEGIS_AUDIT_MAX ?? 2_000),
  /* Ollama AI copilot --------------------------------------------------- */
  ollama: {
    baseUrl: env.AEGIS_OLLAMA_URL ?? "http://127.0.0.1:11434",
    model: env.AEGIS_OLLAMA_MODEL ?? "deepseek-r1:1.5b",
    timeoutMs: Number(env.AEGIS_OLLAMA_TIMEOUT_MS ?? 12_000),
    /** TTL for the /api/ai/models cache. */
    modelsCacheMs: Number(env.AEGIS_OLLAMA_MODELS_CACHE_MS ?? 10_000),
  },
  /* Demo PIN — a "knowledge factor" gate in front of device signing. The
   * enrolled device key is the possession factor; the PIN proves knowledge.
   * Demo-only values; production uses real enrollment + policy. */
  demoPin: env.AEGIS_DEMO_PIN ?? "2468",
  demoPinMaxAttempts: Number(env.AEGIS_DEMO_PIN_MAX_ATTEMPTS ?? 5),
  demoPinLockoutMs: Number(env.AEGIS_DEMO_PIN_LOCKOUT_MS ?? 30_000),
} as const;

export type AegisConfig = typeof config;