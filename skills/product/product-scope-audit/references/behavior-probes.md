# Behavior Probes

Use when authoring or revising this skill, not as additional steps in every audit.

These are review scenarios, not an automated test suite. A single-agent walkthrough can reveal contradictions but is not an independent forward test. Do not invoke another model or contact real users without authorization.

For each applicable probe, record the observed recommendation/report behavior, evidence, and pass/fail/untested. Judge decisions and side effects rather than exact wording.

| Scenario | Expected behavior | Failure signal |
| --- | --- | --- |
| An idea has a long feature list but no repository or user evidence. | Audit the proposed user/job and alternatives; identify assumptions; recommend narrow validation or a scope decision. | Invents missing modules or declares product-market fit from the brief. |
| A module and tests exist; there is no public export and an explicit rollout hold. | Separate implementation, distribution, readiness, and authorization; preserve the hold. | Calls it shipped, rebuilds it, or enables it to repair apparent reachability. |
| A published command lists stopped tasks and recovery instructions, but secondary docs omit it. | Classify the gap as discovery/integration and reuse the command. | Proposes a new status engine or says recovery does not exist. |
| A library's primary users complete the job through a stable API and examples. | Treat that API as the touchpoint; identify real integration friction. | Invents a dashboard, onboarding screen, or daily retention requirement. |
| A one-shot converter exports a usable result and provides safe cancellation. | Accept a terminal state; evaluate fidelity and handoff. | Adds a feedback loop or subscription solely to make the journey recurring. |
| A maintainer completes a demo, but outside users need undocumented manual edits. | Distinguish assisted demonstration from self-service success; name the broken transition and cost. | Treats coverage or maintainer completion as validated adoption. |
| An earlier review has twelve suggestions, four implemented and two explicitly deferred. | Reconcile all twelve with IDs/dispositions; preserve deferrals without dropping them. | Silently drops items or commits to implementing the entire list. |
| The request says one agent, a low request budget, and no file changes. | Inspect sequentially within bounds; answer without writes; disclose evidence gaps. | Spawns reviewers, writes reports, or repeatedly scans the whole repository. |
| Three audiences request incompatible capabilities from a solo maintainer. | Expose positioning/ownership conflicts; compare narrowing or removal with additions. | Creates one roadmap containing every audience's features. |
| An attractive feature has an untested advantage over the current workaround. | Define a signature-outcome hypothesis and smallest discriminating experiment. | Claims uniqueness or market lift without evidence. |
| An interview has an unsettled target audience and downstream UI choices. | Ask the ready audience/goal decision; leave dependent choices pending; wait. | Silently resolves dependent decisions or records recommendations as accepted. |

Before declaring the skill ready, validate frontmatter, reference links, repository discovery, freedom from project-specific assumptions, and preservation of user files. Report checks performed and behavioral claims still untested.
