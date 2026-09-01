---
name: OpenAPI and Zod compatibility
description: Orval integer schemas can outpace the workspace's Zod runtime.
---

When generating Zod schemas from OpenAPI, verify the workspace Zod version before using integer-specific schema output; the current runtime may not expose `z.int()`.

**Why:** Code generation can succeed while the chained library typecheck fails if Orval emits APIs unavailable in the installed Zod major version.

**How to apply:** Prefer compatible numeric schemas or update the dependency intentionally before expanding integer-heavy API contracts.