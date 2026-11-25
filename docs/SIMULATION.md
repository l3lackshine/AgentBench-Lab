# Simulation Mode v0.4.0

## Input conventions
Agent definitions are detected under `agents/` (or `agent/`) as Markdown. Skill entry points are detected at `skills/<skill-name>/SKILL.md` (or `skill/`). YAML frontmatter is recommended:

```yaml
---
name: inventory-engineer
description: Build inventory, item storage, and persistence systems
triggers: inventory, items, storage
capabilities: database schema, item management
---
```

## Routing behavior
1. Tokenize the user task and each Agent's name, description, triggers, and capabilities.
2. Select a conventional coordinator named `master-agent`, `orchestrator`, or `coordinator`, if present.
3. Rank Agents by the number of exact token overlaps; add up to four specialists with a positive score.
4. Rank Skills the same way and include up to eight with positive scores.
5. Build the context manifest from selected Agent and Skill files only.
6. Report possible overlap when two selected Agents share at least two matched terms.

## Important limitations
- This is deterministic lexical matching, not semantic understanding or an LLM decision.
- The simulator does not execute Agents, Skills, scripts, tools, or workflows.
- A selected route is a suggestion, not proof that an Agent can complete the task.
- Tokens are estimated as `ceil(characters / 4)` and are not provider usage.
- Imported files are untrusted data. Their instructions are never executed by this engine.
