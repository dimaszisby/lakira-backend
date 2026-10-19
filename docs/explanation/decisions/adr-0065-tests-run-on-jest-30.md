# ADR-0065 — Tests run on Jest 30

- **Status:** Accepted (merged in #182, `6c0e7a4`)
- **Date:** 2026-10-18
- **Related:** [ADR-0046](./adr-0046-node-24-runtime.md) (the runtime the suite runs on)
- **Origin:** `D-07` in the npm-audit-findings kit —
  [`npm-audit-findings`](../../internal/initiatives/npm-audit-findings/decisions.md); register row
  B-25 ([todo](../../internal/todos/2026-10-06-todo-npm-audit-findings-october.md))

---

## Context

On `dev` at `324fb19`, after the in-range fixes of #181, `npm audit` reported 39 findings: 31 high
and 8 moderate. 32 of them named `jest@30` or `@types/jest@30` as their only fix, and both
crossed the declared `^29`. All are in development tooling; the production gate passed. The
dependency policy still gives a development high the next sprint, and the todo kept each major to
a change of its own.

`ts-jest` 29.4 already accepts Jest 30: its peer ranges for `jest`, `@jest/transform`,
`@jest/types`, `babel-jest` and `jest-util` are `^29 || ^30`.

## Decision

- **`jest` `^30.5.2` and `@types/jest` `^30.0.0`.** Nothing else in `package.json` changes;
  `ts-jest` stays at 29.4.
- **`jest-junit` 17 is not in this change.** It is its own major and its own PR (register row
  B-25).
- **What Jest 30 asked of the code:**
  - `__tests__/unit/shared/middleware/validation.test.ts`. Jest 30 types `toHaveBeenCalledWith`
    by the mock's own signature, and a spy on winston's overloaded `logger.error` takes its last
    overload, `(infoObject)`. The test asserts on `(message, meta)`, so its spy is typed by that
    overload.
  - `src/server.ts` no longer checks the database at import ([D-08](../../internal/initiatives/npm-audit-findings/decisions.md)).
    The check was awaited by nothing. In the two integration files that skip every test when
    Redis integration is off, Jest runs no hooks, so nothing closed it. `pg` then asked for `net`
    after the teardown. Jest 29 let that pass; Jest 30 fails the next suite.

## Options considered

- **`npm audit fix --force`.** Rejected, as in D-04 and D-06: it would also downgrade
  `sequelize`.
- **Jest and `jest-junit` together.** Rejected: a broken reporter and a broken runner read alike
  in one diff.
- **Keep the import-time check and stop the two skipped files from leaking** (ignore them by
  configuration when Redis integration is off). Rejected by the owner: it keeps a network side
  effect on import that nothing awaits.

## Consequences

- `npm audit`: 39 findings to 26, 0 critical, 3 high, 23 moderate. The highs are `braces` and its
  parents `chokidar` and `nodemon`, with no fix but a downgrade. Production is unchanged at 2
  moderate, the accepted `uuid` root.
- Jest 30 does not clear `sprintf-js`. `babel-plugin-istanbul` 8 still reaches it through
  `@istanbuljs/load-nyc-config`, `js-yaml` 3 and `argparse` 1, and npm offers no fix but
  downgrades.
- **The lockfile:**
  - 65 entries added, 63 changed, 24 removed, all under Jest except one: `cjs-module-lexer`,
    which `@sentry/node` reaches through `import-in-the-middle`, is now shared with Jest at
    2.3.0 (was 2.2.0, nested). It ships; the image smoke passed.
  - **Two new packages with install scripts:** `unrs-resolver` (through `jest-resolve`) and
    `@parcel/watcher` (through `jest-haste-map`). Both scripts build a native binding from
    source only when no prebuilt optional package fits the platform. npm 11 leaves them pending
    approval, as it already did for `esbuild` and `fsevents`, and Jest runs without them.
    Neither is installed in the image.
- Unit branch coverage moves from 59.32 % to 59.84 % with `babel-plugin-istanbul` 8. The other
  unit figures are unchanged.
- Jest 30 warns that `coverageThreshold` inside a project is not read. Jest 29 did not read it
  either, silently, so the thresholds were never enforced. That is filed as register row B-69 and
  is not changed here.
  - _Note, 2026-10-19:_ fixed on `fix/coverage-thresholds-enforced`. The thresholds moved to the
    root config, chosen per run by `JEST_COVERAGE_PROJECT` (`coverage-thresholds-enforced` D-01),
    and the warning is gone.
- A database that is down at startup is now reported once, by `startServer`, which exits 1.

## Enforcement

- `npm test` and `npm run test:coverage` run on Jest 30 in CI (`backend-ci.yml`).
- `npm audit` and the security delta gate (`npm run security:delta:gate`).

## Links

- Decisions: [`npm-audit-findings` D-07, D-08](../../internal/initiatives/npm-audit-findings/decisions.md)
- Policy: [`docs/reference/security/dependency-policy.md`](../../reference/security/dependency-policy.md)
- Follow-up: register row B-69 ([todo](../../internal/todos/2026-10-18-todo-coverage-thresholds-not-enforced.md))
