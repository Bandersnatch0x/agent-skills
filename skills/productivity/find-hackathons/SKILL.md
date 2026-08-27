---
name: find-hackathons
description: Find and verify currently enterable hackathons, then optionally generate a bilingual local filtering webpage with participant-profile matching and agent-ready brainstorm briefs. Use when a user wants events filtered by deadline, location, participation format, eligibility or submission requirements, track, required technology, developer-account availability, or prize type such as cash, credits, hardware, services, or swag.
---

# Find Hackathons

Produce an evidence-backed shortlist of hackathons the user can actually enter. Treat official rules as authoritative over listings and marketing pages.

## Workflow

### 1. Fix the Search Contract

Capture only constraints that change the result:

- Deadline range and user timezone
- Country or region, distinguishing separately listed jurisdictions such as mainland China and Hong Kong
- Location and participation format: online, in-person, or hybrid
- Event type and track direction
- Participant requirements: age, student or employee status, individual or company entry, team size
- Build requirements: mandatory SDKs, platforms, licenses, or new-work rules
- Submission artifacts, including whether public app-store publication is feasible
- Prize preference: cash, credits, hardware, services, swag, other, or any
- Participant profile for matching: skill stack, preferred tracks, build targets, country, age, participant status, team size, delivery capabilities, app-store developer accounts, and required cloud or vendor accounts
- Interface locale: English or Simplified Chinese
- Desired output: concise answer, Markdown comparison, local filterable webpage, agent brainstorm brief, or a combination

Ask only for missing hard constraints. If country or timezone affects eligibility or deadline conversion, obtain it before verification. Otherwise state any defaults used.

**Complete when:** every hard filter has a value or an explicit default.

### 2. Build a Candidate Ledger

Search with the current year across multiple discovery sources, including Devpost, MLH, DoraHacks, Taikai, lablab.ai, Encode, ETHGlobal, Unstop, and event organizers. Use aggregators only to discover candidates.

For each plausible event, record:

- Event page and official rules URL
- Submission-period end
- Location and participation format
- Event type and tracks
- Eligibility and exclusions
- Required technology and submission artifacts
- Prize table with each prize's stated form

Discard ended events immediately. Keep a candidate unresolved until every user-selected filter has source evidence.

**Complete when:** each candidate is rejected with one explicit failed constraint or has evidence for every applicable gate.

### 3. Apply the Verification Gates

Verify each candidate independently; never transfer terms from a sibling event.

#### Current and Reachable

Use the rules' submission-period end. Preserve the source timezone, convert it to the user's timezone, and calculate the remaining build window from the current date. Reject closed events and deadlines outside the requested range.

#### Location and Eligibility

Read eligibility and exclusion clauses for the user's exact jurisdiction. Distinguish separately named jurisdictions. Verify age, student or employee status, company incorporation, government-employee restrictions, team size, in-person attendance, and access to required vendor services. Keep ambiguous candidates out of a verified shortlist.

#### Type, Track, and Requirements

Separate mandatory terms from recommendations. Record the event type, available tracks, must-use technology, licensing, work-created-during-event rules, and every required submission artifact. Reject a candidate when the user cannot satisfy a mandatory term, such as a public App Store or Play Store listing.

#### Prize

Classify each prize as `cash`, `credits`, `hardware`, `services`, `swag`, or `other`. Preserve the organizer's exact value wording. Count only prizes the user is eligible to win, and never convert non-cash benefits into an invented cash value. When cash is requested, pass only a prize table that specifies money or explicitly says the award is cash.

#### Source Quality

Resolve conflicts in this order:

1. Official rules or terms
2. Organizer event page
3. Hosting-platform event page
4. Third-party listing

Exclude a candidate when authoritative terms are unavailable, stale, or contradictory after checking the higher-ranked source.

**Complete when:** every shortlisted event passes all requested filters with direct source support.

### 4. Rank and Report

Rank verified survivors by eligibility certainty, submission feasibility, prize fit, remaining time relative to build cost, and track fit. Recommend one default and explain the decisive trade-off.

State the verification date and user timezone. For each event report:

| Event | Deadline | Location / format | Type / tracks | Eligibility | Requirements | Prizes | Main risk |
|---|---|---|---|---|---|---|---|

Include the event URL, official rules URL, exact deadline, exact prize wording, submission checklist, and a quoted or tightly paraphrased eligibility clause with its source. End with the default pick, rejection counts by failed gate, and direct source links. If no candidate survives, identify the eliminating constraints rather than padding the result.

### 5. Generate a Local Webpage When Requested

Read [the data contract](references/data-contract.md), save the verified survivors and machine-checkable participation requirements as JSON, resolve this skill's installed directory, and run:

```bash
node "<skill-directory>/scripts/generate-page.mjs" <hackathons.json> [hackathons.html]
```

The generated HTML is self-contained and provides:

- English and Simplified Chinese interface switching with localized dates
- Filters for date range, location, participation format, event type, requirements, track, prize type, and free text
- A right-side participant profile for skill stack, preferred tracks, build targets, country, age, participant status, team size, delivery capabilities, developer accounts, vendor accounts, and prize preference
- Hard-gate compatibility filtering plus soft ranking for skill and track overlap
- Event selection and a copyable or downloadable Markdown brief containing the profile, event constraints, prizes, risks, evidence links, and explicit prompts for another agent to brainstorm concepts and plans

Preserve sourced event and rule wording in its original language; localize interface labels rather than silently translating evidence. Open the page locally and exercise each requested filter, profile gate, locale, event selection, and brief action before reporting completion.

**Complete when:** the page loads without external dependencies, the displayed count matches the data, requested filters and profile gates change visible cards correctly, language switching updates the interface, and selecting an event produces an evidence-linked Markdown handoff.
