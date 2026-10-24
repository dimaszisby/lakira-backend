# npm audit findings — Decisions Log

`D-NN` entries scoped to this kit.

---

## D-01 — Drop the `js-yaml` override

- **Status:** Accepted
- **Date:** 2026-09-29

**Context.** `npm audit` reported four highs (`js-yaml`, `@eslint/eslintrc`,
`@istanbuljs/load-nyc-config`, `cosmiconfig`), all from one advisory: `js-yaml` `maxTotalMergeKeys`
does not limit CPU use for empty merge sources, fixed in 3.15.2. `overrides` pinned `js-yaml` to
exactly 3.15.1, so `npm audit fix` could not move it. The pin also crossed a major:
`@eslint/eslintrc@3.3.3` and `cosmiconfig@9.0.2` declare `js-yaml ^4.1.x` and were given 3.15.1,
against rules 1 (same major only) and 3 (never pin below the latest safe version) of the dependency
policy's § Transitive Overrides.

**Decision.** Remove the override. Each consumer resolves its own range to a patched release: 4.3.2
under eslintrc and cosmiconfig, 3.15.2 under load-nyc-config (`^3.13.1`). Rule 5 (prefer removal).

**Options considered.** Bumping the pin to `3.15.2` clears the advisory but keeps two consumers a
major below their declared range, which is the defect that hid the fix. Rejected.

**Consequences.** eslint's legacy config loader and cosmiconfig now run on `js-yaml` 4, the major
they were written for. commitlint (through cosmiconfig) was checked to still accept and reject
messages. A future `js-yaml` advisory is fixed by `npm audit fix`, with no pin to maintain.

## D-02 — Drop the `brace-expansion` override

- **Status:** Accepted
- **Date:** 2026-09-29

**Context.** `brace-expansion: 2.1.4` forced every `minimatch@3.1.5`, which declares `^1.1.7`, up to
2.x. It caused no finding, but it is the same rule-1 violation in the same block.

**Decision.** Remove it. `minimatch@3` resolves 1.1.21 and `minimatch@9` keeps 2.1.4; `npm audit`
reports nothing for either. A scratch-copy lockfile proved this before the change was made.

**Options considered.** Leaving it, as out of scope. Rejected: it would leave the block in the state
this kit exists to correct, and the removal costs nothing extra to verify.

**Consequences.** `minimatch@3` consumers (eslint, jest, nodemon, glob) run on the major they
declare. Lint and both test projects are green on it.

## D-03 — Keep the `esbuild` override, as a recorded exception

- **Status:** Accepted
- **Date:** 2026-09-29

**Context.** `esbuild: 0.28.2` crosses `tsx@4.21.0`'s `~0.27.0`; in 0.x a minor is a breaking range.

**Decision.** Keep it, recorded as an exception to rule 1.

**Options considered.** Removing it resolves 0.27.7 and re-opens a low (arbitrary file read via the
dev server). Rejected: dev-only, and `tsx` is green on 0.28.2 across scripts and the contract seed.

**Consequences.** One override remains that violates the policy on purpose. Revisit when `tsx`
widens its range:
[`2026-09-29-todo-esbuild-override-crosses-tsx-range.md`](../../todos/2026-09-29-todo-esbuild-override-crosses-tsx-range.md).

## D-04 — The `uuid`-rooted moderates stay accepted

- **Status:** Accepted
- **Date:** 2026-09-29

**Context.** `uuid <11.1.1` surfaces as `uuid`, `sequelize` and `jest-junit`. npm's "fix" is
`--force`, which installs `jest-junit@17` and would downgrade `sequelize` to 3.30.0.

**Decision.** Accept, unchanged. The dependency policy's 2026-08-31 snapshot records why (8 to 11
crosses three majors under the ORM, for a bounds check in code paths we do not call).

**Options considered.** An override to `uuid@11` is a dependency upgrade under rule 1, not an
override. `--force` is a destructive downgrade. Both rejected.

**Consequences.** Three moderates remain (two in production); the CI gate passes on them.

---

## D-05 — Take the `proxy-addr` patch through the lockfile, alone

- **Status:** Accepted
- **Date:** 2026-10-06
- **Size:** Micro — single commit, no separate kit. Commits carry
  `refs: proxy-addr-ip-spoofing-advisory`.

**Context.** GHSA-jqcg-44mw-7w3h (CVE-2026-90711, critical) was published on 2026-10-05 against
`proxy-addr` 1.1.0 to 2.0.7. The lockfile holds 2.0.7, as a dependency of `express@4.22.3`. From
the next run, `Security Delta Checks` blocked on `AUTO-NPM-proxy-addr`: on `dev` at `8c1948c`, and
on every PR, where `Unit & Integration Tests` and `contract_local` depend on that job and were
skipped. The flaw is in how a trust **subnet** written as an IPv4-mapped IPv6 address with a short
prefix is compiled: it matches every IPv4 address, so any client is trusted as a proxy and `req.ip`
becomes whatever `X-Forwarded-For` says. This application sets `trust proxy` to a hop count
(`src/server.ts:106`, `TRUST_PROXY ?? 1`) and never to a subnet, so it is not exposed. The gate is
right to block regardless: the policy gives a critical in a runtime dependency 72 hours, and
exposure is one configuration change away.

