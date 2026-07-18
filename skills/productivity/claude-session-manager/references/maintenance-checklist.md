# Claude Code Maintenance Checklist

Use this checklist after discovering the actual Claude Code and project roots. Paths are evidence, not assumptions.

## 1. Report-Only Inventory

- [ ] State the requested scope: one project, selected sessions, or all local Claude Code state.
- [ ] Record the discovered Claude root and every project root inspected.
- [ ] Run `scripts/diagnose.sh` or equivalent read-only checks.
- [ ] Record size and last activity evidence for each candidate.
- [ ] Check whether a running process may still use each candidate.
- [ ] For every Git worktree, record:
  - Registered path from `git worktree list`
  - Repository, branch, and commit
  - `git status --short`
  - Upstream or preservation status for commits
- [ ] Identify credentials, memory, skills, rules, configuration, and other sensitive state.

Produce a table with these columns:

| Path | Purpose | Evidence | Classification | Proposed action |
|---|---|---|---|---|
| Exact path | Observed owner or use | Activity, Git, process, and handoff facts | Preserve, Review, or Archive-ready | No change, handoff, archive, remove, or rotate |

**Gate:** every candidate has an exact path and evidence; diagnosis changed nothing.

## 2. Classify Candidates

### Archive-Ready

All conditions are true:

- [ ] Exact path and purpose are known.
- [ ] The target is inactive.
- [ ] Resumable work has a current, readable handoff.
- [ ] Unique state, commits, and required history are preserved.
- [ ] The destination or removal operation is explicit.
- [ ] A recovery path is documented.

### Review

Use when a target appears inactive but lacks activity, ownership, handoff, retention, approval, or recovery evidence. Age and size can place a target in Review; they cannot make it Archive-ready.

### Preserve

Use for active, dirty, sensitive, unique, or unknown state. Keep memory, credentials, skills, rules, and global configuration here unless the user explicitly requests a scoped change.

## 3. Preserve Continuity

For each resumable target:

- [ ] Create a handoff using `references/handoff-template.md`.
- [ ] Record repository path, branch, commit, dirty files, commands, validation, blockers, and next action.
- [ ] Save it under the project's existing convention, or `docs/claude-handoffs/YYYY-MM-DD-topic.md`.
- [ ] Read it back and verify a fresh session can resume without the archived transcript.

**Gate:** every resumable target links to a handoff that matches current Git and filesystem state.

## 4. Plan Mutations

For every requested mutation, record:

| Source | Operation | Destination or preserved reference | Approval | Recovery |
|---|---|---|---|---|
| Exact path | Move, compress, rotate, or Git worktree removal | Exact archive path, branch, commit, or backup | Request or explicit confirmation | Exact restore procedure |

Rules:

- Registered Git worktrees follow Git's lifecycle. Verify registration and cleanliness, preserve branch and commits, then use `git worktree remove <path>` when removal is authorized.
- Do not archive a registered worktree by moving its directory.
- Obtain explicit confirmation for deletion, active or dirty work, process termination, and sensitive state.
- Keep discovered but unrequested targets in Review.

**Gate:** every mutation is Archive-ready, authorized, and reversible or has an accepted recovery plan.

## 5. Preflight and Apply

Before each action:

- [ ] Resolve source and destination to absolute paths.
- [ ] Verify both remain inside the intended roots.
- [ ] Recheck activity and Git state.
- [ ] Verify the destination does not overwrite existing data.
- [ ] Create the planned backup or archive directory.

Apply one action at a time. Record the command and resulting path. Stop on the first failure or state mismatch; account for source and destination before continuing.

## 6. Verify

- [ ] Archived content exists and is readable.
- [ ] Handoffs still point to valid repositories, branches, commits, and next steps.
- [ ] `git worktree list` and affected repositories are consistent.
- [ ] Active Claude Code and project state still function.
- [ ] Before and after counts or sizes support the reported result.
- [ ] Recovery commands are present and plausible.
- [ ] Preserve and Review items remain untouched.

Final report:

```markdown
# Claude Code Maintenance Result

- Scope:
- Actions completed:
- Paths changed:
- Space recovered:
- Verification:
- Recovery:
- Review items left untouched:
```
