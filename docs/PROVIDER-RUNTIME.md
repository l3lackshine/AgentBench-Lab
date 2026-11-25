# Claude Provider Runtime (v0.11.0)

## What it does
- Sends a user-confirmed test request directly from the browser to Anthropic's Messages API.
- Uses the user's Anthropic API key (BYOK). The key is held in React page state only; it is not written to localStorage, cookies, URL parameters, or AgentBench server storage.
- Sends the task plus selected Agent/Skill definitions (and root README/CLAUDE/AGENT instructions where present). The ZIP itself is never uploaded to AgentBench.
- Reads `input_tokens`, `output_tokens`, and cache token counts from the provider response.
- Calculates an estimated cost using the per-million-token prices entered by the user.
- Requires a budget cap and confirmation before each request; applies a 90-second timeout and a cancel button.

## Important security and privacy notes
- This is a direct browser integration. The browser sends the API key to `api.anthropic.com` using Anthropic's browser-access header. The AgentBench server does not receive the key.
- A browser-held key is visible to the user and potentially to browser extensions, malicious scripts, or anyone with access to the device/session. Use only on a trusted device, do not deploy unreviewed third-party scripts, and clear the key after use. For shared/public deployments, a server-side secret vault with authentication and strict access controls is preferable.
- Agent/Skill/Prompt content selected for Runtime is sent to Anthropic. Simulation mode does not send it anywhere.
- Package content is treated as untrusted reference material. Runtime does not execute code or tools found in the ZIP and tells the model not to treat package text as instructions that override the evaluation prompt. This is prompt-injection mitigation, not a guarantee.
- The local budget guard is an estimate, not a provider-enforced spending limit. It uses a rough character-based input token estimate and a user-entered standard input/output price. Cache pricing, tokenizer differences, taxes, discounts, and provider billing rules may change the final amount. It cannot guarantee the final bill will stay below the entered budget. Configure provider-side spend limits in Anthropic Console as well.
- Price rates are deliberately entered by the user and are not hard-coded because provider pricing and model tiers can change. The displayed cost is an estimate from provider-reported token counts, not an invoice or account-credit balance.
- This first runtime adapter sends one Messages API request. It does not reproduce a full multi-agent orchestration runtime, execute Agent tool calls, or validate actual external tool handoffs.

## Setup
1. Create an Anthropic API key in the user's Anthropic account.
2. Open AgentBench Lab over localhost or HTTPS in a supported browser.
3. Select Provider Runtime, choose a Model ID available to the account, and enter the key.
4. Enter current input/output USD prices per 1 million tokens from Anthropic's pricing page.
5. Set a budget cap, task, and output-token limit. Review the confirmation dialog before each paid request.
6. Check actual account usage and billing in Anthropic Console.

## Endpoint
`POST https://api.anthropic.com/v1/messages`

The browser sends `x-api-key`, `anthropic-version: 2023-06-01`, and `anthropic-dangerous-direct-browser-access: true`. Anthropic may change API behavior or browser access requirements; verify current official API documentation before production use.