**Decision.** Move `proxy-addr` to 2.0.8 in `package-lock.json` and nothing else. `express`
declares `~2.0.7`, so the patched release is inside the range and `package.json` does not change.

**Options considered.**

- _`npm audit fix`._ Rejected for this change: it would also move `moment`, `axios`,
  `brace-expansion` and `fast-uri`, and a change whose purpose is to unblock every other PR should
  be a diff that can be read whole. Those findings do not trip the gate and are filed as
  `docs/internal/todos/2026-10-06-todo-npm-audit-findings-october.md`.
- _An `overrides` pin._ Rejected: the range already admits the fix, and the dependency policy keeps
  overrides for cases where it does not.
- _An accepted exception, on the ground that the application is not exposed._ Rejected: a fix
  exists and costs one lockfile entry, and an exception would have to be revisited whenever
  `TRUST_PROXY` handling changes.

**Consequences.** Full `npm audit` went from 45 findings (1 critical, 35 high, 9 moderate) to 39
(0 critical, 31 high, 8 moderate); `--omit=dev` from 3 moderate to 2, the accepted `uuid` root
(D-04). No ADR: no dependency is added or removed and no declared range changes, the same
ground this kit recorded for #120. `req.ip` is computed by this package and every rate limiter keys
on it, so the image smoke and the full test gate run with the change.

---

## D-06 — Take every in-range fix in one change; the majors stay separate

