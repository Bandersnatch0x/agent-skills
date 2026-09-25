---
name: idea-stress-test
description: Stress-test the idea a repository is built on into an investment decision — falsifiable hypotheses, evidence for and against from the repo and the outside world, the single bottleneck belief most likely to change the decision, and the highest-information next experiment. Use when the user asks whether the project in this repo deserves continued time, money, or effort now, wants to know what to validate before building further, asks for a deep pass on a commitment decision, or hands over a book or framework to evaluate against the methodology. Not for code review, feature triage, or auditing internal product coherence.
---

# Idea Stress Test

Help decide how much time, money, and effort the project in this repository deserves right now. Investigate the way a rigorous investor would: reconstruct the idea the repo is built on, turn it into falsifiable hypotheses, weigh evidence for and against, isolate the bottleneck belief, and hand back the most information-efficient next step.

## Operating contract

- Optimize in this order: **decision utility, evidence quality, bottleneck uncertainty, learning speed, completeness** — and stop expanding the analysis once the decision can be made on what you have.
- Runs have two depths: the fast stress test is the default; a run goes deep when the user is weighing a real commitment of money or months of work, or testing an active thesis.
- Calibrate to the user's intended outcome for the repo — side project, profitable small business, bootstrapped company, VC-scale startup, strategic product, or unclear — and to the specific decision at hand.
- Be direct and intellectually honest: never flatter, and state evidence exactly as strong as it is — conclusive, weak, or unknown, said plainly. Every important piece of evidence gets a disconfirmation attempt.
- Repository evidence establishes implementation and delivery facts, not demand. Treat customer demand, willingness to pay, and adoption as hypotheses unless direct evidence supports them — claims from the README, the docs, or the user's own statements are grade E until something behind them is found.
- Follow the user's output language and the workspace's artifact conventions. Use available local search, retrieval, and web tools for evidence work; this skill has no mandatory tool or sibling-skill dependency.
- This skill may be cloned. A clone starts from a fresh creator and a fresh evidence base — unless the clone itself explicitly carries context — and keeps the methodology, never the original creator's memory, company, projects, private information, preferences, or conclusions.

## 1. Reconstruct the thesis

Read the request, then the repository: README, docs, recent commits, product surfaces, tests, notes and decision logs. Reconstruct the idea the repo is built on, and the decision the user actually needs — keep building, invest more, pause, stop, or redirect.

If the message states a direction, start there and let the repo confirm or contradict it. If the message and the repo together cannot determine the direction, ask one line — "What is this project meant to become?" (Chinese: 「你想把这个项目做成什么？」) — and wait; the question is the entire message, send it alone.

Completion: the idea under test and the decision needed are both on the table, reconstructed from the repo wherever the repo could supply them.

## 2. State the core argument

Restate the idea as a core argument: for **this user**, doing **this job**, **this repo's product** beats **the current alternative**, and therefore **the intended outcome follows**. Infer whatever is reasonably inferable before asking anything.

Questions are the exception, not the ritual — they exist to resolve the argument, not to complete a profile or run a preset workflow:

- At most three, and only when the answer is decision-critical.
- Zero when the message and the repo already support a stable argument.
- Exactly one when a key ambiguity touches users, jobs, product, market, business model, distribution, or the conclusion itself — and only when the intended argument cannot otherwise be reliably determined and the ambiguity would materially change the analysis. Pick the highest-information question and wait.
- The user chooses among strategic alternatives after the analysis, not during it: when the core argument is stable, analyze it; bring alternatives in afterward, as hypotheses or stronger neighboring arguments the evidence supports.

Completion: every slot of the core argument — user, job, product, alternative, intended outcome — is filled or explicitly carried as an unknown, and no remaining unknown would flip the conclusion.

## 3. Investigate

Convert the core argument into falsifiable hypotheses and hunt for evidence on both sides — inside the repo and outside it. Classify every load-bearing claim:

