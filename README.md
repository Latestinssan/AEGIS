# AEGIS – RTQ Command Deck

## Overview

AEGIS is a **Risk‑Adaptive Capability Security** runtime that executes commands (capabilities) under a policy engine, tracks audit events, and enforces approval/verification strategies.

The demo repository ships a minimal **web UI** (React + Vite) and an **Express** server exposing the API.

## Quick‑Start

```bash
# Clone & install (assumes Node >= 20)
git clone https://github.com/your‑org/aegis-rtq-demo.git
cd aegis-rtq-demo

# Server
cd server
npm ci
npm start   # runs on http://localhost:3000/api

# Web UI (in a separate terminal)
cd ../web
npm ci
npm run dev   # http://localhost:5173
```

Navigate to the web UI, type an intent in the **AI Copilot** panel, and try a command that requires approval (e.g., `delete the notes/meeting-notes.md`). The UI will show a PIN entry when the `device_verification` strategy is selected.

## Features

- **AI Copilot** – `/api/ai/models` and `/api/ai/suggest` integrate with Ollama (or fallback planner) to propose a capability from natural‑language intent.
- **PIN verification** – demo PIN (`2468`) can approve/deny device‑verification challenges without scanning a QR code.
- **Risk Lab / Policy Lab** – explore policy evaluation and risk calculations.
- **Audit stream** – real‑time Server‑Sent Events (SSE) of audit events.

## API Reference

Base URL: `/api`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/meta` | Runtime metadata (capabilities, policies, etc.) |
| POST | `/command` | Execute a capability (may trigger approval) |
| POST | `/approval/:challengeId/biometric` | Biometric approval |
| POST | `/approval/:challengeId/device-scan` | Simulated device scan approval |
| POST | `/approval/:challengeId/pin` | **PIN approval** – body `{ pin: string, decision?: "granted"|"denied" }` |
| POST | `/approval/:challengeId` | Custom approval payload |
| POST | `/lab/policy-check` | Policy lab – evaluate a capability input |
| POST | `/lab/risk` | Risk lab – evaluate risk factors |
| GET | `/ai/models` | List available Ollama models (or fallback) |
| POST | `/ai/suggest` | Generate a command suggestion from intent |
| GET | `/sandbox` | Simple sandbox diagnostics |
| GET | `/diagnostics` | Runtime diagnostics |
| GET | `/events` | Server‑Sent Events (audit) |

## Development

### Running Tests

```bash
cd server
npm test   # runs Vitest – includes new AI and PIN tests
```

```bash
cd web
npm run build   # type‑checks and builds production bundle
```

### Building a Stand‑Alone Executable (SEA)

The repository includes a minimal **stand‑alone** build script that bundles the UI and embeds it into the server binary using the **SEA** (single‑executable) format.

```bash
# Build the bundled SEA artifact
npm run build:sea   # runs scripts/build-standalone.mjs
```

The output is `dist/rtq-sea.js`. You can run it directly:

```bash
node dist/rtq-sea.js
```

### Release

1. Ensure the repository is a Git repo (`git init`).
2. Commit all changes.
3. Tag a release: `git tag v1.0.0 && git push --tags`.
4. Create a GitHub release via the UI or CLI (`gh release create v1.0.0 dist/rtq-sea.js`).

## Contributing

Feel free to open issues or PRs. Follow the conventional commit style and run tests before submitting.
