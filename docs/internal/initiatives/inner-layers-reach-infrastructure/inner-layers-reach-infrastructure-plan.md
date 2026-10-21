# Inner layers reach infrastructure — Plan

- **Status:** Done
- **Appetite:** 1 day
- **Date:** 2026-10-21

## Context and goals

The dated run of 2026-10-20 (`docs/internal/audits/saas-readiness/audit-2026-10-20.md` § 6) found
two routes past ADR-0074's inner-layer allowlist:

- **X40.** `DOMAIN_IMPORTS` admits every relative specifier, and `no-restricted-imports` reads the
  specifier's text, never where it lands. A domain or application file can import
  `src/config/db.js`, `src/utils/redis-client.js` or `src/shared/middleware/error.js` by relative
  path. `architecture.test.ts` checks a relative path only for crossing into another feature.
- **X41.** The inner layers may import any feature's `public.ts`, and every `public.ts` exports
  infrastructure: `MetricAccessSequelize`, `authMiddleware`, mappers and DTO helpers. The one
  inner-layer consumer is `metric/domain/metric.domain.ts`, which takes `type MetricCategory`.

The same run's P3s name four more forms the boundary lint does not read: `@/constants/` allowlisted
as a whole directory while `zod-rules.ts` in it imports `zod` (X42); `eval`, `globalThis.Function`
and `module.require` (X43); `.mts` and `.cts` files unlinted, `.jsx` without boundary rules, and
`architecture.test.ts` reading `.ts` only (X44); `@utils/../features/...` reaching another feature
past every rule (X45).

When this lands, a relative import in an inner layer is judged by where it lands, an inner layer
can reach another feature only through a `contract.ts` that re-exports domain types, and the four
P3 forms are refused. ADR-0074's decisions 2 and 7 then hold as written.

## Acceptance criteria

- **AC-1** — From a feature's domain or application file, a relative path to `src/config/db.js`,
  `src/utils/redis-client.js` or `src/shared/middleware/error.js` is rejected; so is one to the
  feature's own `feature.ts`, `index.ts`, `public.ts` or `infrastructure/`, and one that leaves
  `src`. _Why:_ X40.
- **AC-2** — Relative paths within the layer, from application into the feature's domain, and into
  `src/shared/domain` (and `src/shared/application` from an application file) are still allowed.
  _Why:_ the layers' existing, legitimate imports.
- **AC-3** — The shared kernel's domain and application layers and `src/types/domain` are held to
  the same rule. _Why:_ ADR-0074 decision 2 gives them the same lists.
- **AC-4** — An inner layer may not import another feature's `public.ts` in either spelling, and may
  import its `contract.ts`. A `contract.ts` may re-export only its own feature's domain.
  _Why:_ X41.
- **AC-5** — `@/constants/zod/zod-rules.js` is rejected from an inner layer and
  `@/constants/zod/zod-messages.js` allowed. _Why:_ X42.
- **AC-6** — `eval`, `globalThis.Function` and `module.require` are rejected under `src`. _Why:_
  X43.
- **AC-7** — A `.mts`, `.cts` or `.jsx` file under `src` gets the boundary rules, and
  `architecture.test.ts` reads every source extension. _Why:_ X44.
- **AC-8** — `@utils/` and `@config/` specifiers with a `.` or `..` segment or a doubled slash are
  rejected under `src`. _Why:_ X45.
- **AC-9** — `npm run lint` passes on the tree: no current import is refused. _Why:_ the rules are
  drawn around what the layers import.

## Open questions

None. The owner chose the bundle and the `contract.ts` design on 2026-10-21 (D-02, D-03).

## Out of scope

- B-73's main item: the `@utils/*` and `@config/*` aliases do not survive the build.
- The other B-83 items (X46 to X52, `TransactionPort` declared twice).
- An aliased reference to `process` or `module` (`const p = process; p.getBuiltinModule(...)`):
  lint does not follow aliasing (D-03). It stays in B-83.
- Moving the logger behind a port (ADR-0074 options).

## Decisions expected

- Where the relative-path check lives: a local ESLint rule, `architecture.test.ts`, or a plugin
  dependency (D-01).
- How `public.ts` is split (D-02, settled by the owner).
- What of X43 lint can close (D-03).

## Phases

### Phase 0 — kit and branch

Branch off `origin/dev` at `230aada`; this kit.

### Phase 1 — tests first

Negative and positive cases in `__tests__/unit/feature-boundaries.lint.test.ts` for AC-1 to AC-8,
and an extension check in `architecture.test.ts`; each seen to fail on the current config.

### Phase 2 — the rules

`eslint.config.mjs`: the local rule (D-01) in every inner block and on `contract.ts`; the allowlist
entry moves from `public` to `contract`; `@/constants/` narrowed; the loader-form selectors and
`no-eval`; the extension list; `CANONICAL_PATH` over the three aliases. `contract.ts` for
metric-category; `metric.domain.ts` imports it. `architecture.test.ts` reads every extension and
accepts `contract` as a cross-feature target.

### Phase 3 — gates, review, docs

Gates by name; a review of the diff; ADR-0078, a Status note on ADR-0074, `.claude/rules/
architecture.md` § Export Convention; register rows and D-08; loose ends of #200.

## Risks and trade-offs

- A local rule is code the repository now owns. It is about forty lines beside the lists it reads,
  and the lint test proves it in every case.
- `architecture.test.ts` reading more extensions may surface an existing file it never checked.
  Any such hit is fixed or logged as a decision, not ignored.

## Rollback

Not applicable: no migration, no deploy change. The change is lint configuration, one re-export
file and tests; a revert restores the previous rules.

## Security and data

No trust boundary changes at runtime. The change narrows what the inner layers may import.

## References

- `docs/internal/audits/saas-readiness/audit-2026-10-20.md` § 6 (X40 to X45)
- ADR-0044, ADR-0045, ADR-0058, ADR-0074
- Register rows B-80, B-83, B-73; register decision D-08
