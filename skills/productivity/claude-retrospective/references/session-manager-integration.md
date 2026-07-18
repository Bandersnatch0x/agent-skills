# Session Manager Integration

When a request combines retrospective learning with Claude Code maintenance, complete the retrospective before archiving or cleanup.

## Boundary

- `claude-retrospective` reviews evidence, audits existing controls, and selects at most one durable change.
- `claude-session-manager` inventories state, preserves resumable work, and applies authorized maintenance actions.

Neither skill can infer safety from age, size, or the fact that sessions were reviewed. Active, dirty, sensitive, unique, or unknown state stays Preserve. Registered Git worktrees follow Git's lifecycle.

## Combined Flow

1. Fix the retrospective window and record evidence limitations.
2. Build the evidence ledger and make the durable-change or no-change decision.
3. Diagnose local state read-only and classify every candidate.
4. Create and verify handoffs for any resumable work.
5. Apply only explicitly approved Archive-ready actions.
6. Verify archives, worktree state, recovery paths, and measurements.

If the memory mechanism is not verified, keep retrospective findings in the appropriate instruction owner instead of creating memory. If an action fails or state changes unexpectedly, stop and report the observed partial state.
