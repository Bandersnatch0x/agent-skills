# Memory Integration

Use this branch only after the installed memory mechanism, owner, path, loading behavior, and schema have been discovered and verified.

## Gate

1. Inspect the current Claude Code installation and project memory layout.
2. Confirm the supported owner and frontmatter schema from local evidence.
3. Confirm that the proposed lesson belongs in memory rather than a scoped instruction or reusable skill.
4. Write one atomic memory entry and update its supported index.
5. Verify the file is readable, the index points to it, and a later matching session recalls and follows it.

If any mechanism, path, schema, or loading behavior is unknown, keep the finding as a proposed instruction change. Do not invent a global memory directory or claim automatic loading.

## Ownership

- Stable project facts belong in project memory when that mechanism is verified.
- User preferences belong in the supported user-memory owner when verified.
- Reusable procedures belong in a skill.
- Scoped, actionable rules belong in the applicable instruction file.

Do not duplicate a covered instruction in memory. Keep one lesson or fact per entry, with evidence and a concrete application rule.

## Example Shape

Use only the schema observed in the installed environment. A common shape is:

```markdown
---
name: memory-slug
description: One-line retrieval summary
metadata:
  type: feedback | project | user | reference
---

The verified lesson or fact.

**Evidence:** What sessions or artifacts support it.

**How to apply:** The observable behavior expected next time.
```

The example is illustrative, not a contract. Validate it before writing.
