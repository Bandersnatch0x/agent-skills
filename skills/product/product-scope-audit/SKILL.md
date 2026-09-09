---
name: product-scope-audit
description: Evidence-backed continue / narrow / reposition / pause-to-validate / stop recommendation for an early or drifting product, plus one next action — auditing capability boundaries (own / integrate / defer / exclude), end-to-end journeys, and broken handoffs to find the smallest coherent product worth continuing. Use when the project lacks focus, features accumulated without a coherent workflow, or the next product bet needs grounding. Not for routine code review or isolated bug fixes.
---

# Product Scope Audit

Find the smallest coherent product worth continuing, not the largest feature list worth building.

Deliver an evidence-backed recommendation to **continue, narrow, reposition, pause to validate, or stop**, followed by one next action. These are recommendations for the user to decide, not permission to change the product.

## Operating contract

- Work sequentially with one agent by default. Delegate only when the user explicitly requests it and the available budget permits it. Depth or brainstorming does not authorize subagents.
- Audit before implementation. Preserve existing decisions, paused work, and user changes. An audit does not authorize product edits, publication, recruitment, telemetry, or restarting a paused initiative.
- Apply to applications, libraries, CLIs, plugins, services, and non-code products. Translate touchpoints to the product: a callable API or documented CLI can be a complete entrypoint; a graphical console is not inherently better.
- Repository evidence can establish implementation and delivery facts, not product-market fit. Treat customer demand, willingness to switch, and business viability as hypotheses unless direct evidence supports them.
- Follow the user's output language and the workspace's artifact conventions. Use available local search and context tools; this skill has no mandatory tool, service, or sibling-skill dependency.

## 1. Frame the decision

Read the request, local instructions, current branch/worktree, product definition, and active decisions before surveying features. Record the product and stage, stated goal, constraints, paused work, target outcome, evidence available, and the decision the user needs. Separate inspection scope from authorized actions.

If no repository or implementation exists, audit the idea, brief, and proposed journey. Mark execution claims unverified rather than inventing code defects. Ask only for missing business intent that materially changes the analysis; discover local facts yourself.

Completion: the audit has a bounded question and distinguishes the user's goal from your interpretation.

## 2. Build a compact evidence map

Choose sources by the claim they can establish. Start with exact anchors when known; use semantic retrieval for unknown locations if available, then follow the actual entrypoint and its consumers. Inspect the narrowest useful slices of docs, contracts, exports/routes/commands, implementation, tests, package/release surfaces, support records, and usage evidence.

For each important capability, separate:

| Question | Suitable evidence |
| --- | --- |
| What is promised or authorized? | Current product contract, scope decisions, explicit user decisions |
| Is it implemented? | Reachable source path, relevant tests, observed behavior |
| Is it distributed? | Package inventory, release/build artifacts, enabled entrypoints |
| Is it ready and usable here? | Maturity decisions, acceptance gates, prerequisites, actual access path |
| Has it helped the intended user? | Observed task completion, direct user evidence, disclosed interventions |

These are independent questions: implemented does not imply distributed, distributed does not imply usable, and passing tests do not imply validated demand. A paused release can contain code without authorizing its public use.

Classify claims as **verified fact**, **inference**, **hypothesis**, or **unknown**. Cite paths/anchors and the inspected revision; label historical records by date. Resolve documentation conflicts per claim instead of picking one globally authoritative file.

Before calling something missing, inspect its likely entrypoint, implementation, and relevant consumer/test. If inspection remains incomplete, report "not established in the inspected scope." Intentional internal-only or gated capabilities are not automatically defects.

Stop collecting when decision-relevant claims have adequate evidence and contrary evidence has been considered. Prefer a bounded source ledger to raw file dumps or repeated repository-wide scans.

Completion: each high-impact conclusion has a source or an explicit evidence gap; completed work is not proposed as new work.

## 3. Test positioning, users, and boundaries

Use the six core lenses in [review-lenses.md](references/review-lenses.md). Apply additional lenses only where the product's stage and evidence make them relevant.

Write a provisional positioning sentence:

> For **a specific user in a specific situation**, this product enables **an observable outcome** better than **the current alternative**, through **its owned capability**, within **explicit exclusions**.

Test whether the goal, users, capability portfolio, and delivery model agree. Distinguish operator, beneficiary, buyer, administrator, and approver where those roles matter. Include expertise, permissions, resources, accessibility, and environment rather than treating a persona as a job title.

