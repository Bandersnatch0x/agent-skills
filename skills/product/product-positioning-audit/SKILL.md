---
name: product-positioning-audit
description: >-
  use this when a project's positioning feels unclear or drifts from what the
  repo actually builds and you need an evidence-based audit of who it is for,
  what job it does, and what it is NOT
---
# Product Positioning Audit

Purpose: judge from evidence already in the repo — not imagination — who this project is for, what job it does, and what it deliberately does not do, and surface positioning drift.

## Inputs
- Repo path or URL; README / docs / ADRs / roadmap / issue titles; the CLI/API surface (commands, entrypoints, package names).
- If available: user feedback, stars/downloads, a competitor list.

## Steps
1. **Capture the claim**: quote the project's current one-line positioning verbatim (README opener, package description, site headline). Quote — do not paraphrase.
2. **Capture the reality**: list the user-visible surfaces that actually exist (commands / interfaces / pages), marking each as works / half-built / skeleton only.
3. **Reconcile**: align the claim with the reality and flag three gap types:
   - Claimed but weak in reality (overpromise)
   - Real but never mentioned (hidden value)
   - Present on both sides but aimed at different audiences (positioning drift)
4. **Group into jobs**: map the real surfaces onto at most 5 jobs-to-be-done; for each job state the trigger scenario / current alternative / why this project wins.
5. **Converge on candidates**: give 2–3 mutually exclusive positioning options, each with:
   - A one-line positioning (who / scenario / alternative displaced / unique edge)
   - Share of existing features that hit it
   - Features that must be cut or demoted under it
   - The fastest signal that would validate it
6. **Falsify**: for each candidate, one test whose observable result would prove the positioning wrong.

## Output format (short)
- Current positioning in one line (quoted verbatim)
- Up to 5 gaps per gap type, each with file/command evidence
- JTBD table
- 2–3 positioning candidates, each with what it cuts
- One recommendation, with reasoning and the biggest risk
- 3–5 explicit "this project does NOT …" statements

## Discipline
- Every conclusion points to a file, command, or issue; where evidence is missing, write "no evidence found".
- The deliverable stops at the audit itself (candidates, gaps, not-doing list); no code or README edits, no new feature proposals.
