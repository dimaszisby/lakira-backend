# Postman/Newman Workflow Guidelines

**Status:** Superseded — Newman was retired in #75 (`a4635f3`); see this folder's `README.md`
**Last updated:** 2026-04-13

Use this workflow when API contract behavior changes.

## Trigger Conditions

Update Postman/Newman suites when:

- FE-facing endpoint contracts change (path/method/status/payload/header behavior).
- OpenAPI contract changes.
- New FE-facing endpoint is introduced.

## Per-PR Workflow

1. Update runtime behavior and OpenAPI.
2. Update affected collection(s) in `collections/`.
3. Ensure assertions cover success + key failure paths.
4. Run local contract suite: `npm run test:contract:local`.
5. For staging-impacting work, validate staging run path/secrets.
6. Update tracker docs (`CHECKLIST.md`, `../metrics-tracker.md`, `../incidents.md`) when scope or behavior changes.

## Guardrails

- Do not hardcode secrets in collection/env files.
- Keep assertions deterministic (use seeded IDs/data).
- Keep report output conventions stable for CI triage.
