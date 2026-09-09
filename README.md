# Bandersnatch0x Skills

[English](README.md) · [中文](README-zh.md)

Agent skills — small, composable, model-agnostic. Drop them into any repo and any coding agent (Claude Code, Codex, pi, …).

## Install

```bash
npx skills@latest add Bandersnatch0x/agent-skills
```

Or clone and symlink into your local harness skill dirs (`~/.claude/skills`, `~/.agents/skills`):

```bash
scripts/link-skills.sh
```

## Skills

### Engineering

**Model-invoked**

- **[distill-project-manual](./skills/engineering/distill-project-manual/SKILL.md)** — Distill an existing repo's scattered docs, conventions, and enforced rules into one compact agent operating manual, with a traceability gate (every rule points back to a real source) and a behavior probe (a fresh agent must answer routing questions from the manual alone). Use when onboarding future agents to a codebase you didn't set up.

### Product

**Model-invoked**

The four triage skills form a pipeline — users → positioning → feature triage / metrics — while product-scope-audit spans all of it when the continue / stop decision itself is the question.

- **[target-user-and-jtbd](./skills/product/target-user-and-jtbd/SKILL.md)** — Pin down the real primary user and their jobs-to-be-done from evidence, plus anti-users and a next-week validation slice.
- **[product-positioning-audit](./skills/product/product-positioning-audit/SKILL.md)** — Audit the claimed positioning against what the repo actually builds; surface overpromise, hidden value, and drift; converge on candidate positionings with a not-doing list.
- **[feature-scope-triage](./skills/product/feature-scope-triage/SKILL.md)** — Judge every feature Keep / Keep-as-is / Defer / Cut / Spin-out against one stated positioning, and restore the newbie 10-minute path.
- **[goals-and-success-metrics](./skills/product/goals-and-success-metrics/SKILL.md)** — Turn vague goals into a North Star, supporting and guardrail metrics, staged milestones, anti-goals, and a feature-to-metric map.
- **[product-scope-audit](./skills/product/product-scope-audit/SKILL.md)** — Whole-product decision audit: continue / narrow / reposition / pause / stop with one next action, grounded in capability boundaries and end-to-end journeys.

### Productivity

**Model-invoked**

- **[claude-session-manager](./skills/productivity/claude-session-manager/SKILL.md)** — Diagnose and maintain Claude Code local state with preserve-first inventory, verified handoffs, explicit archive gates, and recovery checks.
- **[claude-retrospective](./skills/productivity/claude-retrospective/SKILL.md)** — Distill repeated session evidence into at most one minimal, evidence-backed durable behavior change.
- **[find-hackathons](./skills/productivity/find-hackathons/SKILL.md)** — Find and verify hackathons by deadline, location, type, requirements, tracks, and prizes; optionally generate a bilingual local filterable webpage with participant matching and agent-ready brainstorm briefs.

## Buckets

- `engineering/` — daily code work
- `product/` — product strategy: users, positioning, feature triage, metrics, whole-product decisions
- `productivity/` — non-code workflow tools

Only skills in these three buckets are promoted (listed here and in `.claude-plugin/plugin.json`).
