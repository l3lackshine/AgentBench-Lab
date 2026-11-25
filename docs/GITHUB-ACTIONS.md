# GitHub Actions Regression (v0.8.0)

AgentBench Lab includes a command-line runner for CI. It reads an Agent/Skill ZIP and a JSON scenario suite, performs deterministic routing assertions, and emits JSON or JUnit XML. It does not execute uploaded Agent code or prompts and does not call an LLM provider.

## Add to a repository

1. Keep the Agent/Skill package ZIP in the repository (or create it in an earlier workflow step).
2. Copy `examples/scenarios.json` to `agentbench/scenarios.json` and edit the expected Agent/Skill IDs and tasks.
3. Copy `.github/workflows/agentbench-regression.yml` into the repository's workflow directory.
4. Update `--package` and `--scenarios` paths in the workflow.
5. Commit and open a pull request. Failed assertions or analyzer errors return a non-zero exit code.

## Run locally

```bash
npm install
npm run agentbench:ci -- --package ./agent-package.zip --scenarios ./agentbench/scenarios.json --format json --output ./agentbench-results.json
```

JUnit output for test-report integrations:

```bash
npm run agentbench:ci -- --package ./agent-package.zip --scenarios ./agentbench/scenarios.json --format junit --output ./agentbench-results.xml
```

## Detect routing changes against a baseline

Save a JSON result from the target baseline revision as an artifact, then pass it to a later run:

```bash
npm run agentbench:ci -- --package ./agent-package.zip --scenarios ./agentbench/scenarios.json --baseline ./baseline-agentbench-results.json --fail-on-routing-change
```

`--fail-on-routing-change` fails the job for new or changed scenario routing. Without this flag, routing changes are reported but do not fail CI unless a scenario assertion fails.

## Exit codes

- `0`: all assertions passed and no analyzer errors.
- `1`: one or more assertions failed, analyzer errors were found, or a requested routing-change gate failed.
- `2`: invalid CLI arguments, invalid scenario/baseline file, unreadable archive, or archive safety limit violation.

## Archive safety limits

Defaults: 20 MiB compressed archive, 50 MiB expanded text, and 2,000 files. Unsafe paths are rejected. The ZIP is still parsed in the CI process; run workflows on trusted repositories and do not use this runner as a public multi-tenant upload service.

## Scenario schema

The JSON file must have `schemaVersion: 1` and 1–50 scenarios. Each scenario has string `id`, `name`, and `task`; optional assertions are `expectedAgentIds`, `expectedSkillIds`, and `mustNotSelectAgentIds`. IDs are normalized to lowercase and hyphen form before comparison.

The report contains package analyzer findings, scenario assertions, actual Agent/Skill IDs, and optional baseline routing differences. It does not validate answer quality or real Agent execution.
