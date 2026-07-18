# Claude Session Manager

Diagnose and maintain Claude Code local state without treating age or size as proof that data is disposable.

## What It Does

- Inventories sessions, projects, logs, and discovered worktree roots
- Preserves resumable work with verified handoffs
- Classifies targets as Preserve, Review, or Archive-ready
- Plans exact archive, rotation, or Git worktree operations
- Verifies continuity, recovery, and measured results

## Usage

Diagnose first:

```text
Diagnose my Claude Code state and report exact cleanup candidates. Do not mutate anything.
```

Preserve work before a break:

```text
Create a verified handoff for the current authentication work.
```

Apply reviewed actions:

```text
Apply only the approved Archive-ready actions, then verify recovery paths and space recovered.
```

## Diagnostic Script

```bash
bash ~/.claude/skills/claude-session-manager/scripts/diagnose.sh
```

Set a non-default root with `CLAUDE_HOME`:

```bash
CLAUDE_HOME=/path/to/claude-state \
  bash ~/.claude/skills/claude-session-manager/scripts/diagnose.sh
```

The script is read-only. It discovers candidate directories and reports disk, session, project, Git, log, and large-file evidence. It does not declare a target safe to remove.

## Classification

**Archive-ready**

The exact path and purpose are known, the target is inactive, resumable work and unique state are preserved, the operation is authorized, and recovery is documented.

**Review**

The target looks inactive but is missing ownership, activity, handoff, retention, approval, or recovery evidence.

**Preserve**

The target is active, dirty, sensitive, unique, or not understood.

Age and size only help find candidates.

## Git Worktrees

Registered worktrees follow Git's lifecycle:

1. Inspect `git worktree list`.
2. Verify status, branch, commit, activity, and handoff.
3. Preserve commits and the recovery reference.
4. Use `git worktree remove <path>` only after authorization.

Do not archive a registered worktree by moving its directory.

## Handoffs

Follow an existing project convention. If none exists, use:

```text
<project>/docs/claude-handoffs/YYYY-MM-DD-topic.md
```

Use `~/.claude/handoffs/` only for work without a project home.

A handoff is complete when a fresh session can locate the project, understand current state, reproduce validation, and execute the next concrete action.

## References

- `references/handoff-template.md`: continuation document structure
- `references/maintenance-checklist.md`: broad maintenance checklist
- `references/examples/handoff-quality-example.md`: handoff example
- `references/examples/typical-diagnosis.md`: diagnosis example
- `references/retrospective-integration.md`: combined learning and maintenance flow
