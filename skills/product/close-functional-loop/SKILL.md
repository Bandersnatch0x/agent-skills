---
name: close-functional-loop
description: >-
  use this when work piled up without a closable end-to-end loop — vague
  requirements, fuzzy module boundaries, or "can't continue" after lots of
  partial features; run before new coding or agent swarms
---
# Close the Functional Loop

Purpose: when requirements, framework, or boundaries are unclear, first close **one** verifiable end-to-end loop before adding more. Forbid treating "more modules" as progress.

## When to use
- Lots of work exists, but no complete user path
- Writing drifts and nobody can say what "done" means
- Hard boundaries are needed before coding agents or a sprint

## Discipline (throughout)
- No new features and no implement agents until a one-sentence loop exists.
- Advance only **one** main path; everything else goes to the parking lot.
- Outputs must be verifiable — ban unverifiable phrases like "improve the experience" or "enhance capability".
- Cut decisions are proposals and migration plans only; real deletes or public removals need human approval.

---

## Step 0 — Stop the clock
Write three concrete sentences (one line each):
1. What has already piled up (modules / docs / half-finished pieces)
2. The one thing the user still **cannot** finish
3. The specific stuck reason (missing requirements / missing boundaries / missing acceptance / tech debt)

**Done when:** all three name concrete nouns, not moods.

---

## Step 1 — One-sentence loop (JTBD + done state)
Fill in, at most two sentences:

> When **[who]** in **[situation]** wants **[job]**, they use this product to **[key action]** and reach **[observable done state]**.

Also write **3 anti-goals**: outcomes that still would not count as winning (e.g. stars rise while nobody finishes the main path; many modules ship but install leaves users with no next step).

**Done when:** an outsider can tell done vs not. If the done state is unclear, rewrite — do not enter Step 2.

---

## Step 2 — Vertical-slice tracer
Design only **one** newbie path (aim for ≤10 minutes of mental model):

`install/open → first success → second consolidation → clear end`

For each step write:
- What the user sees / does
- The minimal system capability required
- How to accept it (command, screen, return value, file, log)

Label everything off-path as `parking lot` (out of scope this round).

**Done when:** no required step is "optional, later"; the parking-lot list exists.

---

## Step 3 — Framework and boundaries (serve only this path)
Draw **deep module** boundaries for capabilities on the path. Each module answers four questions:

| Module | Public promise (API / command / page) | Internals swappable | Owned data | Forbidden deps |
|--------|----------------------------------------|---------------------|------------|----------------|

Rules:
- Cross-module access only via the public promise
- Modules not needed this round → delete from the plan or move to the parking lot
- If two modules need each other's internals → boundary failed; re-cut

**Done when:** every main-path step maps to exactly one module; no circular leaks.

---

## Step 4 — Success definition and guardrails
Write:
- **North Star (user-behavior level):** the repeated action people take after the loop works
- **This round's only milestone:** one sentence + how to accept it (demo script or test checklist)
- **1–2 guardrails:** things that must not get worse (perf, safety, compatibility, existing paths)
- **Measurement:** where data comes from; if none, the minimal observation method (logs / manual script)

**Done when:** the milestone can be vetoed by "what you can see when it is done".

---

## Step 5 — Feature map (Keep / Defer / Cut)
Judge every existing feature or half-finished piece against the one-sentence loop:

- **Keep:** without it the one-sentence loop fails
- **Keep-as-is:** needed, but freeze — no expansion
- **Defer:** keep code; remove from docs and main-path narrative
- **Cut / Spin-out:** proposal-level only (real delete needs human approval)

Prefer Keep ≤ about 1/3 of the list. The main path may only contain Keep / Keep-as-is.

**Done when:** replaying the main path encounters no Defer/Cut items.

---

## Step 6 — Implementation slices (only then code / agents)
Split the loop into 3–7 **mergeable** slices. Each slice must:
- Make the main path more complete (or lower risk) after merge
- Carry its own acceptance (tests / manual script)
- Declare dependency edges (what blocks what)

Recommended order: `boundaries & interfaces → vertical main path → observability/acceptance → polish`

When dispatching an agent, paste: one-sentence loop + anti-goals + this slice's acceptance + forbidden boundaries.

**Done when:** the first slice alone can demo "one step more complete than yesterday".

---

## Step 7 — Definition of Done
Declare the loop closed only when:
1. A stranger (or you tomorrow) can walk the Step 2 path
2. The acceptance checklist is fully green
3. Parking-lot items did not sneak back onto the main path
4. You wrote the **single next-round candidate loop** (one sentence) — otherwise sprawl restarts immediately

If unmet → status remains "not closed"; do not open a new theme.

---

## Output template (copy per project)

```markdown
# Closed-loop card — <project> — <date>

## One-sentence loop
…

## Anti-goals
1. …
2. …
3. …

## Main path (vertical slice)
1. …
2. …
3. …
Acceptance: …

## Module boundaries
| Module | Public promise | Internals swappable | Data | Forbidden deps |
|--------|----------------|---------------------|------|----------------|

## Milestone / North Star / guardrails
…

## Feature judgments
| Feature | Judgment | Why |
|---------|----------|-----|

## Parking lot
- …

## Slice order
1. … (acceptance: …)
2. …

## DoD
- [ ] Main path walkable
- [ ] Acceptance green
- [ ] Parking lot did not return
- [ ] Next-round candidate loop: …
```

## Handoffs to related skills
- Goals feel vague → **goals-and-success-metrics**
- Too many features → **feature-scope-triage** (needs a one-sentence positioning/loop first)
- Positioning unclear → **product-positioning-audit** / **target-user-and-jtbd**
- Card written and ready to land → to-spec / to-tickets / implement (or your repo's implement skill)