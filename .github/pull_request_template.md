## What

<!-- What was wrong or missing, and why it matters. Name the issue it closes, if any: "Closes #N".
Link the kit README and every ADR this change adds or supersedes. -->

## Changes

<!-- What changed, by file or area. Say what was deliberately left alone. -->

## Verification

<!-- Run the gates in `.claude/rules/workflow.md` § Gates are named, not asserted, and report each
by name. A skipped gate is listed as skipped, with the reason. -->

| Gate                                                      | Result |
| --------------------------------------------------------- | ------ |
| typecheck                                                 |        |
| lint                                                      |        |
| format                                                    |        |
| unit (`test:unit:coverage`)                               |        |
| integration (`test:integration:coverage`)                 |        |
| build                                                     |        |
| OpenAPI (`docs:openapi:check`), for routes and schemas    |        |
| security delta (`security:delta:gate`), for dependencies  |        |
| image smoke (`docker:smoke`), for the image or its inputs |        |

## Security checklist

- [ ] `npm run test:unit:security-framework`
- [ ] `npm run security:delta:gate`
- [ ] Updated security audit artifacts when required (`docs/internal/audits/security/**`)
- [ ] For production release PRs: followed `docs/how-to/security/release-delta-sop.md`

## Notes for reviewers

- CI artifact to inspect for security gate runs: `backend-security-delta`
