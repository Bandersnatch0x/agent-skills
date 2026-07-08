---
name: distill-project-manual
description: Use when the user asks to create an agent operating manual, handbook, onboarding doc, or agent-facing wiki from an existing repo, or to distill repository docs and conventions into durable agent documentation. Not for general code exploration or human-facing repo summaries.
---

# Distill Project Manual

The manual is not a repo summary; it is the project's "how to operate here without breaking the contract" surface.

## Workflow

1. Locate durable docs.
   Prefer existing wiki/docs navigation such as `docs/wiki/index.md`, `docs/index.md`, or `docs/README.md`. If an adequate agent-facing manual (e.g. `AGENTS.md`) already exists, update it in place instead of creating a parallel source of truth. If no docs surface exists, create the smallest conventional docs location. Avoid the root README unless the project already treats it as the canonical knowledge surface.
   Completion: the target manual path and index/update surface are known.

2. Inspect the project shape.
   Gather bounded evidence from `AGENTS.md`, `CLAUDE.md`, README, SPEC/DESIGN/ROADMAP/LOOP files, CONTRIBUTING, docs, skills, standards, workflow packs, route definitions, tests, validators, scripts, and CI config. Use the repo's mandated retrieval/search tools when present.
   Completion: every likely source category that exists has been sampled or deliberately ruled out.

3. Extract behavior-changing rules.
   Keep rules about boundaries, priorities, lifecycle, gates, verification, evidence, approval, handoff, safety, routing, workflow discipline, state/doc separation, and repeated failure patterns. Prefer rules repeated across docs, enforced by tests, or expressed as hard gates. Every kept rule must trace to a concrete source seen in step 2 — a file, test, validator, or CI job; drop any rule you cannot point back to. Plausible-sounding rules without sources are fabrications. Sources need not appear in the manual itself.
   Completion: each kept rule would change a future agent's action and names its source.

4. Synthesize the manual.
   Follow Manual Shape below. Use headings such as identity/boundary, control priorities, lifecycle, task routes, evidence, approval, handoff, state vs docs, verification, and failure patterns. Preserve project vocabulary where it carries operational meaning.
   Completion: a future agent can decide what to do next from the manual without rereading the whole repo.

5. Place it in the project.
   Add a clear file in durable docs, such as `docs/wiki/PROJECT_AGENT_OPERATING_MANUAL.md` or a project-specific name. Link it from the existing index. If `AGENTS.md` or `CLAUDE.md` exists, append a one-line pointer to the manual there — these are the entry points harnesses auto-load; a manual unreachable from them will not be read by agents. Do not overwrite user-authored docs without explicit approval; prefer adding and linking.
   Completion: the manual is reachable from the docs entry point and from the agent-facing entry file when one exists.

6. Probe, verify, and report.
   Derive 2-3 decision questions from the extracted rules (e.g. "a task touches boundary A — what route applies?") and ask a fresh subagent that reads only the manual to answer them. An answer that contradicts the source evidence sends that section back to step 3. Then run the nearest docs/wiki/link validator if available; otherwise check links and inspect the diff.
   Completion: the probe passed (or each failure was fixed and re-probed), and the final answer names changed files, the probe outcome, and verification results.

## Extraction Filter

Keep:
- Project-specific constraints, not generic coding advice.
- Rules with consequences: gates, required artifacts, approval rules, routing choices, invariants.
- Knowledge future agents would otherwise rediscover expensively.
- Terms that encode the project's operating model.

Cut:
- Marketing copy, historical narrative, or broad philosophy without operational force.
- Duplicated rules unless repetition proves priority.
- Implementation details that belong in API docs or code comments.
- Temporary conversation context that should not become project truth.

## Manual Shape

A strong manual is compact and imperative. Target 150 lines or fewer; if a draft runs over, cut lowest-consequence rules by the Extraction Filter rather than compressing prose — an oversized manual is a distillation failure, not a repo-size problem.

Prefer:
- "When X, do Y because Z is the gate."
- "Never cross boundary A; use route B."
- "Before completion, verify with command C."

Avoid:
- "This project values quality."
- "Agents should be careful."
- Long summaries of every document inspected.

## Placement Names

Choose the name that fits the existing docs:
- `AGENT_OPERATING_MANUAL.md` when the project has one agent-facing manual.
- `PROJECT_AGENT_OPERATING_MANUAL.md` when the docs contain multiple manuals.
- A domain-specific name only when the repo already uses that domain vocabulary.
