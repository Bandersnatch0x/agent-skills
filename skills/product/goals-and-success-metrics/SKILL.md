---
name: goals-and-success-metrics
description: >-
  use this when project goals feel vague and you need a North Star, supporting
  metrics, stage milestones, and anti-goals to stop feature sprawl
---
# Goals and Success Metrics Calibration

Purpose: turn a vague "make the product good" into verifiable goals and staged success definitions, so feature pile-up cannot masquerade as progress.

## Inputs
- A one-line positioning (product-positioning-audit can supply it); a time window (e.g. 4 weeks / a quarter); existing metrics, or none at all.

## Steps
1. **Layer the goals**: one North Star metric (user-behavior level, not vanity) + 3 supporting metrics + explicit guardrail metrics (things that must not get worse).
2. **Slice by stage**: one deliverable milestone each for this week / this month / this quarter; each accepted by "what you can see when it is done".
3. **Anti-goals**: 3–5 outcomes that still would not count as winning (e.g. stars rise while nobody finishes the main path).
4. **Map features to metrics**: map the current backlog / feature list onto the metrics; flag items that contribute to no metric and recommend deferring or cutting them.
5. **Measurement path**: for each supporting metric write where the data comes from, how often it is reviewed, and who reviews it. No data source → mark "needs instrumentation/logging" with the minimal plan.

## Output
- North Star + supporting + guardrails
- Three-stage milestones
- Anti-goals
- Feature↔metric table (with defer candidates)
- Measurement path and gaps

## Discipline
- Metrics must be observable behavior or outcomes; "improve the experience" and "enhance capability" are unverifiable and fail this test.
- Deliver the plan only; instrumentation and code changes go through human approval.
