---
name: feature-scope-triage
description: >-
  use this when a project has accumulated too many features and you need a keep
  / cut / defer / spin-out decision per feature against one stated positioning
---
# Feature Scope Triage (Keep / Cut / Defer / Spin-out)

Purpose: when features pile up and drown the mainline, judge every feature keep-or-cut against one fixed positioning.

## Prerequisite
A one-line positioning must exist first (product-positioning-audit produces one); without it, run that audit before triaging anything.

## Steps
1. **Inventory**: enumerate every user-visible feature (commands, subcommands, interfaces, pages, export formats). For each record: entrypoint, estimated code size, test coverage, last-touched date, whether the docs promote it.
2. **Score** (each 1–5):
   - Positioning fit: does the positioning still hold without it?
   - Evidence: real demand signals (issues, feedback, references)
   - Maintenance cost: code + CI + docs burden
   - Coupling: how much else moves when it is deleted
3. **Verdict** — exactly one tier per feature:
   - **Keep**: core to the positioning; keep investing
   - **Keep-as-is**: good enough; freeze, no further expansion
   - **Defer**: keep the code; pull it from the docs and the first-screen narrative
   - **Cut**: delete or demote to experimental (human approval required)
   - **Spin-out**: valuable on its own but off-positioning; split into a plugin/subproject
4. **Restore the mainline**: after the verdicts, write the newbie 10-minute path: install → first value → second step. Nothing Defer/Cut may appear on it.
5. **Cost ledger**: for every Cut/Spin-out, list what breaks (docs, tests, users) and the migration moves.

## Output format
- Feature table: feature | positioning fit | evidence | cost | coupling | verdict | one-line reason
- Verdict counts (Keep / Keep-as-is / Defer / Cut / Spin-out)
- Newbie 10-minute path
- Cost and migration ledger
- Deletions needing human approval, listed separately

## Discipline
- Verdicts and migration plans only — delete nothing; deletions and public changes go through human approval.
- Refuse "everything matters": every verdict carries a reason; aim for Keep ≤ 1/3 of all features.
