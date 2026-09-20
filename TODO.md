# AEGIS — RTQ Command Deck · Execution Checklist

Tracking list — check off each box as it's completed and verified.

## 1. Ollama AI copilot (server)
- [ ] `server/src/config.ts` — add `ollama` config block
- [ ] `server/src/ai.ts` — NEW: Ollama client + curated fallback planner + RTQ evaluation
- [ ] `server/src/routes.ts` — add `GET /api/ai/models` + `POST /api/ai/suggest`
- [ ] `server/src/index.ts` — add AI endpoints to docs/meta listing
- [ ] `server/tests/ai.test.ts` — NEW: suggest fallback + models shape + evaluation
- [ ] run tests (green)

## 2. PIN verification (server + web)
- [ ] `server/src/config.ts` — add demo PIN config (pin, maxAttempts, lockoutMs)
- [ ] `server/src/routes.ts` — add `POST /api/approval/:challengeId/pin` (PIN verify → device sign → continue)
- [ ] `server/tests/api.test.ts` — PIN: wrong pin → 403, right pin → allowed + execution
- [ ] `web/src/api.ts` — add `pinApprove`, `aiModels`, `aiSuggest`
- [ ] `web/src/types.ts` — add `AiModels`, `AiProposal`, `AiSuggestion` types
- [ ] `web/src/components/ApprovalModal.tsx` — PIN pad for `device_verification` strategy
- [ ] run tests (green)

## 3. Web AI copilot panel
- [ ] `web/src/components/AICopilot.tsx` — NEW: intent → proposal → risk/lab eval → load/run
- [ ] `web/src/App.tsx` — wire AICopilot into left column
- [ ] typecheck + build (green)

## 4. Executable (SEA) build
- [ ] `scripts/build-standalone.mjs` — esbuild bundle + SEA + postject
- [ ] `sea-config.json` — assets
- [ ] produce + run-verify darwin-arm64 executable
- [ ] serve embedded web from SEA assets

## 5. README + GitHub release
- [ ] root `README.md` — why/what/quickstart/tour/AI/PIN/API/executable
- [ ] `.gitignore` + `git init` + commit
- [ ] `gh repo create` + push
- [ ] `gh release create` with executable attached
- [ ] `.github/workflows` cross-platform release workflow

Status: in progress ✅ 🚧 ⬜
