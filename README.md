# AEGIS — RTQ Command Deck

[![CI](https://github.com/Latestinssan/AEGIS/actions/workflows/ci.yml/badge.svg)](https://github.com/Latestinssan/AEGIS/actions/workflows/ci.yml)
[![Release](https://github.com/Latestinssan/AEGIS/actions/workflows/release-build.yml/badge.svg)](https://github.com/Latestinssan/AEGIS/actions/workflows/release-build.yml)
[![Release](https://img.shields.io/github/v/release/Latestinssan/AEGIS?label=latest%20release)](https://github.com/Latestinssan/AEGIS/releases)
[![License](https://img.shields.io/github/license/Latestinssan/AEGIS)](https://github.com/Latestinssan/AEGIS/blob/main/LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org/)

AEGIS is a **Risk‑Adaptive Capability Security** (RTQ) runtime that executes commands (capabilities) under a policy engine, tracks audit events, and enforces approval/verification strategies.

The demo repository ships a minimal **web UI** (React + Vite + Tailwind + Framer Motion) and an **Express** server exposing the API over HTTP + SSE.

---

## Overview

RTQ (Risk‑Adaptive Capability Security) is a security model where every executable operation is a **capability** with:
- **Validated schema** — input must conform before execution
- **Authoritative risk evaluation** — base risk + context (origin, resource, etc.)
- **Declarative policy** — default-deny with explicit allow/deny rules
- **Approval strategies** — automatic, biometric, device verification (QR), PIN
- **OS-enforced sandboxing** — Seatbelt (macOS), bubblewrap (Linux), AppContainer (Windows)
- **Tamper-evident audit trail** — secrets automatically redacted

AEGIS demonstrates this model with a working command deck UI.

---

## Quick‑Start

```bash
# Clone & install (requires Node >= 20)
git clone https://github.com/Latestinssan/AEGIS.git
cd AEGIS
npm install

# Start both server + web UI concurrently
npm run dev
# Server:  http://localhost:3000/api
# Web UI:  http://localhost:5173
```

Or run them separately:

```bash
# Terminal 1 — Server
npm run dev -w server

# Terminal 2 — Web UI
npm run dev -w web
```

---

## Features

| Feature | Description |
|---------|-------------|
| **AI Copilot** | Natural‑language intent → capability suggestion via `/api/ai/suggest` (Ollama or fallback planner) |
| **PIN Verification** | Demo PIN (`2468`) approves/denies device‑verification challenges without scanning QR |
| **Risk Lab / Policy Lab** | Interactive exploration of policy evaluation and risk calculations |
| **Audit Stream** | Real‑time Server‑Sent Events (SSE) of audit events at `/api/events` |
| **OS Sandboxing** | Real OS sandbox (Seatbelt / bubblewrap / AppContainer) for `system.execute` |
| **Stand‑Alone Executable** | SEA bundle (`npm run build:sea`) + native binaries via `pkg` |

---

## API Reference

**Base URL:** `/api`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/meta` | Runtime metadata (capabilities, policies, devices) |
| `POST` | `/command` | Execute a capability (may trigger approval) |
| `POST` | `/approval/:challengeId/pin` | PIN approval — `{ pin: string, decision?: "granted"\|"denied" }` |
| `POST` | `/approval/:challengeId/biometric` | Biometric approval |
| `POST` | `/approval/:challengeId/device-scan` | Simulated device scan approval |
| `POST` | `/approval/:challengeId` | Custom approval payload |
| `POST` | `/lab/policy-check` | Policy lab — evaluate a capability input |
| `POST` | `/lab/risk` | Risk lab — evaluate risk factors |
| `GET` | `/ai/models` | List available Ollama models (or fallback) |
| `POST` | `/ai/suggest` | Generate a command suggestion from intent |
| `GET` | `/sandbox` | Sandbox diagnostics |
| `GET` | `/diagnostics` | Runtime diagnostics |
| `GET` | `/events` | Server‑Sent Events (audit stream) |

---

## Capabilities

| Capability | Risk | Approval | Sandbox | Description |
|------------|------|----------|---------|-------------|
| `files.read` | low | automatic | recommended | Read a file inside the protected workspace |
| `files.write` | medium | automatic | recommended | Create/overwrite a file in the workspace |
| `files.delete` | high | biometric | required | Irreversibly delete a file (requires reason) |
| `network.request` | medium | automatic/risk | required | Outbound HTTPS request to allowed hosts |
| `system.ping` | low | automatic | none | Liveness probe |
| `system.execute` | critical | device_verification | **required** | Run shell command in OS sandbox |
| `secrets.reveal` | critical | qr | none | Reveal a demo secret (audit redacted) |
| `payments.transfer` | high | biometric | none | Transfer demo funds (fake) |
| `database.query` | medium | automatic | none | Read-only analytics query |
| `dev.echo` | low | automatic | none | Echo input (demonstrates audit redaction) |

---

## Development

### Running Tests

```bash
# Server tests (Vitest)
npm run test -w server

# Type-check both workspaces
npm run typecheck
```

### Building

```bash
# Build web production bundle
npm run build -w web

# Build server TypeScript
npm run build -w server

# Build both
npm run build
```

### Building a Stand‑Alone Executable (SEA)

The repository includes a build script that bundles the UI and embeds it into the server binary using the **SEA** (Single Executable Application) format.

```bash
npm run build:sea   # runs scripts/build-standalone.mjs
```

Output: `dist/rtq-sea.js` — run directly with `node dist/rtq-sea.js`.

### Building Native Binaries

```bash
# Build SEA + native binaries for all platforms (macOS, Windows, Linux)
npm run build:pkg

# Create macOS DMG (run on macOS)
npm run build:dmg

# Create Linux AppImage (run on Linux)
npm run build:appimage
```

Outputs in `dist/pkg/`:
- `AEGIS-macos` (macOS)
- `AEGIS-win.exe` (Windows)
- `AEGIS-linux` (Linux)

---

## Release Artifacts

Pre‑built native binaries are attached to GitHub releases:

| Platform | Artifact | Runs on |
|----------|----------|---------|
| macOS | `AEGIS.dmg` | macOS 11+ (Apple Silicon & Intel) |
| Windows | `AEGIS.exe` | Windows 10/11 (x64) |
| Linux | `AEGIS.AppImage` | Most x86_64 distros (Ubuntu, Fedora, Arch, etc.) |

Download from: [Releases](https://github.com/Latestinssan/AEGIS/releases)

---

## Project Structure

```
AEGIS/
├── server/                 # Express backend (TypeScript)
│   ├── src/
│   │   ├── index.ts        # HTTP + SSE server
│   │   ├── rtq.ts          # RTQ runtime builder
│   │   ├── pipeline.ts     # Command pipeline (risk → policy → approve → execute → audit)
│   │   ├── capabilities.ts # Capability definitions + handlers
│   │   ├── sandbox-runner.ts # OS sandbox abstraction
│   │   ├── workspace.js    # Workspace file operations
│   │   └── config.ts       # Configuration
│   └── tests/              # Vitest test suite
├── web/                    # React frontend (Vite + TypeScript)
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── hooks/          # Custom hooks
│   │   └── main.tsx        # Entry point
│   └── public/             # Static assets (icon.svg)
├── scripts/
│   ├── build-standalone.mjs # SEA build script
│   └── build-appimage.sh   # AppImage build helper
├── .github/workflows/
│   ├── ci.yml              # CI: tests + typecheck + build
│   └── release-build.yml   # Release: cross-platform binaries + DMG/AppImage
└── dist/                   # Build outputs (gitignored)
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server listen port |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama API base URL |
| `RTQ_SIGNING_KEY` | (generated) | HMAC key for ticket signing |
| `RTQ_TICKET_TTL_MS` | `300000` | Ticket time-to-live (5 min) |
| `RTQ_EXECUTE_TIMEOUT_MS` | `30000` | Capability execution timeout |

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/amazing-feature`)
3. Follow conventional commits (`feat:`, `fix:`, `docs:`, etc.)
4. Run tests and typecheck: `npm run typecheck && npm run test -w server`
5. Open a PR

---

## License

Apache‑2.0 © [Latestinssan](https://github.com/Latestinssan)

See [LICENSE](LICENSE) for details.