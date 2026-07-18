# Minimal Update Rules

Guidelines for making minimal, effective updates to CLAUDE.md and instruction files.

## Core Principle

**Add the smallest change that solves the repeated problem.**

Every line added increases maintenance cost. Be ruthless about keeping instructions lean.

## When to Add vs. Update

### Add New Text When:
- ✅ The pattern is new and not covered by existing rules
- ✅ Evidence is strong (3+ instances or high impact)
- ✅ The rule is actionable and testable
- ✅ No existing rule can be tweaked to cover this

### Update Existing Text When:
- ✅ An existing rule is close but not specific enough
- ✅ The rule needs tightening (vague → specific)
- ✅ Adding one word/phrase would fix the issue
- ✅ Current rule contradicts observed best practice

### Don't Change When:
- ❌ Evidence is weak (1-2 instances, low impact)
- ❌ It's a one-off situation
- ❌ The rule would be speculative ("might help")
- ❌ Current setup is working fine

## Size Guidelines

### Preferred: 1-2 Lines
```markdown
After implementing code, ALWAYS run tests before presenting results.
```

### Acceptable: 3-5 Lines
```markdown
After implementing code:
1. Run all relevant tests
2. Fix any failures before presenting
3. Report test results with code changes
```

### Too Long: 6+ Lines
→ This should probably be a skill or reference doc

## Rule Quality Standards

### Good Rules Are:

**1. Specific**
- ✅ "Run `npm test` after code changes"
- ❌ "Consider testing"

**2. Actionable**
- ✅ "Read existing code before proposing changes"
- ❌ "Be aware of existing patterns"

**3. Testable**
- ✅ "Verify tests pass before presenting results"
- ❌ "Ensure quality is maintained"

**4. Imperative**
- ✅ "Run tests"
- ❌ "You should run tests"

**5. Evidence-Based**
- ✅ "Run tests (forgot 3 times, 45 min rework)"
- ❌ "Run tests (general best practice)"

## Summary

**Golden rule:** Add the smallest change that solves the repeated problem.

- Prefer 1-2 lines over paragraphs
- Prefer updating existing rules over adding new ones
- Prefer specific actions over vague guidance
- Prefer evidence-based rules over speculation

When in doubt, wait for stronger signal.
