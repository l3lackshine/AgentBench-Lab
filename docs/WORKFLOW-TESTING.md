# Workflow & Scenario Testing

The browser Scenario Runner accepts a JSON array of 1–50 deterministic scenarios. Each scenario has `id`, `name`, `task`, and optional assertion arrays:

- `expectedAgentIds`
- `expectedSkillIds`
- `mustNotSelectAgentIds`

Example:

```json
[
  {
    "id": "inventory-basic",
    "name": "Inventory routing",
    "task": "Build inventory storage",
    "expectedAgentIds": ["inventory-engineer"],
    "mustNotSelectAgentIds": ["map-designer"]
  }
]
```

The runner checks deterministic Agent/Skill selection. It does not execute Agent prompts, call tools, or evaluate generated answers. Results are routing assertions, not an LLM quality score.
