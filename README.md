# Bandersnatch0x Skills

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

## Buckets

- `engineering/` — daily code work
- `productivity/` — non-code workflow tools

Only skills in these two buckets are promoted (listed here and in `.claude-plugin/plugin.json`).
