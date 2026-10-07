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

**Consequences.** No ADR: no dependency is added or removed and no declared range changes, the same
ground this kit recorded for #120. `req.ip` is computed by this package and every rate limiter keys
on it, so the image smoke and the full test gate run with the change.
