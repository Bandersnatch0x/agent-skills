# Retrospective Integration

Use `claude-retrospective` before maintenance when the request asks for both learning and cleanup.

## Order

1. Run the retrospective on the exact session or failure window.
2. Apply at most one authorized durable change, or record a no-change decision.
3. Run session-manager diagnosis without mutation.
4. Create verified handoffs for resumable work.
5. Apply only approved Archive-ready actions one at a time.
6. Verify continuity, recovery paths, and before/after measurements.

Keep the ownership boundary clear: retrospective decides whether evidence justifies a durable behavior change; session-manager preserves and maintains local state. A reviewed session is not automatically safe to archive, and archival never substitutes for a handoff.

## Requests

Use retrospective alone for repeated corrections or friction. Use session-manager alone for diagnosis, handoffs, or maintenance. Use both for a request such as:

```text
Review the last two weeks for repeated behavior patterns, then diagnose the workspace and apply only approved Archive-ready actions.
```

The combined result must include the evidence ledger, durable-change decision, candidate classifications, exact mutations, authorization, and verification results.
