# Testing Modes and Monetization

## User-selectable modes

### Simulation Mode
- Never calls an LLM provider.
- Performs deterministic package analysis, routing-rule checks, context composition previews, and scenario tests.
- Token counts are estimates only and must be labelled as estimates.
- No provider API key is required.

### Provider Runtime Mode
- Claude Runtime is available as a direct browser BYOK integration.
- The user explicitly confirms every paid request.
- The API key remains in page memory and is sent directly from the browser to Anthropic; it is not stored by AgentBench.
- Selected Agent/Skill/Prompt content is sent to Anthropic for Runtime. Simulation never sends package contents to a provider.
- Usage is read from the provider response. Cost is estimated using provider-reported tokens and user-entered per-million-token prices.
- The local budget guard is approximate and is not a provider-enforced hard spending limit. Users should configure provider-side spend limits.
- This first adapter makes one Claude Messages API request. It does not execute package code, tools, or a true multi-agent orchestration workflow.
- See [PROVIDER-RUNTIME.md](./PROVIDER-RUNTIME.md) for setup, privacy, and limitations.

## Mode UX rules
- The user can switch modes at any time.
- Show the active mode persistently near the workspace.
- Keep estimated simulation tokens visually and semantically separate from provider-reported usage.
- Never silently fall back from Provider Runtime to Simulation or vice versa.
- If Runtime is unavailable, explain that no API request will be made.

## Advertising strategy

### Recommendation
Use small, clearly labelled, non-intrusive ad placements to support hosting costs while keeping the core tool usable.

Suggested placements:
1. A compact responsive slot between the mode selector and the import workspace.
2. A compact slot near the bottom of the page, above the footer.

Do not place ads:
- inside code, logs, test output, or context inspection panels;
- beside destructive/security-sensitive actions;
- as popups, interstitials, auto-playing media, or overlays;
- in a way that shifts controls while a user is interacting with them.

### Rollout
- Keep ads disabled by default in self-hosted deployments.
- The current `NEXT_PUBLIC_ADS_ENABLED=true` flag only reveals clearly labelled placeholder slots; it does not load an ad network or generate revenue.
- Integrate a real ad provider only after the public domain is deployed and its publisher account is approved.
- Add a privacy/cookie notice and obtain consent where required before loading non-essential advertising or tracking scripts.
- Prefer contextual ads over behavioural targeting. Never send uploaded Agent/Skill contents, prompts, API keys, test cases, or provider usage to an ad network.
- Add an ad-free supporter/donation option later; do not block core testing behind ads.
- Review the chosen network's policies, local legal obligations, and self-hosted deployment implications before launch.

## Revenue expectations
Advertising revenue is uncertain and depends on traffic, geography, ad inventory, viewability, and provider terms. Treat it as a contribution toward hosting costs, not a guaranteed revenue stream. Keep a simple cost dashboard for hosting, storage, worker usage, and ad income before deciding whether to scale the service.
