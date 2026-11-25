# Architecture

## Web application (v0.9.0)

1. The user selects a ZIP through the browser file picker.
2. The ZIP ArrayBuffer is transferred to `workers/zip-reader.worker.ts`.
3. The Worker validates archive limits and paths, then extracts supported text files.
4. `lib/analyzer.ts` inspects package structure in the browser.
5. `lib/workflow.ts` and `lib/simulator.ts` perform deterministic routing and scenario tests in the browser.
6. Snapshot metadata is stored in browser localStorage; package contents remain in page memory.

The web app does not expose ZIP upload, analyze, or simulate API endpoints. It does not execute package code or Agent prompts. Hosting still serves the normal Next.js page and static assets.

## CLI

The local CLI runner (`scripts/agentbench-ci.ts`) can read ZIP files from the local filesystem for CI regression checks. This is an opt-in local/CI operation, not a web upload feature.

## Future

Provider Runtime is not implemented. Any future provider requests must be explicit and disclose that selected prompt/context data leaves the device. Any future arbitrary code/tool execution requires a separate isolation architecture.
