# Retrospective Prompt Template

Use this prompt shape when running a retrospective on Claude Code sessions.

---

**You are performing a high-signal retrospective on recent Claude Code usage.**

## Input Parameters

**Time window:** [user specifies: "last 7 days" / "last month" / "project X sessions" / "authentication work"]

**Goal:** Improve future Claude Code behavior with at most one evidence-backed durable change to `CLAUDE.md`, `~/.claude/rules/`, memory, or a reusable skill.

## Strict Rules

1. **Only propose changes when evidence is repeated or unusually costly**
   - Single incidents don't justify rules
   - Pattern must appear 3+ times or cause significant impact

2. **Every change must be minimal and actionable**
   - Prefer 2-5 line additions over rewrites
   - Make rules specific and testable
   - Use imperative form ("Run tests" not "Consider running tests")

3. **Prefer updating existing guidance over adding new files**
   - Check `CLAUDE.md` and `~/.claude/rules/` first
   - Add to existing sections when possible
   - Create new file only when clearly justified

4. **Only extract a new skill if reusable and time-saving**
   - Would be rewritten 3+ times without the skill
   - Contains non-obvious procedural knowledge
   - Bundles scripts, references, or assets
   - Not achievable with a simple rule

5. **If evidence is weak, say no change is justified**
   - Better to wait for stronger signal
   - Avoid speculative improvements

## Process

### Step 1: Review Evidence

Examine the time window:
- Read relevant session transcripts (if available)
- Check `~/.claude/projects/` for project-specific context
- Review current `CLAUDE.md` and `~/.claude/rules/`
- Look at existing skills in `~/.claude/skills/`

### Step 2: Identify Patterns

Look for:
- **Repeated mistakes** - same error across multiple sessions
- **Repeated corrections** - user correcting the same assumption
- **Workflow friction** - inefficiencies that slow work
- **Successful patterns** - approaches that worked well
- **Missing context** - information Claude repeatedly needs

### Step 3: Output in Standard Structure

Use exactly this format:

## 1. Retrospective Summary

- [Bullet 1: specific pattern with dates/sessions]
- [Bullet 2: another pattern with evidence]
- [Bullet 3-5: additional patterns]

Each bullet must reference:
- Specific sessions or date range
- Frequency (how many times)
- Both negative and positive patterns

## 2. Proposed CLAUDE.md Updates

**Only include if you have one high-confidence, minimal durable change.**

### Update: [Brief title]

**Location:** [Exact file and section]
```
[Exact text to add or replace]
```
**Rationale:** [One sentence tied to evidence]

[Do not add a second durable change.]

## 3. Proposed New or Updated Tiny Skills

**Only include if clearly justified. Usually none; at most one durable change total.**

### Skill: [skill-name]

**Justification:** [Why a skill not just a rule]

**SKILL.md:**
```markdown
---
name: skill-name
description: [When to use this skill]
---

[Complete skill content]
```

## 4. Evidence & Rationale

For each proposed change:

**Change:** [Brief description]

**Evidence:**
- [Session/date 1: what happened]
- [Session/date 2: what happened]
- [Session/date 3: what happened]

**Frequency:** [N times over time window]

**Impact:** [Time lost, rework needed, frustration caused]

**Alternatives considered:**
- [Alternative 1: why not chosen]
- [Alternative 2: why not chosen]

## 5. Application Recommendation

**Application order:**
1. [First change to apply]
2. [Second change to apply]

**Verification:**
- [How to verify change is working]
- [What to observe in next N sessions]

**Follow-up:**
- [Whether to re-run retrospective]
- [When to check if improvement worked]

---

## Quality Checklist

Before outputting, verify:

- [ ] Every proposal has 3+ instances of evidence (or single high-impact)
- [ ] All changes are minimal (prefer smallest effective intervention)
- [ ] Current CLAUDE.md / rules were checked to avoid duplication
- [ ] Proposed rules are specific and actionable
- [ ] New skills are truly necessary (not achievable with rules)
- [ ] Output follows the exact 5-section structure above
- [ ] Each claim is tied to concrete session evidence

## Example Output

### Good Example

```markdown
## 1. Retrospective Summary

- June 1, 3, 5: Forgot to run tests after code changes (3 times, 45 min rework)
- API sessions May 28-31: Successfully read existing code before proposing changes
- Database work June 2: Assumed PostgreSQL, project uses MySQL (corrected)

## 2. Proposed CLAUDE.md Updates

### Update: Always run tests after code changes

**Location:** ~/.claude/rules/common/development-workflow.md, step 2 (TDD Approach)

```
After implementing code, ALWAYS run tests before presenting results.
If tests fail, fix issues before reporting completion.
```

**Rationale:** Forgot tests in 3 sessions, caused 45 minutes of rework.

## 3. Proposed New or Updated Tiny Skills

[None - rule is sufficient]

## 4. Evidence & Rationale

**Change:** Add "always run tests" rule

**Evidence:**
- June 1: Implemented auth middleware, no test run, failures found (15 min rework)
- June 3: Added validation logic, skipped tests, bugs discovered later (20 min rework)
- June 5: Refactored API, forgot tests, user caught failures (10 min rework)

**Frequency:** 3 times in 5 days

**Impact:** 45 minutes of avoidable rework, delayed delivery

**Alternatives considered:**
- Post-code hook: More complex, harder to verify
- Skill: Overkill for a simple rule
- Status quo: Pattern will continue

## 5. Application Recommendation

**Application order:**
1. Add rule to development-workflow.md
2. Test in next coding session

**Verification:**
- Observe next 3 coding sessions
- Confirm tests are run before presenting results
- If still missed, consider stronger reminder

**Follow-up:**
- Re-run retrospective in 2 weeks on coding sessions
- Verify improvement is working
```

### Bad Example (Avoid This)

```markdown
## Retrospective Summary

- Claude could be better at testing
- Sometimes forgets to run commands
- Might benefit from more structure

[Problems: Vague, no specific evidence, no dates/sessions]

## Proposed Updates

Rewrite the entire development workflow to include:
- Pre-code checklist
- Post-code checklist
- Mid-code review points
- ... [20 more lines]

[Problems: Too broad, over-engineering, not minimal]
```

---

## Ruthless Minimalism

Remember: **One sharp fix beats three vague ones.**

- Prefer doing nothing over weak speculation
- Prefer a 2-line rule over a medium skill
- Prefer updating existing text over adding new sections
- Prefer waiting for stronger signal over premature optimization

The goal is continuous small improvements, not comprehensive rewrites.
