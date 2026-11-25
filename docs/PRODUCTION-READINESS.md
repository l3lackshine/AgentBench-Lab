# Production Readiness — v0.11.0

## Release posture

v0.11.0 is a hardened **public staging candidate**, not a certification that the application is production-safe for arbitrary workloads. Complete the deployment checklist below against the target hosting provider before opening public access.

## Security controls included

- Browser-local ZIP parsing and deterministic analysis; no ZIP upload/analyze/simulate server routes.
- ZIP contents are treated as untrusted text and are never executed.
- Runtime sends selected Task + selected Agent/Skill context directly to `https://api.anthropic.com` only after an explicit browser confirmation.
- API key is held in page memory, is not persisted to localStorage, and is cleared on page exit.
- Security response headers: CSP, nosniff, frame denial, referrer policy, permissions policy, COOP/CORP, and disabled `X-Powered-By`.
- CSP permits outbound connections only to the app origin and Anthropic API; no third-party scripts, frames, or `eval`.
- Runtime validates model identifier, API key shape, Task/Context length, token limit, price values, and provider usage values.
- Search engine indexing is disabled by metadata and robots policy.
- Optional ads remain disabled unless explicitly enabled at build time.

## Important limitations

- Direct browser BYOK is not suitable for highly sensitive enterprise keys or untrusted shared devices. Browser extensions and compromised page scripts can still read page memory.
- A user-entered budget is a preflight estimate, not a hard provider-side spending cap. Token estimation is approximate; cache pricing, taxes, discounts, and provider billing rules may differ. Set a spending limit in Anthropic Console.
- Runtime is a single Claude Messages API request. It does not execute package code, tools, or a true multi-agent workflow.
- CSP uses `unsafe-inline` for Next.js App Router bootstrap compatibility; `unsafe-eval` and remote script sources are not allowed. A nonce-based CSP is a future hardening step.
- No independent penetration test, dependency audit sign-off, or real paid-provider test is implied by unit tests.

## Deployment checklist

1. Use a supported Node.js LTS release and install from the committed lockfile (`npm ci`).
2. Run `npm test`, `npm run typecheck`, `npm run build`, and `npm audit --omit=dev`.
3. Confirm HTTPS is enforced by the hosting platform.
4. Verify response headers on `/`, `/_next/static/*`, and error responses.
5. Verify no ZIP bytes or package text are sent to the application origin after selecting a ZIP (browser DevTools Network panel).
6. Verify Anthropic requests go directly to `api.anthropic.com` only after the user confirms Runtime.
7. Test invalid key, rate limit, insufficient balance, timeout, abort, and successful usage response with a dedicated low-limit API key.
8. Set provider-side spending limits before any live API test.
9. Keep `NEXT_PUBLIC_ADS_ENABLED` unset or `false` unless ad placeholders are intentionally desired. No ad network integration is included.
10. Configure hosting logs to avoid recording query/body secrets; this app has no application API routes for ZIP or provider calls.

## Recommended deployment

Use a static-compatible or standard Next.js host with HTTPS and no additional third-party scripts injected into the page. For public multi-user or enterprise deployments, prefer a server-side provider integration with per-user authentication, encrypted secret storage, quotas, abuse controls, and audit logging rather than direct browser BYOK.
