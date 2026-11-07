# Metrics Tracker — Feature Audience Restructure

Quantitative progress. Update at the end of each phase.

| Metric                                                     | Target                     | Baseline (pre-Phase 0) | Current   | Owner          | Next Action / Link                                                                                                      |
| ---------------------------------------------------------- | -------------------------- | ---------------------- | --------- | -------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Slices placed under `public/` / `admin/` / `shared/`       | 6 / 0 / 1                  | 0 / 0 / 0              | _pending_ | @dimaspramudya | After Phase 6 — confirm via `find src/features -maxdepth 2 -type d`                                                     |
| `tsc --noEmit` duration                                    | ≤ baseline + 10%           | _record in Phase 0_    | _pending_ | @dimaspramudya | Capture once per phase                                                                                                  |
| `npm run lint` duration                                    | ≤ baseline + 10%           | _record in Phase 0_    | _pending_ | @dimaspramudya | Capture once per phase                                                                                                  |
| Files modified outside `src/features/` and `src/server.ts` | 2 (the two tsconfig files) | n/a                    | _pending_ | @dimaspramudya | `git diff --stat main...HEAD` after final phase                                                                         |
| Locked-dir files modified                                  | 0                          | 0                      | _pending_ | @dimaspramudya | Constraint audit query in [checklist Phase 8](./feature-audience-restructure-checklist.md#phase-8--validation--cleanup) |
| OpenAPI public-path drift                                  | 0 lines                    | 0                      | _pending_ | @dimaspramudya | `git diff -- docs/reference/api/` after Phase 8 regen                                                                   |
| Unit test pass rate                                        | 100%                       | 100%                   | _pending_ | @dimaspramudya | `npm run test:unit`                                                                                                     |
| Integration test pass rate                                 | 100%                       | 100%                   | _pending_ | @dimaspramudya | `npm run test:integration`                                                                                              |
| `requireAdmin` role-check matrix (no/user/admin)           | 401 / 403 / 200            | n/a                    | _pending_ | @dimaspramudya | Phase 7 smoke                                                                                                           |

## Notes

- Baselines for `tsc` and `lint` durations should be captured during Phase 0 on the same machine that runs the migration, to keep deltas meaningful.
- "Files modified outside `src/features/` and `src/server.ts`" expects exactly two: `tsconfig.json` and `tsconfig.build.json`. Anything else is a constraint violation and must be unwound or escalated via [incidents.md](./incidents.md).
