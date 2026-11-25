# Security Notes

## v0.11.0

- ZIP bytes are read by a Web Worker in the browser; the app has no ZIP upload/analyze/simulate API routes.
- Archive path traversal, duplicate/case-colliding paths, nested archives, oversized archives/files, excessive expansion, and suspicious compression ratios are rejected.
- Only Markdown, plain text, JSON, and YAML files are extracted for inspection.
- Extracted content is untrusted text. It is never evaluated or executed.
- Simulation performs deterministic string/routing analysis only.
- Snapshot metadata is stored in browser localStorage; full package content and API keys are not stored there.
- Claude Runtime sends the selected Task and Agent/Skill context directly from the browser to Anthropic after explicit confirmation.
- API key remains in page memory and is cleared on page exit. It is not sent to the AgentBench application server.
- Response security headers include CSP, nosniff, frame denial, referrer policy, permissions policy, COOP, and CORP.

## Remaining risks

- Browser parsing is not a security sandbox; a ZIP parser vulnerability could affect the browser process.
- Browser BYOK keys can be exposed to malicious extensions, compromised page scripts, or anyone with access to the device/session.
- The local budget guard is approximate, not a hard provider-side cap. Configure spending limits with Anthropic.
- CSP currently uses `unsafe-inline` to support Next.js bootstrap; no `unsafe-eval` or remote script origins are allowed.
- Runtime is a single model request and does not execute Agent code, tools, or true multi-agent orchestration.
- A real production deployment still requires live-provider smoke testing, dependency audit, HTTPS/header verification, and hosting-specific review.
- Any future feature that executes code, invokes tools, or runs provider-connected agents needs a separate threat model and isolated execution environment.
