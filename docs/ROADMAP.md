# Roadmap

## v0.9.0 — Local-First ZIP Inspection
- [x] Read ZIP in browser Web Worker
- [x] Remove server ZIP upload/analyze/simulate endpoints
- [x] Run package analysis and deterministic simulation in browser
- [x] Keep package contents in memory only
- [x] Document execution boundary and privacy model

## Next
- [ ] IndexedDB-backed local workspaces with explicit clear/export controls
- [ ] Better Agent/Skill relationship visualization
- [ ] Scenario editor UI and richer assertions
- [ ] Optional local CLI directory scanning
- [ ] Public Git repository read-only connector
- [ ] Provider Runtime (BYOK) with explicit disclosure; not yet available


## v0.10.0 — Claude Provider Runtime
- Direct browser BYOK Claude Messages API adapter.
- Provider-reported input/output/cache usage and cost estimate from user-entered rates.
- Per-request confirmation, approximate budget guard, cancellation, and timeout.
- No package code/tool execution and no AgentBench server upload.


## v0.11.0 — Production Readiness Candidate

- Added browser security response headers and restrictive Content Security Policy.
- Disabled search engine indexing by default.
- Added Runtime input validation and page-exit API key clearing.
- Added production deployment checklist and clarified budget-estimate limitations.
- Remaining before public launch: dependency installation/audit, production build/typecheck, live Anthropic smoke test, and target-host header/network verification.