Map capabilities to **own / integrate / defer / exclude**, with an outcome, boundary, and owner for each. Capability domains describe responsibilities, not technology stacks or folders. A proposed reversal of a user decision is a decision to discuss, not a silent redefinition.

Completion: all six core lenses have a finding, an evidence gap, or a justified not-applicable result; the positioning verdict states what would falsify it.

## 4. Walk journeys, including failure and return paths

Build two separate maps:

1. **Product-user journey**: trigger/discovery -> access/setup -> first value -> core task -> result/trust -> handoff -> return, recovery, or appropriate exit.
2. **Builder/operator workflow**: idea/decision -> work intake -> implementation -> verification -> distribution/operation -> feedback -> next decision.

For consequential transitions, name the actor, intent, actual entrypoint, prerequisites, output, next owner/action, and failure/recovery path. An internal development command is not automatically a customer touchpoint.

Trace the main task, first use, and the highest-risk interruption or delivery handoff. Use available tests or a bounded walkthrough; distinguish observed behavior from source-only reasoning. Never present a hypothetical walkthrough as a user test.

Look especially for:

- implemented value with no usable path for the intended user;
- competing responsibilities, decisions, or state owners;
- a completed output that the next actor cannot consume;
- blockers, rejected work, stale evidence, or interrupted sessions with no safe next action;
- recurring use that learns nothing from outcomes or forces users to start over.

A one-shot product can have a valid terminal state. Require a return loop only when the intended job needs one.

Completion: show where each broken transition occurs and which actor pays for it, not merely that a feature is absent.

## 5. Generate alternatives, then subtract

Brainstorm against established gaps, not fashionable feature categories. For each important gap consider connecting existing capability, simplifying/removing work, repairing a boundary, a manual/no-build experiment, and only then adding capability. Do not fill a quota with unnecessary features.

A **signature outcome** is a distinctive, demonstrable user result relative to the current alternative. Name the task, before/after benefit, smallest proof, and why the user would choose it again when the job recurs. Cosmetic novelty and an untested claim of uniqueness are insufficient.

Keep an opportunity ledger:

`ID | user/job | broken transition or unmet outcome | evidence/confidence | proposed change | reused capability | owner/boundary | dependencies | smallest validation | maintenance cost | disconfirm/stop condition | disposition`

Use qualitative priority with explicit reasoning. Avoid unsupported market numbers, fabricated frequency, precise effort estimates, or numerical scores that hide missing evidence. Compare impact, evidence strength, time to first value, maintenance burden, and reversibility. The best next step may be removal or validation rather than a feature.

When continuing an earlier review, give every prior item a disposition: keep, merge, reclassify-as-existing, defer, reject, or needs-evidence. Retain its ID and rationale. "Review everything" does not mean "implement everything."

Completion: the short candidate set explains what not to build, includes a credible signature-outcome hypothesis or states why none is supported yet, and introduces no second owner for existing truth.

## 6. Deliver a decision, not another backlog

Place the report in the user-requested location or existing notes/research convention. For an explicitly read-only/no-file request, answer without persisting artifacts. Use this reading order:

1. Recommendation and confidence, with assumptions that could reverse it.
2. Positioning, primary user/job, and owned capability boundary.
3. Capability evidence and the two journey maps.
4. Prioritized gaps, observable costs, and root causes versus symptoms.
5. Opportunity ledger: now / later / not now, including subtraction and signature outcome.
6. One next action: owner, prerequisite, input, output, and observable exit/stop condition.
7. Evidence gaps, inspection scope, and validation actually performed.

Route by the blocker: missing evidence -> bounded research/experiment; unresolved product choice -> documented interview; agreed scope -> specification; executable uncertainty -> prototype; ready work -> implementation. Use installed workflows when available and an equivalent plain-language step otherwise. A full roadmap is not the default deliverable.

When an interview is requested, ask only decisions whose prerequisites are settled. Number the current questions, recommend an answer with its tradeoff, and wait. Facts remain your work. Record proposals as pending; only confirmed terms and decisions enter the canonical glossary or decision log.

Stop after the report and next decision are clear. When creating or changing this skill, use [behavior-probes.md](references/behavior-probes.md) to check decision quality as well as packaging; disclose author walkthroughs as such.
