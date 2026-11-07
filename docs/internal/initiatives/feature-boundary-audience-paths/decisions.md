# Feature boundary audience paths — Decisions Log

`D-NN` entries scoped to this kit.

---

## D-01 — One audience-aware regex per boundary rule, instead of glob groups

- **Status:** Accepted
- **Date:** 2026-09-29

**Context.** Features live at `src/features/<audience>/<feature>/`. `tsconfig.json` gives each a
short alias (`@/features/metric/*`), and the catch-all `@/*` reaches the same file as
`@/features/public/metric/...`. The three boundary patterns in `eslint.config.mjs` assume one
segment after `features/`, so the short spelling is checked and the full one never is. All 9 live
cross-feature deep imports use the full spelling. The model exception also enumerates allowed
subpaths, so it misses auth's flat `infrastructure/persistence/*RepositorySequelize.ts` files.

**Decision.** Each rule becomes one `regex` pattern with an optional `(public|shared)/` segment:
deep imports, composition root, and the model exception. The model exception uses a lookahead
(`infrastructure/(?!persistence/models/)`) instead of enumerating what is allowed.

**Options considered.** Adding the full-spelling globs beside the short ones: rejected, because it
doubles every pattern, and a third audience would silently reopen the gap. Removing the short aliases
so only one spelling exists: rejected here, since it rewrites 23 files and belongs with the
ADR-0014 alias decision. Enumerating subpaths for the model exception: rejected, since that is what
missed the flat repositories.

**Consequences.** A new audience directory must be added to the alternation; the negative-case test
fails loudly if one is added and not covered. Glob negation was recorded as having no effect; a regex
lookahead is a different mechanism, and it is proven by the negative-case test rather than assumed.

## D-02 — `MetricAccessPort` is owned by each consumer, as ADR-0023 decided

- **Status:** Accepted
- **Date:** 2026-09-29

**Context.** metric-log, metric-settings and analytics import `MetricAccessPort` from `metric`'s
`application/ports/`: 9 deep imports. ADR-0023 (Proposed since 2026-05-03) decided that the
interface "stays in each consuming feature's `application/ports/`", with a single adapter from
`metric`. Each consumer already has an `application/ports/` directory.

**Decision.** Each consumer declares its own one-method `MetricAccessPort`. `metric` keeps its own
port for its adapter. Consumers keep receiving `MetricAccessSequelize` from `metric/public.ts`,
which satisfies every copy structurally. ADR-0023 flips to Accepted in this PR.

**Options considered.** Exporting the type from `metric/public.ts`: rejected, because it makes three
application layers depend on another feature's port, which is the direction ADR-0023 rejected.

**Consequences.** Three copies of a four-line interface. They may diverge, and that is the point: each
feature states what it needs.

## D-03 — ADR-0044's negative cases are persisted, against the real ESLint config

- **Status:** Accepted
- **Date:** 2026-09-29

**Context.** ADR-0044 decision 6 says every rule must be seen to reject before it is trusted. Each
rule was seen to reject once, by hand, in the short spelling. Nothing kept that true, which is how
the full spelling went unnoticed.

**Decision.** `__tests__/unit/feature-boundaries.lint.test.ts` lints synthetic imports through
`ESLint#lintText`, using the repository's own config and the path of a real feature file. It asserts
rejection and acceptance cases for both spellings, and runs in the unit project.

**Options considered.** A fixture directory of bad files linted by a script: rejected, since the
fixtures would need excluding from the real lint run, and a stray one fails CI for the wrong reason.

**Consequences.** It is slower than most unit tests, because it loads the type-aware parser. It
fails if the config drifts.

## D-04 — A relative import that crosses into another feature fails the architecture test

- **Status:** Accepted
- **Date:** 2026-09-29

**Context.** A pattern cannot tell whether `../../../metric/application/...` leaves the importing
feature without knowing where the importing file is. There are no such imports today.

**Decision.** `__tests__/unit/architecture.test.ts` resolves every relative import under
`src/features/` and fails on one that lands in another feature anywhere but its `public.ts`. The
model freeze regex also learns the full spelling, so it cannot undercount.

**Options considered.** `import/no-restricted-paths` from `eslint-plugin-import`: rejected, as it adds
a dependency for a case that does not occur today.

**Consequences.** The architecture test becomes the backstop for relative paths; ESLint remains the
editor-time check for aliases.
