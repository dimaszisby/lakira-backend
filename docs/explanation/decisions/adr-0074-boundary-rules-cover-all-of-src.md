# ADR-0074 — The boundary rules cover all of `src`, and the inner layers import from an allowlist

- **Status:** Accepted (merged in #194, `fa7c497`)
- **Date:** 2026-10-20
- **Related:** Extends [ADR-0044](./adr-0044-feature-boundaries-and-their-frozen-exceptions.md)
  (feature boundaries) and [ADR-0058](./adr-0058-inner-layers-and-shared-code-import-rules.md)
  (inner layers and shared code); [ADR-0023](./adr-0023-cross-feature-metric-access-provider.md)
  (a port belongs to its consumer); [ADR-0056](./adr-0056-one-wiring-per-feature-for-every-entry-point.md)
- **Origin:** `D-01` to `D-07` in the boundary-rules-everywhere kit —
  [`boundary-rules-everywhere`](../../internal/initiatives/boundary-rules-everywhere/decisions.md);
  register rows B-28 (audit 2026-10-12, W6) and B-29

> **Status note (2026-10-21).** Decisions 2 and 7 were wider than the lint: a relative path passed
> wherever it landed, and the list admitted another feature's `public.ts`, which exports
> infrastructure (findings X40 and X41 of the dated run of 2026-10-20). Carried out by
> [ADR-0078](./adr-0078-relative-paths-and-contracts-in-the-inner-layers.md): a relative path is
> judged by where it lands, the inner layers take a feature's `contract.ts`, and `.mts`, `.cts`,
> `.jsx`, `@utils/` and `@config/` are held to the same rules. The consequence below that a
> relative path into `src/shared/middleware` is "the remaining gap" no longer holds.

> **Status note (2026-10-23).** Decisions 1 and 6 were wider than the lint too: `.mts` and `.cts`
> under `src` were not linted and `.jsx` had no boundary rule (X44), and `eval`,
> `globalThis.Function`, `module.require` and an aliased `process` passed (X43).
> [ADR-0078](./adr-0078-relative-paths-and-contracts-in-the-inner-layers.md) carries them out, and
> its note of 2026-10-23 refuses `process` and `module` other than as `x.y`. Still open: an alias
> of `globalThis` itself (audit 2026-10-20, § 4.5).

---

## Context

ADR-0044 and ADR-0058 put the architecture's import rules in `eslint.config.mjs`. Probed on `dev`
at `0a86693`, by linting piped text under real file paths as the lint test does, the rules let
through:

- in a feature's domain file: `zod`, `winston`, `@/shared/middleware/error.js`, `@/utils/logger.js`,
  `@/config/envManager.js` and `@/lib/openapi/...` — the inner-layer rules were a package denylist
  and a name match;
- spellings the feature pattern did not parse: `@/features/metric/../metric-log/domain/...`,
  `@/features/./...`, `@/features//...`, `src/features/...`, and a name with a digit or an
  underscore;
- any file that is not `*.ts`: a `.js` or `.tsx` file in a domain folder got the legacy patterns
  alone;
- any file outside `src/features` and `src/{types,shared,utils,config}`: `app.ts`, `server.ts`,
  `worker.ts`, `src/composition`, `src/infrastructure`, `src/lib`, `src/constants` and `src/tests`
  had no feature rule. `src/app.ts` deep-imported two of auth's middlewares;
- `process.getBuiltinModule` and the `Function` constructor, which load code no import rule reads.

Three exemptions were wider than their comments: the models block covered all 11 model files and
any feature's file named `MetricReadMapper.ts` or `TrendRepoSequelize.ts`, though six files import
another feature's models; `db-helper.ts`'s pattern accepted any path with a `models/` segment
anywhere; the ORM registry and the OpenAPI assembly had no rule at all.

## Decision

1. **Every file under `src/` is matched**, whatever its extension (`ts, tsx, js, mjs, cjs`).
2. **The inner layers import from an allowlist.** The domain may import relative paths,
   `node:crypto`, the shared domain, shared constants, `@/shared/utils/text-validation.js`,
   `@/types/domain/`, `@/constants/` and another feature's `public.ts`. The application adds the
   shared application kernel, `@/utils/logger.js`, `@/utils/date-io.js`, `@/shared/cache/keys.js`,
   `@/config/envManager.js` and `@/config/app-name.js`. Anything else, every third-party package
   included, is refused. The lists are `DOMAIN_IMPORTS` and `APPLICATION_IMPORTS`; an entry is
   added with a reason. `src/shared/{domain,application}` take the same lists, and `src/types/domain`
   is a domain layer.
3. **One spelling per module.** Under `src`, a specifier starting `src/`, or an `@/` path with a
   `.` or `..` segment or a doubled slash, is refused. The feature pattern reads any name.
4. **Outside `src/features`, one door per purpose.** `src/app.ts` enters a feature through its
   `index.ts`; `src/composition` through `feature.ts` or `public.ts`; `src/infrastructure/db` and
   `src/utils/db-helper.ts` through one model file; `src/lib/openapi` through one
   `http/schema.zod` file. Every other file under `src` imports no feature. `src/app.ts` takes
   `authMiddleware` and `requireOrgRole` from auth's `index.ts`.
5. **Exemptions name their files.** The models exemption lists the six files that import another
   feature's models.
6. **`process.getBuiltinModule` and the `Function` constructor are refused under `src`.**
7. **`public.ts` re-exporting an infrastructure adapter stays.** W6 listed it. ADR-0023 makes a
   port the consumer's and the adapter the provider's to export; `public.ts` is where it exports
   it, and only `src/composition` and other features' infrastructure take it.

## Options considered

- _Extend the denylists._ Each audit found a name the list lacked; a list of what is allowed has
  no such gap.
- _One blanket exemption for the composition root, the ORM registry and the OpenAPI assembly_
  (the B-29 todo's question 1). An exemption is where violations hide; a door is narrower and as
  cheap.
- _Move the logger out of the application layer._ A port for logging is a larger change; the
  logger is allowed by name and the list says so.

## Consequences

- A new import into a domain or application file that is not on its list fails lint, and the
  message names the list. Adding to it is a visible decision.
- A relative path is still allowed in the inner layers; the infrastructure and application rules
  read it, and `architecture.test.ts` catches one that crosses into another feature. A relative
  path from a feature into `src/shared/middleware` is the remaining gap: no rule reads where a
  relative path lands outside the feature tree.
- The `@utils/*` and `@config/*` aliases do not survive the build (B-28's todo, item 3); filed
  apart as register row B-73.

## Enforcement

`__tests__/unit/feature-boundaries.lint.test.ts`, "the rules cover all of src, by allowlist where
a layer is inner": every probed spelling and package, in `.ts`, `.js`, `.tsx` and `.mjs` files;
each door; the six model files; `process.getBuiltinModule` and `Function`. On the config before
this change, 19 of its cases failed. Each new rule was also seen to reject a deliberate violation
in a real file before it was trusted.

## Links

- Kit: [`boundary-rules-everywhere`](../../internal/initiatives/boundary-rules-everywhere/README.md)
- Todos: `docs/internal/todos/2026-09-22-todo-feature-boundary-rule-scope.md`,
  `docs/internal/todos/2026-10-11-todo-apperror-lint-rule-review-leftovers.md`
