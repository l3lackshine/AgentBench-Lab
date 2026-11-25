# Local-First ZIP Inspection (v0.9.0)

## Privacy model

AgentBench Lab reads the selected ZIP in the user's browser. The ZIP bytes and extracted text files are not posted to an application API. ZIP parsing runs in a Web Worker; package analysis, deterministic routing simulation, and scenario assertions run in the browser tab.

The application has no ZIP upload API routes. The browser file picker grants access only to the file selected by the user. The app does not recursively scan the device or access arbitrary local paths.

## Supported inspection

- ZIP archive up to 10 MiB
- Up to 500 entries
- Up to 30 MiB total expanded supported text
- Up to 2 MiB per supported text file
- Maximum compression ratio of 100:1
- Text formats: `.md`, `.mdx`, `.txt`, `.json`, `.yaml`, `.yml`
- Nested archives and unsafe paths are rejected
- Agent/Skill analysis, routing simulation, context inspection, and deterministic scenario assertions

## Execution boundary

ZIP contents are untrusted data. The application reads text and parses supported structured metadata only. It does not execute scripts, shell commands, tools, Agent prompts, or code found in the archive. Simulation is a deterministic heuristic model, not a live Agent runtime and not an LLM quality evaluation.

## Local persistence

Snapshot history is stored in browser localStorage and can be exported as JSON/Markdown. ZIP contents are held in memory for the active page session and are not uploaded or persisted by default. Clearing the page/session releases the in-memory package.

## Network boundary

The local ZIP inspection and simulation flow does not call `/api/analyze` or `/api/simulate`; those routes have been removed. Hosting the web application still requires ordinary page/static-asset requests. Optional ad placeholders remain disabled by default; no ZIP content is sent to advertising systems.

## Future Provider Runtime

Provider Runtime is not implemented. A future BYOK mode would intentionally send selected prompt/context data to the chosen model provider. It must be an explicit opt-in with clear disclosure and secret handling. Any future execution of arbitrary tools or code requires a separately designed isolation boundary; the no-sandbox guarantee applies only to current read-only inspection and deterministic simulation.
