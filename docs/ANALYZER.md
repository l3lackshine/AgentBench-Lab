# Package Analyzer Rules (M0.2)

The analyzer treats every uploaded file as untrusted data. It does not execute code, evaluate prompt instructions, fetch URLs, or call a model.

## Recognized conventions
- `agents/*.md` or `agent.md`: Agent definition candidates.
- `skills/<name>/SKILL.md`: Skill entry points.
- `knowledge/` and `research/`: knowledge documents.
- Other supported text files: documents.

These are conventions, not a universal Agent/Skill standard. Packages using other layouts may be under-classified until a manifest format is added.

## Findings
- `MISSING_SKILL_MD`: a `skills/<name>/` directory has files but no `SKILL.md`.
- `EMPTY_SKILL`, `EMPTY_AGENT`: empty Markdown definition.
- `SKILL_FOLDER_NAME`: skill directory name uses unsupported characters.
- `SKILL_WITHOUT_FRONTMATTER`: informational; YAML frontmatter was not detected.
- `BROKEN_REFERENCE`: a local Markdown link target was not found in the package.
- `REFERENCE_ESCAPES_PACKAGE`: a relative link resolves outside the package root.
- `CASE_COLLISION`: paths differ only by letter case.
- `NO_AGENT_FILES`, `NO_SKILL_ENTRYPOINTS`: no definitions detected using current conventions.

## Limits and caveats
- Token counts are character-based estimates, not provider tokenizer counts.
- Markdown reference checking is intentionally lightweight; it does not fully parse Markdown, HTML, YAML, or every link syntax.
- The current ZIP parser runs in the Next.js process. Declared-size checks and post-decompression limits are defense-in-depth, not a substitute for an isolated worker with OS-level memory, CPU, and time limits.
