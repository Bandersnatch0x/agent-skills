---
name: close-functional-loop
description: >-
  use this when work piled up without a closable end-to-end loop: missing
  done-criteria, fuzzy module boundaries, or partial features that block
  progress; run before coding or agent swarms
---
# Close the Functional Loop

Close **one** walkable end-to-end loop before adding more surface area. Progress is a *tracer* the user can finish, not a growing pile of modules.

## Prerequisite
None. If positioning itself is the unknown, run **product-positioning-audit** or **target-user-and-jtbd** first, then return here.

## Steps

1. **Stop the clock** — three one-line facts:
   - what has piled up (modules / docs / half-finished pieces)
   - the one job the user still cannot finish
   - the stuck cause (requirements / boundaries / acceptance / debt)

   **Done when:** each line names concrete nouns, not moods.

2. **Write the *one-sentence loop*** (≤2 sentences) and **3 *anti-goals***:

   > When **[who]** in **[situation]** wants **[job]**, they use this product to **[key action]** and reach **[observable done state]**.

   Anti-goals are outcomes that still fail (stars without a finished path; modules without a next step after install).

   **Done when:** an outsider can tell done from not-done. Unclear done state → rewrite; stay on this step.

3. **Design one *tracer*** (newbie path, ≤10 minutes of mental model):

   `install/open → first success → second consolidation → clear end`

   Per step: user action, minimal capability, acceptance (command / screen / return / file / log). Everything off-path goes to the *parking lot*.

   **Done when:** every required step has acceptance, and the parking lot is listed.

4. **Cut *deep module* boundaries** for capabilities on the tracer only:

   | Module | Public promise (API / command / page) | Internals swappable | Owned data | Forbidden deps |

   Cross-module traffic uses the public promise only. Unused modules leave the plan or join the parking lot. Mutual need for internals → re-cut.

   **Done when:** each tracer step maps to exactly one module with no circular leaks.

5. **Pin success** — North Star (repeated user behavior), this round's only milestone + acceptance, 1–2 guardrails, measurement path (or minimal logs/script).

   **Done when:** the milestone fails a "what can you see when it is done?" check only if unmet.

6. **Judge features** against the one-sentence loop — one tier each:
   - **Keep** — loop fails without it
   - **Keep-as-is** — needed; freeze
   - **Defer** — keep code; drop from docs and tracer narrative
   - **Cut / Spin-out** — proposal only (human approval before delete)

   Aim Keep ≤ ~1/3. Tracer may hold only Keep / Keep-as-is.

   **Done when:** replaying the tracer hits no Defer/Cut item.

7. **Slice for build** — 3–7 mergeable slices. Each slice after merge makes the tracer more complete (or safer), carries acceptance, and declares blockers.

   Order: `boundaries & interfaces → tracer → observability → polish`.

   Agent brief = one-sentence loop + anti-goals + this slice's acceptance + forbidden boundaries.

   **Done when:** slice 1 alone demos "one step more complete than yesterday."

8. **Close the gate** — loop is closed only when:
   - a stranger (or you tomorrow) walks the tracer
   - acceptance is green
   - parking-lot items stayed off the tracer
   - the next round's single candidate loop is written (one sentence)

   **Done when:** all four hold. Otherwise status stays *not closed*; open no new theme.

## Output — *closed-loop card*

```markdown
# Closed-loop card — <project> — <date>

## One-sentence loop
…

## Anti-goals
1. …
2. …
3. …

## Tracer
1. … (acceptance: …)
2. …
3. …

## Module boundaries
| Module | Public promise | Internals swappable | Data | Forbidden deps |

## Milestone / North Star / guardrails
…

## Feature judgments
| Feature | Judgment | Why |

## Parking lot
- …

## Slice order
1. … (acceptance: …)

## Gate
- [ ] Tracer walkable
- [ ] Acceptance green
- [ ] Parking lot stayed off tracer
- [ ] Next candidate loop: …
```

## Discipline
- Write the one-sentence loop before opening features or implement agents.
- Advance one tracer; route the rest to the parking lot.
- Prefer acceptance you can demo or run.
- Propose cuts and migrations; wait for human approval before deleting or publishing removals.

## Handoffs
- Vague goals → **goals-and-success-metrics**
- Feature sprawl after the loop exists → **feature-scope-triage**
- Positioning unclear → **product-positioning-audit** / **target-user-and-jtbd**
- Card ready to land → to-spec / to-tickets / implement