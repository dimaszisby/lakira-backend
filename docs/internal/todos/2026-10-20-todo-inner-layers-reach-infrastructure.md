# Todo — inner layers can still import infrastructure

- **Status:** Closed on `fix/inner-layers-reach-infrastructure`
  ([`inner-layers-reach-infrastructure`](../initiatives/inner-layers-reach-infrastructure/README.md),
  ADR-0078). Reproduced by tests first; a dated run is owed to confirm it
- **Created:** 2026-10-20
- **Owner:** unassigned
- **Origin:** dated SaaS-readiness run of 2026-10-20, finding X40, X41
  ([`audit-2026-10-20.md`](../audits/saas-readiness/audit-2026-10-20.md) § 6)

---

## What

Two routes outside C4's named list, found by the architecture grader's whole-purpose pass:

- **X40.** The inner-layer allowlist admits every relative specifier (`eslint.config.mjs:166`), so
  a domain or application file can import `src/config/db.js`, `src/utils/redis-client.js` or
  `src/shared/middleware/error.js` by relative path. `architecture.test.ts:52-66` checks a relative
  path only for crossing into another feature.
- **X41.** Inner layers may import any feature's `public.ts` (`eslint.config.mjs:174`), and every
  `public.ts` exports infrastructure (`metric/public.ts:10`, `auth/public.ts:9-14`).

Reproduced by lint on the dated run of 2026-10-20: all three relative imports and `authMiddleware`
pass inside a domain entity, while `@/config/db.js` and `zod` are refused.

## Suggested fix

Resolve a relative specifier and hold it to the same list, and split `public.ts` into what inner
layers may take (types, ports) and what only `src/composition` may (adapters). Negative cases in
`feature-boundaries.lint.test.ts`. ADR-0074's decisions 2 and 7 then hold as written.
