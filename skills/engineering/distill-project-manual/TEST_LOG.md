# Test Log

## 2026-07-08 — with/without smoke test (n=1)

Testbed: D:\code_space\coding-harness (Amber). Method: baseline agent (naive "write an agent manual" prompt) vs agent following this skill; both wrote manuals to temp, repo untouched. 5 evidence-derived probe questions authored independently by a third agent; two fresh judges answered reading only their manual.

| | Baseline | With skill |
|---|---|---|
| Probe score | 3/5 | 4/5 |
| Lines | 294 | 148 (target 150) |
| Traceability report | none | full section→source map |
| Detected existing manual (AMBER_AGENT_OPERATING_MANUAL.md) → update in place | n/a | yes |
| Flagged missing AGENTS.md/CLAUDE.md pointers | no | yes |

Differentiator: Q3 (feature-standard plan→implement approval gate from routes/*.route.json) — baseline NOT COVERED, skill answered correctly.

Shared miss: Q5 ("proceed silently when CONTEXT-MAP.md/CONTEXT.md absent", source docs/agents/domain.md) — both manuals missed it. In a real run, step 6's probe exists to catch exactly this class of gap and send it back to step 3.

Status: smoke-tested once. Single run, single model — indicative, not proof.

## 2026-07-08 — applied for real (same repo)

Manual landed in place of the stale docs/wiki/AMBER_AGENT_OPERATING_MANUAL.md (197→151 lines), Q5 rule added (§3, source docs/agents/domain.md), one-line pointers appended to AGENTS.md and CLAUDE.md. Re-probe on the placed manual: 3/3 (incl. previously-missed Q5). `node scripts/validate-wiki.js --target .` → 0 errors. Side finding: CLAUDE.md's "does NOT auto-publish" release note contradicts ci.yml:207 (stable tags do auto-publish) — surfaced to user, not auto-fixed.
