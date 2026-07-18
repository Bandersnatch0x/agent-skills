# Minimal Skill Criteria

When should you create a tiny skill instead of just adding a rule to CLAUDE.md?

## Default: Prefer Rules

**Start with the assumption that a rule is sufficient.**

A 1-2 line rule in CLAUDE.md is:
- Easier to discover
- Easier to maintain
- Less overhead
- Faster to apply

Only create a skill when the rule approach clearly fails.

## Create a Skill When:

### 1. Reusable Across Multiple Projects
- ❌ One-off procedure for this project
- ✅ Workflow applicable to many projects

**Example:** 
- ❌ "How to deploy our specific app" → Project-specific rule
- ✅ "PDF manipulation workflow" → Reusable skill

### 2. Contains Non-Obvious Procedural Knowledge
- ❌ "Run tests after code changes" → Simple rule
- ✅ "Debug flaky tests with these 5 diagnostic steps" → Skill

**Example:**
- ❌ "Use parameterized queries" → Simple rule
- ✅ "Database migration checklist with rollback procedures" → Skill

### 3. Bundles Multiple Resources
- ❌ Single instruction
- ✅ Instructions + scripts + references + examples

**Example:**
- ❌ "Format code with Prettier" → Simple rule
- ✅ "Code review skill" → Instructions + checklist + examples

### 4. Would Be Rewritten 3+ Times
- ❌ Used once or twice
- ✅ Same procedure repeated frequently

**Example:**
- ❌ "How to setup this API" → One-time setup
- ✅ "API integration pattern" → Used for multiple APIs

### 5. Too Complex for a Rule
- ❌ 1-5 lines → Rule
- ✅ 10+ lines with branching logic → Skill

**Example:**
- ❌ "Always backup before deploying" → Rule
- ✅ "Deployment procedure with environment checks, backups, rollback steps" → Skill

## Don't Create a Skill When:

### Already Covered by Existing Skill
Check `~/.claude/skills/` first. Better to update an existing skill than create a new one.

### Achievable with 1-5 Line Rule
If it fits in CLAUDE.md as a clear, actionable rule, keep it there.

### Too Specific to One Project
Project-specific procedures belong in project's CLAUDE.md, not global skills.

### Based on Single Incident
Wait for pattern (3+ instances) before extracting skill.

### Speculative ("Might Be Useful")
Only create skills for proven, repeated needs.

## Decision Tree

```
Does it solve a repeated problem?
├─ No → Don't create (wait for pattern)
└─ Yes
    └─ Can it be solved with 1-5 line rule?
        ├─ Yes → Add rule to CLAUDE.md
        └─ No
            └─ Is it reusable across projects?
                ├─ No → Add to project CLAUDE.md
                └─ Yes
                    └─ Does it need scripts/references/assets?
                        ├─ No → Consider if rule would work
                        └─ Yes → Create skill
```

## Examples: Rule vs. Skill

### Example 1: Testing

**Pattern:** Forgot to run tests 3 times

**Rule approach:** ✅
```markdown
After implementing code, ALWAYS run tests before presenting results.
```
**Why:** Simple, one-line rule covers it

**Skill approach:** ❌ Overkill

---

### Example 2: Database Migrations

**Pattern:** Complex migration procedures with multiple steps, rollback plans, backups

**Rule approach:** ❌ Too complex
```markdown
Before migrations: backup, test on staging, have rollback plan...
[would need 15+ lines]
```

**Skill approach:** ✅
```
database-migration-skill/
├── SKILL.md (multi-step procedure)
├── references/
│   ├── migration-checklist.md
│   └── rollback-procedures.md
└── scripts/
    └── backup.sh
```
**Why:** Complex, multi-step, needs references and scripts

---

### Example 3: API Integration

**Pattern:** Integrating with external APIs, happened 5 times with different services

**Rule approach:** ❌ Not specific enough
```markdown
When integrating APIs, read documentation first.
```

**Skill approach:** ✅
```
api-integration-skill/
├── SKILL.md (standard integration workflow)
├── references/
│   ├── auth-patterns.md
│   ├── error-handling.md
│   └── rate-limiting.md
└── examples/
    └── typical-integration.md
```
**Why:** Reusable, has procedural knowledge, worth codifying

## Quality Check Before Creating Skill

Before creating a skill, answer these questions:

1. **Frequency:** Will this be used 3+ times?
2. **Reusability:** Works across multiple projects?
3. **Complexity:** More than 5 lines needed?
4. **Resources:** Needs scripts, references, or assets?
5. **Alternative:** Can't be solved with a simple rule?

If you answer "No" to any of these, reconsider creating the skill.

## Tiny Skill Structure

If you do create a skill, keep it minimal:

**Required:**
- `SKILL.md` with frontmatter and clear workflow

**Optional (only if needed):**
- `scripts/` - Executable code
- `references/` - Documentation to load as needed
- `examples/` - Example outputs or use cases

**Avoid:**
- Long-winded explanations
- Duplicate information
- Speculative features

## Summary

**Decision criteria:**
1. Default to rules (prefer CLAUDE.md)
2. Create skill only when clearly better
3. Keep skills tiny and focused
4. One skill per repeatable workflow
5. Wait for pattern (3+ instances)

**When in doubt, start with a rule.** You can always extract a skill later if the rule proves insufficient.
