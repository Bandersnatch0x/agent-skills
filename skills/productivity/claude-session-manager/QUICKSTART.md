# Claude Session Manager Quick Start

Use the skill through a model-invoked request such as:

```text
Diagnose my Claude Code state and report exact cleanup candidates. Do not mutate anything.
```

Before a break, preserve resumable work:

```text
Create a verified handoff for the current authentication work.
```

After reviewing the report, apply only named and authorized actions:

```text
Apply only the approved Archive-ready actions, then verify recovery paths and space recovered.
```

## Rules

- Diagnosis is read-only.
- Age and size identify candidates; they do not establish safety.
- Active, dirty, sensitive, unique, or unknown state remains Preserve.
- A registered Git worktree is removed with `git worktree remove`, never by moving its directory.
- Every mutation has an exact path, destination, authorization, and recovery check.

## Script

The bundled script is read-only and supports `CLAUDE_HOME`:

```bash
bash ~/.claude/skills/claude-session-manager/scripts/diagnose.sh
CLAUDE_HOME=/path/to/claude-state bash ~/.claude/skills/claude-session-manager/scripts/diagnose.sh
```

See [SKILL.md](SKILL.md) for the workflow and [maintenance-checklist.md](references/maintenance-checklist.md) for a detailed report or maintenance run.
