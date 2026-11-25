# AgentBench Lab

**Version 0.11.0** — Open-source, self-hostable workspace for inspecting and testing AI Agent / Skill packages.

## Local-first ZIP workflow

Select a ZIP from your device. The browser reads it in a Web Worker; analysis, routing simulation, context inspection, and scenario assertions run locally. ZIP bytes and extracted text are not uploaded to the application server.

- ZIP limit: 10 MiB; up to 500 entries
- Supported text: `.md`, `.mdx`, `.txt`, `.json`, `.yaml`, `.yml`
- Expanded text limit: 30 MiB; per-file limit: 2 MiB
- Nested archives, unsafe paths, collisions, and suspicious compression ratios are rejected
- Package contents stay in page memory; snapshot metadata is stored in browser localStorage
- No scripts, shell commands, tools, Agent prompts, or code from the ZIP are executed

## Testing modes

- **Simulation Mode:** deterministic package analysis, Agent/Skill routing, workflow planning, context inspection, and scenario assertions. No LLM API calls or model charges.
- **Claude Provider Runtime Mode:** direct browser BYOK integration. After explicit confirmation, selected task and Agent/Skill content is sent directly to Anthropic; provider token usage is read from the response and cost is estimated from user-entered prices. The budget is an estimate, not a provider-enforced cap. See [Claude Runtime](docs/PROVIDER-RUNTIME.md).

## Run locally

Requirements: Node.js 22.6+ and npm.

```bash
npm ci
npm test
npm run typecheck
npm run build
npm run dev
```

Open http://localhost:3000.

## CI runner

```bash
npm run agentbench:ci -- --package ./agent-package.zip --scenarios ./examples/scenarios.json
```

See [GitHub Actions Regression](docs/GITHUB-ACTIONS.md).

## Privacy and security

The web app has no ZIP upload, analyze, or simulate API routes. Normal page/static asset requests go to the host. In Claude Runtime, the API key is held in page memory and sent directly to Anthropic; selected package content is sent only after user confirmation. Optional ad placeholders are disabled by default. See [Local-First Architecture](docs/ZERO-UPLOAD-ARCHITECTURE.md), [Security Notes](docs/SECURITY.md), and [Production Readiness](docs/PRODUCTION-READINESS.md).

## Release status

v0.11.0 is a production-readiness hardening candidate. Do not treat it as security-certified: run the deployment checklist, live-provider smoke tests, dependency audit, and target-host verification before public launch.
