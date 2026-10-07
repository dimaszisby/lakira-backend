# Todo — `npm audit` findings left after the `proxy-addr` fix

- **Status:** Open. None of these trips the security gate
- **Created:** 2026-10-06
- **Owner:** unassigned
- **Origin:** kit [`npm-audit-findings`](../initiatives/npm-audit-findings/decisions.md) D-05, which
  fixed the one finding that blocked CI and left the rest out on purpose

---

## What

`npm audit` on `dev`, 2026-10-06, after `proxy-addr` moved to 2.0.8. Counts are per root package;
the total npm prints is higher because it counts every dependent.

| Root                      | Severity | Surface    | Fix                                         |
| ------------------------- | -------- | ---------- | ------------------------------------------- |
| `moment`                  | moderate | production | in range                                    |
| `axios`                   | high     | dev only   | in range                                    |
| `brace-expansion`         | high     | dev only   | in range                                    |
| `fast-uri`                | high     | dev only   | in range                                    |
| `braces` (via `nodemon`)  | high     | dev only   | needs a major of `nodemon`                  |
| `sprintf-js` (via `jest`) | moderate | dev only   | needs a major of `jest`                     |
| `uuid` (via `sequelize`)  | moderate | production | already accepted, `npm-audit-findings` D-04 |

The production gate reports 3 medium and no high or critical, so it passes. The dev-only highs are
outside the gate's scope and inside the dependency policy's "next sprint" target.

## Suggested order

1. The four in-range roots in one change: `npm audit fix`, never `--force`. Read the lockfile diff
   before the gates; `moment` is the only one that ships. Run the security delta gate and the image
   smoke.
2. `nodemon` and `jest` majors separately, each as its own change, since each can alter the
   developer workflow or the test run.

Check whether each finding is still open before starting: advisories are revised, and a later
install may already have moved a package.
