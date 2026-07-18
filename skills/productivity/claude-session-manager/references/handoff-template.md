# Claude Code Handoff Document Template

Use this structure before archiving or pausing valuable work.

The goal is strong continuity with minimal context. A fresh Claude Code session should be able to read the repo plus this document and continue productively.

---

**Project / Feature:**  
**Date of Handoff:**  
**Previous Session ID (optional):**  
**Handoff Author:**  

## Executive Summary

2-4 sentences on what was being worked on and the current state.

## Key Decisions & Rationale

- **Decision:** ...
  - **Rationale:** ...
  - **Tradeoffs considered:** ...

## Current Codebase State

List only the files that matter for continuation.

- `path/to/important/file`: purpose + recent change
- `path/to/another/file`: current role

## Environment & Commands

How to run, test, or inspect the relevant parts.

**Setup:**
```bash
# Installation commands
```

**Run:**
```bash
# Development commands
# Test commands
```

**Environment Variables:**
- `VAR_NAME` - Description (required/optional)

## What Has Been Completed

- [x] Completed task 1
- [x] Completed task 2

## Open Questions & Next Steps

### High Priority (Start Here)

1. **Task with clear success criteria**
   - File: `path/to/file`
   - Missing: what needs to be done
   - Success criteria: how to know it's done

### Medium Priority

2. **Follow-up task**

### Lower Priority (Nice to Have)

3. **Optional enhancement**

## Constraints & Preferences

**Do not touch:**
- Files or areas to avoid

**User style notes:**
- Coding preferences
- Architectural patterns

**Deliberate non-goals:**
- Features intentionally excluded

## Known Issues & Gotchas

- **Issue name:** Description and impact

## Reactivation Prompt

```text
We are continuing work from a previous Claude Code session.

Read the handoff document at: docs/claude-handoffs/YYYY-MM-DD-topic.md

1. Explore the current repo state first
2. Read the handoff document completely
3. Continue from the "Open Questions & Next Steps" section
4. Do not assume the old chat history is available

Start by confirming the current state and identifying the next highest-priority step.
```

## Additional Context for Future Sessions

Any additional context that will be valuable later.

---

**Suggested save path:**
- Project handoffs: `<project-root>/docs/claude-handoffs/YYYY-MM-DD-topic.md`
- Global handoffs: `~/.claude/handoffs/YYYY-MM-DD-topic.md`
