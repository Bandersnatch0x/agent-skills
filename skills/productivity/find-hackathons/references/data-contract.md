# Hackathon Data Contract

Use this contract when generating a local filterable page. Save UTF-8 JSON with a top-level object:

```json
{
  "generatedAt": "2026-08-28T12:00:00+08:00",
  "timezone": "Asia/Shanghai",
  "defaultLocale": "zh-CN",
  "hackathons": []
}
```

Each `hackathons` item uses these fields:

```json
{
  "id": "example-hackathon-2026",
  "name": "Example Hackathon",
  "url": "https://example.com/event",
  "rulesUrl": "https://example.com/rules",
  "deadlineAt": "2026-09-30T23:59:00-07:00",
  "deadlineSourceText": "September 30, 2026 at 11:59 PM PDT",
  "location": {
    "label": "Online",
    "mode": "online",
    "countries": []
  },
  "eventTypes": ["open innovation"],
  "technologies": ["TypeScript", "Sponsor SDK"],
  "platforms": ["web", "AI/ML"],
  "eligibility": {
    "verdict": "eligible",
    "summary": "Residents of the user's country are not excluded.",
    "allowedCountries": ["*"],
    "excludedCountries": [],
    "minimumAge": 18,
    "allowedParticipantStatuses": ["individual", "student", "employee", "company"],
    "excludedParticipantStatuses": ["government-employee"],
    "teamSize": { "min": 1, "max": 4 },
    "requirements": ["Age of majority"]
  },
  "tracks": ["AI agents"],
  "prizes": [
    {
      "label": "Grand Prize",
      "type": "cash",
      "value": "USD 10,000"
    }
  ],
  "requirements": ["Use the sponsor SDK"],
  "submissionArtifacts": ["Repository", "Demo video"],
  "mustUse": ["Sponsor SDK"],
  "capabilities": {
    "inPersonAttendance": false,
    "publicRepository": true,
    "demoVideo": true,
    "liveDeployment": false,
    "openSourceLicense": false,
    "storeAccounts": [],
    "vendorAccounts": ["Sponsor API"]
  },
  "risk": "Requires access to the sponsor API.",
  "verifiedAt": "2026-08-28T12:00:00+08:00",
  "sources": [
    {
      "label": "Official rules",
      "url": "https://example.com/rules",
      "supports": ["deadline", "eligibility", "prizes", "submission"]
    }
  ]
}
```

## Field Rules

- Give every event a stable, unique `id`.
- Use ISO 8601 timestamps with an explicit offset for `generatedAt`, `deadlineAt`, and `verifiedAt`.
- Use an IANA timezone for `timezone` and `en` or `zh-CN` for `defaultLocale`.
- Localize interface labels and dates while preserving sourced event, rule, and prize wording verbatim.
- Use `online`, `in-person`, or `hybrid` for `location.mode`.
- Use ISO 3166-1 alpha-2 codes in country arrays; use `*` only for worldwide eligibility. Keep separately governed regions such as `CN` and `HK` distinct.
- Use `eligible`, `ineligible`, or `uncertain` for `eligibility.verdict`.
- Use `individual`, `student`, `employee`, `government-employee`, or `company` in participant-status arrays.
- Use `cash`, `credits`, `hardware`, `services`, `swag`, or `other` for `prizes[].type`.
- Use `apple`, `google`, or `galaxy` in `capabilities.storeAccounts`.
- Preserve exact prize wording in `prizes[].value`; do not normalize non-cash benefits into money.
- Put exact-match skill and SDK names in `technologies`, participant constraints in `eligibility`, descriptive build constraints in `requirements`, and machine-checkable submission needs in `capabilities`.
- Use empty arrays or `false` for confirmed absences. Use explicit values for every machine-checkable field; keep uncertain candidates outside the generated shortlist unless the user requests an uncertainty view.
- Keep `sources[].supports` limited to claims that the linked source establishes.
