---
name: implementation-quality-audit
description: >-
  Audit a messy, agent-built, or half-finished codebase for implementation
  quality — map → contract checklist → five-axis review → prioritized report.
  Use before calling agent-built work done, when a repo feels chaotic, or before
  merge/deploy. Not for single-file nits, style-only review, or a known bug fix.
---
# Implementation quality audit (generic)

Audit a messy, agent-built, or half-finished codebase for **implementation quality**. Produce a prioritized verification report. Do **not** rewrite the product during the audit unless the user explicitly asks after the report.

Inspired by patterns common in high-star agent skill packs (multi-axis review, architecture-first gating, map→review→synthesize, severity labels, anti-rationalization). Adapt to whatever stack and docs the repo actually has.

## When to use

- Project feels chaotic / lost track of what agents built
- After a feature or milestone, before calling it "done"
- Before merge/deploy of agent-generated work
- Orienting on an unfamiliar tree

## When not to use

- Single-file nits → just read the file
- Pure style → linter
- You already know the bug → fix it

## Inputs

Resolve before scoring:

1. **Repo root** (workspace or named path)
2. **Contract sources** (first available wins per category; cite paths):
   - Spec / DoD / PRODUCT / ADR / issue
   - Architecture notes (`docs/architecture*`, `CONTEXT.md`, `AGENTS.md`)
   - Coding standards (`CODING_STANDARDS.md`, `CONTRIBUTING.md`, linters)
3. **Scope**: whole tree (default) or path/branch/PR the user named
4. If there is **no** spec: still audit on axes below, but mark Spec-fit as `NO_SPEC` and do not invent product acceptance criteria

## Process

### Phase 1 — MAP (structure, not business logic)

Build a cheap structural picture:

- Top-level layout; entry points (CLI, API, UI, workers, skills)
- Duplicate / drift signals: `*-old`, `copy`, `backup`, twin `src` trees, conflicting docs
- Module boundaries (directories with high internal cohesion)
- High fan-in shared files (config, auth, db, logging)
- Tests / smoke / CI entrypoints
- Claimed architecture in docs vs folders that exist

Emit a short **Mess map**: intentional · drift/duplication · dead/empty shells.

For small trees (<~30 source files): map lightly and review in one pass.
For larger trees: chunk by module/domain; review chunks independently then synthesize.

Completion: the mess map names entry points, module boundaries, duplicate/drift signals, tests/CI surfaces, and docs-vs-folders contradictions.

### Phase 2 — CONTRACT checklist (only from real docs)

From specs/ADRs/DoD, extract ≤40 **must-hold** items (merge duplicates).
If no spec: skip product checklist; still run Phase 3 axes.

Score each item:

| Verdict | Meaning |
|---|---|
| **PASS** | Implemented + evidenced (code and/or test / runnable path) |
| **PARTIAL** | Present but incomplete, bypassable, or only documented |
| **FAIL** | Required and missing or contradicted |
| **N/A** | Explicitly out of scope for this cut |
| **BLOCKED** | Cannot verify — say what access/fixture is missing |

Evidence rules: cite path/symbol/test. README-without-code ≠ PASS. Stub without tests ≤ PARTIAL.

Completion: every extracted must-hold item has a verdict and evidence path; when no spec exists, the report explicitly says `NO_SPEC`.

### Phase 3 — MULTI-AXIS review

Evaluate the scoped code (or each chunk) on five axes. Prefer **tests-first** reading when tests exist: tests reveal intended behavior.

#### 1. Correctness
- Matches stated spec/task (if any)
- Edge cases and error paths, not only happy path
- State consistency; no false "success" without verification
- Tests test behavior that would catch regressions

