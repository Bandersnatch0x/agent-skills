---
name: claude-retrospective
description: Distill evidence from Claude Code sessions into one minimal durable behavior change. Use when reviewing a time, project, or failure window; investigating repeated corrections or friction; or deciding whether to update instructions, memory, or a reusable skill.
---

# Claude Retrospective

Run an evidence-to-rule distillation. One sharp change is a better result than a catalogue of plausible advice.

## Invariant

A durable change requires all three:

1. Repeated evidence, or one documented high-impact safety, security, data-loss, or contract failure
2. A demonstrated gap or conflict in the instructions already in force
3. The narrowest durable owner for the desired behavior

When any condition is absent, recommend no change.

## Workflow

### 1. Fix the Review Window

Use the user's stated date range, project, session set, or failure mode. When no boundary is given, use the narrowest recent window available for the current project and state the exact boundary before analysis.

Identify the evidence sources that can actually be inspected, such as transcripts, user corrections, session summaries, commits, test results, and handoffs. State material gaps instead of reconstructing unavailable events.

**Complete when:** the review window, included sources, excluded sources, and evidence limitations are explicit.

### 2. Build an Evidence Ledger

For each candidate pattern, record:

- The observable behavior and desired replacement behavior
- Independent occurrences with session, date, or artifact references
- User correction or other evidence that the behavior was wrong or valuable
- Cost or benefit: rework, delay, defect, risk, or time saved

A normal pattern becomes eligible at three independent occurrences. A lower frequency qualifies only when the documented impact meets the high-impact exception in the invariant. Keep one-off, low-impact observations in the ledger but out of durable changes.

**Complete when:** every eligible and rejected pattern is traceable to evidence, and unsupported impressions have been removed.

### 3. Audit Existing Controls

Read the instruction hierarchy that applied to each eligible occurrence: relevant `CLAUDE.md` files, rules, installed skills, and discovered memory indexes. Search for the same intended behavior and classify the gap as:

- **Missing**: no applicable instruction exists
- **Weak**: an instruction exists but is not observable or specific enough
- **Conflicting**: applicable instructions disagree
- **Covered**: the instruction is already clear and the failure is execution, not documentation

Do not duplicate a covered instruction. For a covered pattern, propose a way to verify execution or report that instruction changes are not the remedy.

**Complete when:** every eligible pattern maps to an existing owner or a justified missing owner, with duplicate and conflict checks recorded.

### 4. Select the Smallest Durable Owner

Choose in this order:

1. Tighten an existing instruction in its current owner.
2. Add a one-to-five-line instruction at the most specific scope that needs it.
3. Use memory for stable project facts or user preferences only after discovering and validating the installed memory mechanism, path, and schema.
4. Update an existing skill when the behavior is a reusable, non-obvious procedure.
5. Create a skill only when the procedure crosses projects, needs multiple steps or bundled resources, and no existing skill owns it.
6. Make no change when the evidence or ownership test fails.

Select at most one durable change per review unless the user explicitly requests an exhaustive audit.

Load branch-specific guidance only after selecting a branch:

- Instruction change: [minimal update rules](references/minimal-update-rules.md)
- Skill change: [minimal skill criteria](references/minimal-skill-criteria.md)
- Memory change: [memory integration](references/memory-integration.md), after confirming the mechanism exists

**Complete when:** there is one exact proposed change and owner, with the lower-cost alternatives addressed, or an evidence-backed no-change decision.

### 5. Report, Apply, and Verify

For a review request, report the proposal before mutating durable instructions. Apply it when the user requested application or approved the exact change.

Report in this order:

1. Review scope and evidence limitations
2. Eligible finding with occurrence count and impact
3. Decision and exact change, or no-change rationale
4. Rejected alternatives and duplicate checks
5. Verification method for future matching sessions

After applying a change, validate the edited file's format, reread the surrounding instruction hierarchy for conflicts, and define an observable follow-up check. Do not claim improvement until later matching sessions supply evidence.

**Complete when:** every conclusion is evidence-linked, any edit is minimal and validated, and future verification can distinguish success from recurrence.

## Reference Branches

- Load [the strict retrospective prompt](references/retrospective-prompt.md) only when a full formal report is requested.
- Inspect [the retrospective example](references/examples/good-retrospective.md) only when the expected output remains unclear.
- When reviewed sessions will also be archived, finish the retrospective first, then load [the session-manager integration guide](references/session-manager-integration.md) and run `claude-session-manager`.