- **Status:** Accepted (merged in #181, `324fb19`)
- **Date:** 2026-10-18
- **Size:** Micro — single commit, no separate kit. Commits carry `refs: npm-audit-findings`.

**Context.** Register row B-25, step 1 of
`docs/internal/todos/2026-10-06-todo-npm-audit-findings-october.md`; branch
`fix/npm-audit-in-range`. On `dev` at `7658716`, `npm audit` reported 45 findings (1 critical,
35 high, 9 moderate); `--omit=dev` reported 3 moderate, so the CI gate passed. Since the todo was
written, a critical in `handlebars` (through `ts-jest`) and a high in `lint-staged` had been
published. `npm audit fix --dry-run` moved seven roots within their declared ranges: `handlebars`,
`lint-staged`, `axios`, `fast-uri`, `brace-expansion`, `moment` and `nodemon`. Only `moment`
ships, as a dependency of `sequelize`.
**Decision.** Apply `npm audit fix`, never `--force`, and read the lockfile diff before the gates.
It changed `package-lock.json` only; npm 11 left the declared ranges in `package.json` as they
were, and they already admit every patched release. What it cannot reach is not in this change:
`jest` 30 (with `@types/jest` and `sprintf-js`) and `jest-junit` 17 are majors, each its own
change as the todo says. `braces` under `nodemon` has no fix at all: npm offers
`nodemon@1.14.10`, a downgrade, so it waits for an upstream release.
**Options considered.** `--force`: rejected, as in D-04; it would downgrade `sequelize` and cross
the `jest` major in one unreadable diff. One root at a time, as D-05 did for `proxy-addr`: rejected
here, since nothing is blocked and seven separate lockfile changes cost more review than one diff
checked against a list. Raising the floors in `package.json` by hand: not done; the lockfile is
what installs, and `npm ci` refuses a lockfile that disagrees with it.
**Consequences.** No ADR: no dependency is added or removed and no declared range is crossed, the
ground D-05 recorded. `moment` changes inside the image, so the image smoke runs.

---

## D-07 — Take Jest 30 on its own; `jest-junit` 17 follows separately

- **Status:** Accepted (merged in #182, `6c0e7a4`)
- **Date:** 2026-10-18

Promoted to the architecture decision registry as **[ADR-0065](../../../explanation/decisions/adr-0065-tests-run-on-jest-30.md)**.
That file is authoritative; this entry is a pointer. Register row B-25; branch `fix/jest-30`.

---

## D-08 — Importing the app opens no database connection

- **Status:** Accepted (merged in #182, `6c0e7a4`)
- **Date:** 2026-10-18
- **Size:** Micro — part of the D-07 commit.

**Context.** On Jest 30 the integration run passed all 249 tests and still failed a suite:
`TypeError: Cannot read properties of undefined (reading 'Socket')` from `pg`, after "You are
trying to `require` a file after the Jest environment has been torn down", naming
`VisualizationCacheRedis.integration.test.ts` and `auth-lockout.test.ts`. Both skip every test
when `ENABLE_REDIS_INTEGRATION` is off, and Jest runs no `beforeAll`/`afterAll` in a file with
nothing to run, on 29 as on 30 (32 `afterAll` runs for 34 files on each). Importing
`src/server.ts`, which `jest.setup.ts` does, called `sequelize.authenticate()` at import and nothing
awaited it; in those two files nothing closed it either, and `pg` asked for `net` after the
teardown. Jest 29 let that pass unreported; Jest 30 fails whichever suite runs next. The exported
`serverReady` that carried the promise had no reader.
**Decision.** Remove the import-time check and `serverReady`. Importing `src/server.ts` still
registers the models; the connection is checked where it is used, by `startServer` before it
listens and by `jest.setup.ts` in its `beforeAll`. Chosen by the owner over the two below.
**Options considered.** A separate PR first: the same diff, one more round trip, and Jest 30
cannot merge green without it. Leave `src` alone and stop the two suites leaking, by ignoring them
in config when Redis integration is off: keeps an import with a network side effect that awaits
nothing.
**Consequences.** A database that is down at startup is reported once, by `startServer`, which
exits 1; before, an unhandled rejection from the import-time check came with it. The integration
run on Jest 30: 32 suites passed, 2 skipped, 249 tests, no teardown error.

---

## D-09 — Take `jest-junit` 17, the last major B-25 can fix

- **Status:** Accepted (merged in #183, `cbb7b87`)
- **Date:** 2026-10-18

Promoted to the architecture decision registry as **[ADR-0066](../../../explanation/decisions/adr-0066-junit-reports-from-jest-junit-17.md)**.
That file is authoritative; this entry is a pointer. Register row B-25; branch `fix/jest-junit-17`.

---

## D-10 — Take the `follow-redirects` patch through the lockfile, alone

- **Status:** Accepted (#220, `b18a3ed`)
- **Date:** 2026-10-24
- **Size:** Micro — single commit, no separate kit. Commits carry `refs: follow-redirects-dev-high`.
  Register row B-91; branch `fix/follow-redirects-dev-high`.

**Context.** `npm audit` on `dev` at `d1ff8da` reported `follow-redirects@1.16.0` as high, under
GHSA-q3jh-wrc6-jgq8 (array-form headers bypass the cross-origin credential stripping) and
GHSA-8r9p-f939-6h3c (the `sensitiveHeaders` regex escaping can expose credential headers). It is
reached only through `wait-on@9.0.4` → `axios@1.20.0`, a devDependency that polls local ports in
scripts, so the image does not hold it and `npm audit --omit=dev`, which the gate reads, did not
report it. `axios` declares `follow-redirects: ^1.16.0`, and 1.16.1 is published.
**Decision.** Move `follow-redirects` to 1.16.1 in `package-lock.json` with
`npm update follow-redirects`, and nothing else. `package.json` does not change.
**Options considered.** _`npm audit fix`:_ it would also reach for the accepted `sequelize`/`uuid`
moderates (D-04), and a dependency change reads best whole, as D-05 put it. _An `overrides` pin:_
the range already admits the fix, and the dependency policy keeps overrides for cases where it does
not. _An accepted exception, on the ground that it is dev-only:_ a fix exists and costs one
lockfile entry.
**Consequences.** Full `npm audit` went from 3 findings (1 high, 2 moderate) to 2 moderate, the
accepted `uuid` root; `--omit=dev` stays at those 2. `npm ls --omit=dev --all` is identical before
and after, so the image is unchanged. `wait-on` still answers on an open port and times out on a
closed one. Found while checking: `braces` 3.0.3 and `sprintf-js` 1.0.3, the two findings B-25
kept open for an upstream release, are still installed and no longer reported; the advisory data
changed, not the tree, and B-25 closes with this entry.

---

## D-11 — Take the `fast-uri` patch through the lockfile, alone

- **Status:** Accepted (#222, `6150bc8`)
- **Date:** 2026-10-25
- **Size:** Micro — single commit, no separate kit. Commits carry `refs: npm-audit-findings`.
  Register row B-93; branch `fix/fast-uri-dev-moderate`.

**Context.** Checking #220 against `dev` after #221 merged, the full `npm audit` reported
`fast-uri@3.1.8` under four advisories, all fixed in 3.1.9: GHSA-w74x-v6f9-j3xg (scheme spoofing
through a percent-encoded scheme, moderate), GHSA-wjr9-j795-jxcr (host confusion, moderate),
GHSA-xhq7-xmqj-769h and GHSA-333x-w4r6-6crp (two path normalisation findings, low). It is reached
only through `@commitlint/cli` → `@commitlint/load` → `@commitlint/config-validator` →
`ajv@8.20.0`, which declares `fast-uri: ^3.0.1`, so the image does not hold it and
`npm audit --omit=dev` did not report it. #220 had just written the dependency policy's snapshot as
"2 moderate", which this made untrue on `dev`.
**Decision.** Move `fast-uri` to 3.1.9 in `package-lock.json` with `npm update fast-uri`, as D-10
did for `follow-redirects`. `package.json` does not change.
**Options considered.** _Leave it, as a moderate the gate does not read:_ a fix exists, costs one
lockfile entry, and the snapshot would have to record it as open. _`npm audit fix`:_ it reaches for
the accepted `uuid` moderates (D-04).
**Consequences.** Full `npm audit` goes from 3 moderate to 2, the accepted `uuid` root, which is
what the snapshot says. `npm ls --omit=dev --all` is identical before and after. `ajv` validates
commitlint's own configuration; the commit hook still accepts this commit's message.
