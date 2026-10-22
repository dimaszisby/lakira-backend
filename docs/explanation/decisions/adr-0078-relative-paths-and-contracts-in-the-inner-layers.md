# ADR-0078 — A relative path is judged by where it lands, and inner layers take a feature's `contract.ts`

- **Status:** Accepted
- **Date:** 2026-10-21
- **Related:** Extends [ADR-0074](./adr-0074-boundary-rules-cover-all-of-src.md) (the inner layers
  import from an allowlist) and [ADR-0045](./adr-0045-feature-modules-construct-nothing-on-import.md) (a feature's
  surfaces); [ADR-0058](./adr-0058-inner-layers-and-shared-code-import-rules.md) (the inner layers
  import no infrastructure); [ADR-0023](./adr-0023-cross-feature-metric-access-provider.md) (a port
  belongs to its consumer)
- **Origin:** `D-01` to `D-03` in the inner-layers-reach-infrastructure kit —
  [`inner-layers-reach-infrastructure`](../../internal/initiatives/inner-layers-reach-infrastructure/decisions.md);
  register row B-80 (findings X40 and X41 of the dated run of 2026-10-20), with X42, X43 and X44
  of B-83 and X45 of B-73 (register D-08)

> **Status note (2026-10-23).** The residual under Consequences is closed for `process` and
> `module`: under `src` each is read only as `x.y`, and `globalThis.process`, `global.process` and
> their `module` forms are refused. The rejected option "refuse every bare reference" was rejected
> because `src` passed `process` to seams; it no longer does
> ([`architecture-boundaries` D-06](../../internal/initiatives/architecture-boundaries/decisions.md),
> X43's rest). Still open: an alias of `globalThis` itself.

---

## Context

ADR-0074 put the inner layers on an allowlist. The dated run of 2026-10-20 reproduced, by lint,
two routes past it:

- **X40.** `no-restricted-imports` reads a specifier's text, never where it lands. The domain's
  list admitted every relative specifier, so `../../../../../config/db.js`,
  `../../../../../utils/redis-client.js` and `../../../../../shared/middleware/error.js` passed in a
  domain entity, while `@/config/db.js` was refused. A domain file could also import its own
  feature's `feature.ts`, `index.ts` or `public.ts` by relative path.
- **X41.** The list admitted another feature's `public.ts`, and every `public.ts` exports
  infrastructure: `MetricAccessSequelize`, `authMiddleware`, mappers and DTO helpers.
  `authMiddleware` imported into a domain entity passed. ADR-0074 decision 7 said only
  `src/composition` and other features' infrastructure take a `public.ts` adapter; nothing held
  the inner layers to it.

The same run's P3s named four more forms no rule read: `@/constants/` admitted as a directory while
`zod-rules.ts` in it imports `zod` (X42); `eval`, `globalThis.Function` and `module.require` (X43);
`.mts` and `.cts` files not linted at all, `.jsx` without boundary rules, and
`architecture.test.ts` reading `.ts` only (X44); `@utils/../features/...` reaching another feature
past every pattern (X45).

## Decision

1. **A relative import in an inner layer is judged by where it lands.** A local ESLint rule,
   `boundaries/relative-imports-on-the-list`, defined in `eslint.config.mjs` beside the lists,
   resolves the specifier against the importing file. A target outside `src` is refused. A target
   in the file's own feature passes only into the parts its layer may reach: `domain/` from the
   domain, `domain/` and `application/` from the application. Any other target passes only if its
   `@/` form is on the layer's list, `DOMAIN_IMPORTS` or `APPLICATION_IMPORTS`. The rule runs in a
   feature's domain and application, in `src/shared/{domain,application}`, in `src/types/domain`,
   and on `contract.ts`. It reads static `import` and `export … from`, the only forms `src` allows.
2. **The inner layers take another feature's `contract.ts`, never its `public.ts`.** A feature
   with something for other features' inner layers exports it from `contract.ts` at its root, which
   re-exports from its own domain and nothing else; the lint holds it to the domain's rules with
   its own `domain/` as the one part of the feature it may reach. The lists name
   `<feature>/contract`, not `<feature>/public`. `public.ts` keeps the adapters, for infrastructure
   and `src/composition`, as ADR-0074 decision 7 says. metric-category's contract exports
   `type MetricCategory`, which metric's domain takes; its `public.ts` no longer does.
3. **`@/constants/` is admitted as one file**, `@/constants/zod/zod-messages.js`, the only one the
   inner layers import.
4. **Under `src`, `eval`, implied eval, a `Function` reached as a property (`globalThis.Function`)
   and `module.require` are refused.** `@typescript-eslint/no-require-imports` already refuses a
   `require` and `import x = require()` everywhere but `src/config`'s `.cjs` files; the lint test
   now proves it.
5. **Every rule matches `mts`, `cts` and `jsx` too**, and `architecture.test.ts` reads every
   extension ESLint lints.
6. **`@utils/` and `@config/` are held to one spelling** as `@/` is: no `.` or `..` segment, no
   doubled slash.

## Options considered

- _Check relative paths in `architecture.test.ts`._ It already resolves paths, but only in Jest and
  by regex over `.ts` files; the lists would need a second copy in TypeScript, and copies drift.
- _`eslint-plugin-import` or `eslint-plugin-boundaries`._ A dependency with its own resolver and
  configuration language, for one check the repository states in about forty lines.
- _A `no-restricted-imports` block per directory depth._ The patterns would depend on where a file
  sits, and each new folder would need one.
- _Rename `public.ts` to `adapters.ts` and make `public.ts` the inner-safe surface._ The same
  result for about twenty changed imports and ADR-0045's wording.
- _Let the inner layers take `public.ts` with `import type` only._ Nothing would load, but a domain
  type could still be built on an HTTP DTO.
- _Refuse every bare reference to `process` or `module`._ It closes an aliased
  `process.getBuiltinModule`, but `src` passes `process` to seams today.

## Consequences

- ADR-0074's decision 2 (the inner layers import from a list) and decision 7 (adapters reach only
  infrastructure and composition) hold for every import the inner layers can write.
- A feature has three surfaces, each with one audience: `index.ts` for `src/app.ts`, `public.ts` for
  other features' infrastructure and `src/composition`, `contract.ts` for other features' inner
  layers. A port is still the consumer's (ADR-0023), so a contract carries domain types, not ports.
- The repository owns a small lint rule. The lint test runs it in every case.
- Left open: an aliased `process` or `module` (`const p = process; p.getBuiltinModule(...)`) —
  lint does not follow a value through a variable (register B-83).

## Enforcement

`__tests__/unit/feature-boundaries.lint.test.ts`, "relative paths, public.ts and the last unread
forms (ADR-0078)": relative paths from a domain file, an application file, the shared kernel and
`src/types/domain`; `export … from`; another feature's `public.ts` and `contract.ts`; a contract's
own reach; X42 to X45. "Holds … to the domain's rules" covers `.mts`, `.cts` and `.jsx`.
`__tests__/unit/architecture.test.ts`, "the source-file reader". On the config before this change,
13 of the lint tests and the reader test failed. Each new rule was also seen to reject a deliberate
violation written into a real file before it was trusted.

## Links

- Kit: [`inner-layers-reach-infrastructure`](../../internal/initiatives/inner-layers-reach-infrastructure/README.md)
- Audit: `docs/internal/audits/saas-readiness/audit-2026-10-20.md` § 6 (X40 to X45)
- Todo: `docs/internal/todos/2026-10-20-todo-inner-layers-reach-infrastructure.md`