#### 2. Readability & simplicity
- Clear names; straightforward control flow
- Abstractions earn their cost (don't generalize before ~third use)
- Dead artifacts: shims, `_unused`, `// removed`, commented-out blocks
- Conditionals bolted onto unrelated flows → design smell

#### 3. Architecture
- Fits existing patterns; new patterns justified
- Module boundaries honest; dependencies point the right way
- Feature logic not leaking into shared kernels
- Refactors that **relocate** complexity without reducing concept count → flag
- Prefer deleting pass-through wrappers over polishing them

#### 4. Security
- Secrets out of code/logs
- Input validated at boundaries; injection surfaces checked
- AuthZ on sensitive paths
- External/API/config data treated untrusted
- Dependency hygiene: prefer stdlib/existing; no casual new deps; lockfile honesty

#### 5. Performance
- N+1 / unbounded loops or fetches
- Missing pagination on lists
- Hot-path allocations; sync where async is required
- Quantify when possible ("~N ms per item") instead of "might be slow"

Also score **sprawl & drift** (doc↔code ghosts, twin names, speculative frameworks unused by DoD) and **verification story** (what was run: unit/smoke/CI/manual).

Completion: every scoped module or chunk has five-axis scores, sprawl/drift notes, and a verification story backed by evidence.

### Phase 4 — Findings discipline

Label every finding:

| Label | Meaning |
|---|---|
| **Critical** | Blocks ship: data loss, auth hole, broken core behavior, false-complete |
| **Required** | Must fix before calling quality acceptable |
| **Optional / Consider** | Improvement; author may defer with reason |
| **Nit / FYI** | Style or context; not blocking |

Order by leverage: Critical → Required → structural → Optional → Nit.
Cap human attention: at most **5** "Stop and Look" (Critical/top Required).

Separate:

- **Decisions** (need human stamp: store choice, auth model, public API shape)
- **Implementations** (need tests / fixes)

Propose a **named remedy** for structural issues (extract helper, move to owning module, collapse duplicate branch, make type boundary explicit) — not only "this is complex".

Completion: findings are labeled, ordered by leverage, separated into decisions vs. implementations, and every structural issue names a remedy.

### Phase 5 — Rollup verdict

| Verdict | When |
|---|---|
| **PASS** | No Critical/Required left (or only explicitly deferred Optional); verification story credible |
| **REVISE** | Has Critical/Required or dangerous PARTIAL on contract items |
| **BLOCKED** | Cannot finish audit (no access, empty tree, missing fixtures) |

Approval posture (for change-scoped audits): approve when the change **clearly improves overall health**, even if imperfect — do not block for "not how I would have written it."

Never accept "we'll clean it up later" as closing a Required finding.

Completion: the rollup states PASS, REVISE, or BLOCKED, plus the exact blocking or required-fix reasons.

## Report format

Default language: follow the user (Chinese if they write Chinese).

```markdown
# 实现质量检验报告

## 总评
- 结论: PASS | REVISE | BLOCKED
- 一句话:
- 范围:
- 对照文档: <paths or NO_SPEC>

## 凌乱度速写 (MAP)
- 意图清晰:
- 漂移/重复:
- 死代码/空壳:
- 高扇入共享点:

## 契约清单 (若有)
| ID | 要求 | 结论 | 证据 | 缺口 |
|---|---|---|---|---|

## 五轴摘要
| 轴 | 1-5 | 说明 |
|---|---|---|
| Correctness | | |
| Readability | | |
| Architecture | | |
| Security | | |
| Performance | | |

## 🔴 Stop and Look (≤5)
1. [Critical|Required] … — path — why — remedy

## 🟡 Verify with a Test
- … — suggested test

## 🟢 Noted
- …

## 🧭 Decisions for human
- …

## 优先修理 (≤7, 按风险)
1. module/path — acceptance check that flips to PASS

## 建议下一步
- 先做 / 可延后 / 不要做 (对照 non-goals)
```

## Anti-rationalization

| Excuse | Reality |
|---|---|
| "It works" | Working + unreadable/insecure/wrong seam still fails the audit |
| "Tests pass" | Necessary not sufficient — miss architecture & security |
| "AI code is fine" | Needs more scrutiny, not less |
| "Clean later" | Later rarely comes; Required stays open |
| "Refactor is cleaner" | If concept count is unchanged, complexity only moved |
| "README says done" | Docs ≠ evidence |

## Anti-patterns for the auditor

- Do not re-architect in the report voice
- Do not invent product requirements when NO_SPEC
- Do not inflate style into Critical
- Do not produce a 30-page dump — prioritize
- Do not treat search rank, chat claims, or aspirational docs as proof of gates

## Optional deepen (only if asked)

- File-level boundary map / dependency sketch
- Diff vs a previous audit
- Tickets from top FAIL/Critical items
- PR-scoped mode (fixed point `git diff base...HEAD`) using the same axes
