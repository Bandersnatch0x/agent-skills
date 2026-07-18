# Example: Good Retrospective Output

This is a real-world example of a high-quality retrospective that follows all the principles.

---

# Retrospective: Frontend Development Sessions (May 20 - June 7, 2026)

**Review window:** 18 days, 12 coding sessions  
**Date:** 2026-06-07

---

## 1. Retrospective Summary

- **Testing gaps (4 sessions):** Implemented UI components without running tests first. June 1, 3, 5, 7 - resulted in bugs found later, ~60 min total rework across sessions.

- **Framework assumptions (3 sessions):** Assumed React patterns when project uses Vue 3. May 28, June 2, June 4 - user corrected each time, added friction to workflow.

- **Good pattern (5 sessions):** Successfully read existing component structure before creating new ones. May 25, 27, June 1, 3, 6 - led to consistent code style and faster acceptance.

- **Accessibility oversights (2 sessions):** Forgot ARIA labels on interactive elements. June 3, 5 - user added them in review. Not frequent enough to warrant rule yet, but worth monitoring.

---

## 2. Proposed CLAUDE.md Updates

### Update 1: Add test-first reminder

**Location:** `~/.claude/rules/common/development-workflow.md`, Section "2. TDD Approach"

**Change:**
```markdown
For UI components: Write component tests FIRST, then implement component.
Run tests before presenting component code.
```

**Rationale:** Forgot test-first approach in 4 sessions, caused 60 minutes of rework finding bugs after implementation.

---

### Update 2: Check framework before assuming patterns

**Location:** `~/.claude/rules/common/coding-style.md`, top of "Core Principles" section

**Change:**
```markdown
Before suggesting code patterns, check `package.json` to identify the framework (React, Vue, Svelte, etc.). Never assume.
```

**Rationale:** Assumed React 3 times when project uses Vue, caused friction each time. Simple check prevents wrong assumptions.

---

## 3. Proposed New or Updated Tiny Skills

None proposed. Both improvements are achievable with simple rules.

---

## 4. Evidence & Rationale

### Change 1: Test-first for UI components

**Evidence:**
- June 1: Built `UserCard` component, no tests, rendering bug found later (15 min fix)
- June 3: Built `Modal` component, skipped tests, prop validation failed in usage (20 min fix)  
- June 5: Built `Dropdown`, no tests, keyboard navigation broken (15 min fix)
- June 7: Built `Tooltip`, forgot tests, positioning bug discovered (10 min fix)

**Frequency:** 4 times over 7 days (every other session)

**Impact:** 60 minutes of avoidable rework, delays in delivery

**Alternatives considered:**
- Post-code hook: Too heavy, rule is sufficient
- Separate testing skill: Overkill, TDD is already documented
- More verbose rule: Current proposal is specific and actionable

**Why this works:**
- Specific trigger: "For UI components"
- Clear action: "Write tests FIRST"
- Verification: "Run tests before presenting"

---

### Change 2: Framework detection

**Evidence:**
- May 28: Suggested React hooks syntax, project uses Vue Composition API (user corrected)
- June 2: Proposed JSX pattern, should be Vue template syntax (user corrected)
- June 4: Referenced React patterns in explanation, confused context (user clarified)

**Frequency:** 3 times over 8 days

**Impact:** Friction in workflow, user had to correct repeatedly, slowed conversation

**Alternatives considered:**
- Ask user every time: Too much friction
- Assume Vue: Still an assumption, fails on other projects
- Read package.json: Simple, deterministic, works for all frameworks

**Why this works:**
- Proactive: Check before suggesting patterns
- Deterministic: package.json is source of truth
- Broad: Works for any framework (React, Vue, Svelte, Angular, etc.)

---

## 5. Application Recommendation

### Application Order

1. **Apply framework detection rule first**
   - Add to `~/.claude/rules/common/coding-style.md`
   - Test in next coding session by verifying framework is checked before patterns suggested

2. **Apply test-first rule second**
   - Add to `~/.claude/rules/common/development-workflow.md`
   - Test in next UI component work by observing test-first approach

### Verification Steps

**For framework detection (verify in next 3 sessions):**
- [ ] Check package.json before suggesting code patterns
- [ ] No incorrect framework assumptions
- [ ] User doesn't have to correct framework

**For test-first UI components (verify in next 3 sessions):**
- [ ] Write component tests before implementation
- [ ] Run tests and show results
- [ ] Fewer bugs found after initial implementation

### Follow-Up

**Accessibility patterns:**
- Monitor for 2 more weeks
- If ARIA label omissions reach 3+ instances, add rule
- Current frequency (2 instances) doesn't justify rule yet

**Re-run retrospective:**
- Next review: July 7 (1 month from now)
- Focus on: Did test-first and framework detection rules work?
- Look for: New patterns that might need rules

---

## Notes

**Why these changes are minimal:**
- 2 simple rules, each 1-2 lines
- No new skills created
- No major rewrites
- Focused on repeated, high-impact issues

**Why no skill for testing:**
- TDD workflow already documented in development-workflow.md
- Just need reminder to apply it to UI components
- Rule is sufficient

**Why no accessibility rule yet:**
- Only 2 instances (threshold is 3+)
- Wait for stronger pattern
- Could be addressed in future retrospective if frequency increases

**Confidence level:**
- Framework detection: High (clear pattern, simple fix)
- Test-first UI: High (frequent issue, clear impact)
- Both rules are testable and will show clear improvement

---

**Total proposed changes:** 2 rules (4 lines total)  
**Skills created:** 0  
**Estimated improvement:** ~60 min/month time savings, fewer user corrections  
**Maintenance cost:** Minimal (2 simple rules to maintain)