| Grade | Evidence |
| --- | --- |
| A | Behavioral — payments, conversions, signed commitments, telemetry or usage showing real task completion, observed workarounds |
| B | Strong direct — product/customer data, actual pricing, procurement, disclosures, repeated first-party complaints (issue tracker, support records) |
| C | Corroborating — reviews, practitioner discussions, Reddit/HN/X, case studies |
| D | Proxy — search demand, job postings, funding, market reports, macro trends, adjacent adoption |
| E | Assertion — README or docs claims, the user's own statements, a claim with nothing behind it |

Grades D and E mark open gaps, not validation: keep looking until they upgrade or the claim is dropped. When the best available evidence tops out at C or D, bias the recommendation toward the cheapest decisive experiment before any further build investment. Include a stronger neighboring argument only when the evidence points that way — a nearby user, job, or product form with better support than the one proposed.

When external evidence can materially improve a named claim, hypothesis, competitor or alternative analysis, prior-attempt search, pricing, or disconfirmation, run the evidence-investigator pass (see Specialist passes). When the user supplies a book or framework, run a method contribution evaluation first (see Frameworks).

Completion: every load-bearing claim carries a grade or an explicit evidence gap, and contrary evidence was sought, not just supporting evidence.

## 4. Find the bottleneck belief

Name the bottleneck belief — the single uncertainty most likely to change the decision. One, not a list. Then prioritize the next experiment against it by information gain: expected information gain, importance, cost, time, reversibility, evidence strength — a directional comparison, with no fabricated numbers.

A concierge test — doing the service manually before building — enters the comparison like any other option and wins only on information gain.

Completion: one bottleneck belief is named, with the decision it would flip and a concrete next experiment — the action, who or what it runs against, the signal that would flip the belief (and what result kills the idea), and a cost/time ceiling.

## 5. Deliver in chat

Deliver in this order:

1. The recommendation shaped by decision utility: keep building, pause to run the experiment, stop, or redirect onto a stronger neighboring thesis — and what the next step costs in time, money, and attention relative to what it can teach.
2. The core argument, restated after the analysis: reasons to believe (with evidence grades), what remains assumption, and the collapse conditions — what would make the theory fall apart.
3. The next experiment against the bottleneck belief, delivered as a complete protocol in the same run — never left as "validate X" for the user to flesh out.

Fast stress test results stay in chat. Create a persistent file only when the user asks, the run has gone deep (see Operating contract), or the analysis is clearly better as a file — and even then, conclusions and next steps also stay in chat.

Completion: the user can say what they have reasons to believe, what is still assumption, what would collapse the theory, and what to run next.

## Frameworks

Frameworks are tools, not answers. A framework earns its way into the analysis only when all three hold: it targets a question relevant to the current decision, it adds something the core methodology does not already cover, and it could change the analysis or the next action. Reason from evidence first; when a framework and stronger real-world evidence disagree, the evidence wins. Name a framework to the user only when the name itself helps them.

When the user hands over a book or external framework, run a **method contribution evaluation** before changing anything — one book per evaluation:

1. What it adds that the methodology lacks.
2. What the methodology already covers.
3. Where it improves or conflicts with existing rules.
4. When it should and should not trigger.
5. Specific rules worth adopting verbatim.
6. Failure modes it introduces.
7. New assessments, if any.
8. Recommended action: adopt, selectively include, keep as optional lens, reject as redundant, or reject as harmful.

## Specialist passes

Three passes exist, each behind a gate. The gate is the state the stress test has already reached — a pass fires on that state, never on the topic alone.

**Evidence investigator.** Fires when the investigation needs external evidence that can materially improve named claims, hypotheses, competitor or alternative analysis, prior-attempt search, pricing, or disconfirmation. It does not fire merely because a repository exists, and it never publishes final conclusions.

**Experiment designer.** Fires when a bottleneck belief — or a comparable major uncertainty — has been identified and an experiment can resolve it. The identified uncertainty is the input: design against it, never invent or replace it. It delivers the experiment protocol in the same run — action, subjects, flip signal, cost ceiling, kill rule — and does not allocate funding or publish final conclusions.

**Method encoder.** Fires when the user's materials classify as method — frameworks, scoring rubrics, investment memos, operating principles, idea-evaluation approaches — and an optional reasoning lens is wanted. It reads this skill but never edits it or any methodology file; captured lenses live in working notes. It does not fire on evidence, preference, or background material, or to publish final conclusions.
