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
