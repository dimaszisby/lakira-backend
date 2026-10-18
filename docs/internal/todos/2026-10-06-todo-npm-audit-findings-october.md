# Todo — `npm audit` findings left after the `proxy-addr` fix

- **Status:** Fixed what can be fixed. Step 1, the in-range fixes, in #181 (`npm-audit-findings` D-06); Jest 30 in #182 (D-07, ADR-0065); `jest-junit` 17 on `fix/jest-junit-17` (D-09, ADR-0066). Two findings wait on upstream releases; register row B-25, state `upstream`
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

## Resolution

**Step 1, 2026-10-18.** Rechecked first: by then `npm audit` on `dev` (`7658716`) reported 45
findings, 1 critical, 35 high and 9 moderate. Two were new since this todo: a critical in
`handlebars` (through `ts-jest`) and a high in `lint-staged`. `npm audit fix` without `--force`
moved `handlebars`, `lint-staged`, `axios`, `fast-uri`, `brace-expansion`, `nodemon` (3.1.11 to
3.1.14) and `moment`, all within their ranges; `package.json` did not change. After: 39 findings,
0 critical, 31 high, 8 moderate; production 2 moderate, both the accepted `uuid` root.

**Step 2, Jest 30, 2026-10-18.** `jest` 29.7.0 to 30.5.2 and `@types/jest` to 30.0.0 (ADR-0065).
After: 26 findings, 0 critical, 3 high (`braces`, `chokidar`, `nodemon`), 23 moderate; production
unchanged at 2. Jest 30 does not clear `sprintf-js` as expected: `babel-plugin-istanbul` 8 still
reaches it through `@istanbuljs/load-nyc-config`, `js-yaml` 3 and `argparse` 1, and npm offers no
fix but downgrades.

**Step 2, `jest-junit` 17, 2026-10-18.** 16.0.0 to 17.0.0, with its own `uuid` 14.0.3 (ADR-0066).
The XML it writes is unchanged in shape. After: 25 findings, 0 critical, 3 high, 22 moderate;
production unchanged at 2.

**Waiting on upstream, as measured on 2026-10-18:**

- `braces` via `nodemon` is not a major away, as the table said: npm's only offer is
  `nodemon@1.14.10`, a downgrade. It waits for an upstream fix.
- `sprintf-js` via `js-yaml` 3 under `babel-plugin-istanbul`: no fix but downgrades; it waits for
  `@istanbuljs/load-nyc-config` to move off `js-yaml` 3.
