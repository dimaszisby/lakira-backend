---
name: pre-push
description: Run the full local validation checklist before pushing. Use when the user says "pre-push", "ready to push", "validate before push", or wants to verify their changes pass CI checks locally.
disable-model-invocation: true
---

# Pre-Push Validation

Run all local checks that CI will enforce. Report a pass/fail summary.

## Checklist

Run these commands sequentially — stop and report on first failure:

1. **Lint check**

   ```bash
   npm run lint
   ```

2. **Format check**

   ```bash
   npm run format:check
   ```

3. **Type check**

   ```bash
   npm run typecheck
   ```

4. **Unit tests**

   ```bash
   npm run test:unit
   ```

5. **Security delta check** (mirrors the `security_delta` CI job)

   ```bash
   npm run security:delta:check
   ```

6. **OpenAPI consistency** (if any schema or route files changed)

   ```bash
   npm run docs:openapi:check
   ```

7. **Integration tests** (if any API, persistence, or migration files changed)
   ```bash
   npm run test:integration
   ```

## Report Format

After running, provide a summary:

```
Pre-push validation:
  PASS Lint
  PASS Format
  PASS Typecheck
  PASS Unit tests (X passed)
  PASS Security delta check
  PASS OpenAPI check
  FAIL Integration tests — [failure details]

Result: BLOCKED — fix integration test failures before pushing.
```

If all pass: `Result: READY TO PUSH`
