---
name: claude-session-manager
description: Maintain Claude Code session state safely. Use when diagnosing slow or large local state, preparing a resumable handoff, or planning or executing archival and cleanup of sessions, worktrees, logs, or project state.
---

# Claude Session Manager

Use a preserve-first workflow: inventory, handoff, plan, apply, verify.

## Invariant

A target is **archive-ready** only when its exact path and purpose have been observed, it is inactive, resumable work is preserved, and both the destination and recovery path are known. Age and size are evidence, not proof of safety.

Diagnosis is always read-only. Keep unknown targets in review rather than guessing what they contain.

## Workflow

### 1. Inventory the Actual State

1. Establish whether the request covers one project or the user's Claude Code state.
2. Discover the real Claude configuration root and relevant project roots. Treat paths in reference documents as examples until they are found on this machine.
3. Run `scripts/diagnose.sh` when Bash is available, or perform equivalent read-only checks.
4. For every candidate, record:
   - Exact path and apparent owner or purpose
   - Type, size, and last activity evidence
   - Whether a running process may use it
   - Repository, branch, commit, and dirty state when it is a Git worktree
   - Whether it contains the only record of resumable work
5. Classify each candidate:
   - **Preserve**: active, dirty, sensitive, unique, or not understood
   - **Review**: likely inactive but missing evidence, a handoff, or approval
   - **Archive-ready**: satisfies the invariant above

**Complete when:** every reported candidate has an exact path, supporting evidence, a classification, and a proposed action, and no state has changed.

### 2. Preserve Resumable Work

Activate this branch for any candidate that may be resumed.

1. Load the [handoff template](references/handoff-template.md).
2. Capture the objective, completed work, decisions, current repository state, dirty files, commands, validation results, blockers, and the next concrete action.
3. Follow an existing project handoff convention. If none exists, use `<project>/docs/claude-handoffs/YYYY-MM-DD-topic.md`; use `~/.claude/handoffs/` only for work without a project home.
4. Read the saved handoff and check that a fresh session could locate the project and continue without the archived transcript.

**Complete when:** every resumable candidate links to a readable handoff that reflects its current Git and filesystem state.

### 3. Build the Change Plan

For each proposed mutation, name the exact source, destination, operation, backup or preservation mechanism, recovery command, and expected effect.

- A registered Git worktree follows Git's lifecycle. Preserve its commits and handoff, verify it is clean, then use `git worktree remove <path>` when removal was requested. Filesystem-moving a registered worktree is not an archive operation.
- Reversible actions explicitly named in the user's request are authorized. Newly discovered targets remain in **Review** until approved.
- Obtain explicit confirmation for deletion, active or dirty work, process termination, or changes to credentials, memory, skills, rules, and global configuration.

**Complete when:** every planned mutation is archive-ready and authorized; every other candidate is explicitly excluded.

### 4. Apply One Planned Action at a Time

1. Resolve the source and destination again immediately before mutation and verify both remain within the intended roots.
2. Recheck activity and Git state; stop if either differs from the plan.
3. Create the planned backup or archive destination, perform one action, and record the actual command and path.
4. Let failures surface. Stop on the first partial, ambiguous, or failed operation and report the observed state before continuing.

**Complete when:** each authorized action either succeeded exactly as planned or stopped with its source and destination state accounted for.

### 5. Verify Continuity and Recovery

Verify each action against its plan:

- Archived content exists, is readable, and has recovery instructions.
- Handoffs still point to valid repositories, branches, commits, and next steps.
- `git worktree list` and affected repositories are consistent.
- Active projects and Claude Code state still function.
- Before and after counts or sizes support the reported result.

Report actions taken, paths changed, space recovered, verification results, untouched review items, and any recovery command.

**Complete when:** every mutation has a matching verification result and no preservation or recovery claim is unverified.

## Reference Branches

- For broad maintenance or a detailed report, load [the maintenance checklist](references/maintenance-checklist.md) after discovering the actual layout.
- For an unfamiliar handoff format, inspect [the handoff example](references/examples/handoff-quality-example.md).
- For an unfamiliar diagnosis report, inspect [the diagnosis example](references/examples/typical-diagnosis.md).
- When the request also asks to extract lessons from sessions, run `claude-retrospective` first and load [the integration guide](references/retrospective-integration.md).
