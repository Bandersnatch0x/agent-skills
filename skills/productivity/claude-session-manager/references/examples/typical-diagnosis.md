# Example: Evidence-Based Diagnosis

## Scope

- Requested: inspect local Claude Code state and prepare a cleanup plan
- Claude root discovered: `/home/alex/.claude`
- Project inspected: `/workspace/storefront`
- Mode: report-only
- Limitation: transcript ownership could not be inferred for one old session

## Findings

| Path | Evidence | Classification | Proposed action |
|---|---|---|---|
| `/home/alex/.claude/projects/storefront/session-a.jsonl` | 240 MiB, inactive for 18 days, contains unfinished migration work, no handoff | Review | Create handoff, then reassess |
| `/workspace/storefront-worktrees/api-refactor` | Registered worktree, clean, branch merged, commit `4c1e920`, no active process, current handoff exists | Archive-ready | Remove through Git after approval |
| `/home/alex/.claude/logs/debug-2026-04.log` | 310 MiB, inactive, owner known, no open incident, archive destination available | Archive-ready | Compress and move after approval |
| `/home/alex/.claude/projects/storefront/memory` | Project memory and only known copy | Preserve | No change |
| `/workspace/storefront-worktrees/checkout` | 12 dirty entries and recent activity | Preserve | No change |

Age and size identified candidates, but classification came from ownership, activity, Git, handoff, and recovery evidence.

## Required Handoff

Before changing `session-a.jsonl`, create:

`/workspace/storefront/docs/claude-handoffs/2026-06-05-database-migration.md`

The handoff must record:

- Migration objective and completed phases
- Decisions and rollback constraints
- Repository path, branch, commit, and dirty files
- Last successful test command and result
- Current blocker and next concrete action

The session remains in Review until the handoff is read back and verified.

## Proposed Plan

### 1. Remove the Archive-Ready Worktree

Preservation:

- Branch: `api-refactor`
- Commit: `4c1e920`
- Handoff: `/workspace/storefront/docs/claude-handoffs/2026-06-02-api-refactor.md`

Preflight:

```bash
git -C /workspace/storefront worktree list
git -C /workspace/storefront-worktrees/api-refactor status --short
git -C /workspace/storefront rev-parse api-refactor
```

Authorized operation:

```bash
git -C /workspace/storefront worktree remove /workspace/storefront-worktrees/api-refactor
```

Recovery: recreate it from the preserved branch or commit.

### 2. Rotate the Archive-Ready Log

Source: `/home/alex/.claude/logs/debug-2026-04.log`

Destination: `/home/alex/.claude/archives/logs/2026-06/debug-2026-04.log.gz`

Before applying, verify the file is still inactive and the destination does not exist. Compress and move only this exact file.

Recovery: decompress the archived file to a reviewed destination.

### 3. Leave Other Targets Untouched

- `session-a.jsonl`: Review until its handoff exists
- `memory/`: Preserve
- `checkout` worktree: Preserve because it is dirty and active

## Verification

After approved actions:

```bash
git -C /workspace/storefront worktree list
test -r /home/alex/.claude/archives/logs/2026-06/debug-2026-04.log.gz
```

Report:

- Worktree removed through Git: 1
- Log archived: 1
- Measured space recovered: 850 MiB
- Review targets changed: 0
- Preserve targets changed: 0
- Recovery references verified: branch `api-refactor`, commit `4c1e920`, archived log path
