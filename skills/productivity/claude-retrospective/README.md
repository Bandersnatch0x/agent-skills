# Claude Retrospective

Review Claude Code session evidence and distill one minimal durable behavior change.

## Use It When

- The same correction or workflow failure appears across sessions.
- A project or failure window needs an evidence-backed review.
- You are deciding between an instruction, memory entry, skill update, or no change.

## Workflow

1. Define the exact review window and evidence limits.
2. Build a ledger of observable occurrences, corrections, and impact.
3. Audit the instruction hierarchy and existing owners.
4. Select the narrowest durable owner, at most one change.
5. Report, apply when authorized, and verify the edited file and future behavior.

Normal patterns require three independent occurrences. A single occurrence qualifies only for a documented high-impact safety, security, data-loss, or contract failure. Otherwise, report the evidence and make no durable change.

## Output

Include the review scope, evidence limitations, eligible finding, exact change or no-change decision, duplicate checks, rejected alternatives, and an observable follow-up check. Do not claim improvement until later matching sessions provide evidence.

## References

- [Retrospective prompt](references/retrospective-prompt.md): full formal report shape.
- [Minimal update rules](references/minimal-update-rules.md): instruction-edit branch.
- [Minimal skill criteria](references/minimal-skill-criteria.md): skill-edit branch.
- [Memory integration](references/memory-integration.md): use only after the installed memory mechanism, path, and schema are verified.
- [Session manager integration](references/session-manager-integration.md): run learning before maintenance when both are requested.
- [Example](references/examples/good-retrospective.md): expected evidence-linked output.
