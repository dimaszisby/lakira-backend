# ADR-0044 — Feature boundaries, and the exceptions that are frozen rather than blessed

- **Status:** Accepted
- **Date:** 2026-09-23
- **Origin:** `D-02`, `D-03` and `D-06` in the feature-boundaries kit —
  [`feature-boundaries`](../../internal/initiatives/feature-boundaries/decisions.md)

---

## Context

`.claude/rules/architecture.md` has long said two things: _"Features export through `index.ts`
only"_ and _"Application layer depends on domain only"_. The code contradicted both, and
`__tests__/unit/architecture.test.ts` passed green — it checked directory layout and a `sequelize`
import string, nothing else.

SaaS-readiness caveat C4 named three violations. All three were real, measured on `dev` @ `21f12eb`:
25 cross-feature imports into another slice's internals, 3 application-layer use cases importing the
ORM models barrel, and 12 domain throws of `AppError` — which carries an HTTP `statusCode`.

The question this record answers is not "should boundaries be enforced" but **which crossings are
violations**, because they are not alike.

## Decision

**1. Cross-feature imports go through a feature's public surface, enforced by ESLint.**
`no-restricted-imports` bans `@/features/*/domain/**`, `application/**` and `infrastructure/**`. The
rule lives in lint rather than only a test so it runs in the editor, and it adds no dependency — the
same mechanism already bans the legacy `src/services/**` layout.

**2. A feature's public surface is `public.ts`, not `index.ts`.** Every `index.ts` constructs its
routers at module scope, so importing one pulls that feature's composition root and cycles back
through its siblings. `public.ts` holds the cross-feature surface and imports no routers.

**3. The 11 Sequelize cross-model associations are frozen at an exact count, not allowlisted.** A
12th fails CI; so does a removal. An allowlist reads as permission, and a ceiling lets the number
drift from reality. The freeze records a debt.

**4. Those 11 are not an approved exception. Cross-module foreign keys are the deepest instance of
the problem, and ID-only references are the destination.** It is the standard end state for a
modular monolith that modules do not share a schema and hold no cross-module FKs, with integrity
across modules moving to the application layer. Declaring the associations legitimate would write
the wrong destination into the rules.

**5. Domain entities raise a semantic `kind`; the HTTP adapter owns the status.** `DomainError`
carries no status. `src/shared/middleware/error.ts` maps `kind → status`.

**6. Every rule must be seen to reject before it is trusted.**

## Options considered

- _Enforce everything strictly, no exceptions._ Rejected: the 11 model associations cannot route
  through a barrel without circular imports, so a strict rule would be bypassed on day one — and a
  bypassed rule is worse than an honest exception.
- _Treat model associations as permanently legitimate._ Rejected; see decision 4.
- _`eslint-plugin-boundaries` or `dependency-cruiser`._ Both are purpose-built and better than
  hand-rolled patterns. Rejected because each is a new dependency that trips
  `security:delta:gate`, for a job `no-restricted-imports` already does here.
- _Fix the barrel cycle at its root_ — stop constructing routers at module scope. **This is the
  better fix** and was rejected only on size: it changes runtime wiring for six features plus
  `server.ts`. Filed as `docs/internal/todos/2026-09-22-todo-routers-constructed-at-module-scope.md`.
  Decisions 2 and 3 are both workarounds for that one cause and should be revisited if it lands.

## Consequences

- Five `public.ts` modules; each `index.ts` re-exports its own, so the composition root is
  unaffected.
- Three repository ports gained an optional transaction parameter, and the dummy generators take
  ports instead of the ORM. The metric generator gained a transaction, so a half-failed batch leaves
  nothing behind.
- The boundary rule covers `src/features/**` only. Widening it to all of `src` reports 33 further
  violations, several structural — `infrastructure/db/models.ts` exists to import every feature's
  models. Tracked in `docs/internal/todos/2026-09-22-todo-feature-boundary-rule-scope.md`.
- A new `DomainError` kind must be added to `DOMAIN_ERROR_STATUS`; the map is typed
  `Record<DomainErrorKind, number>` so the compiler rejects an incomplete one. An unmapped kind
  would fall through to 500 and be masked in production.
- Adding a legitimate model association now fails CI until the frozen count is edited. That friction
  is the point, and the failure message says so.

**Decision 6 earned its keep immediately.** Insisting each rule fail first caught three things that
looked correct: an ESLint run reporting zero violations because the config had failed rather than
the code passing; a `!negation` inside a `group` that ESLint accepts and silently ignores; and a
`persistence/*` glob matching across path separators, re-banning the models it was meant to exempt.
None would have surfaced from the rule merely passing — which is precisely the defect C4 described.

## Links

- `docs/internal/audits/saas-readiness/FINAL-AUDIT-SUMMARY.md` § 4, caveat C4
- [ADR-0037](./adr-0037-resolve-canonical-ddd-layout-disagreement.md) — the layout this bounds
- `eslint.config.mjs` — the rules
- `__tests__/unit/architecture.test.ts` — the frozen count
- `__tests__/unit/shared/middleware/domain-error-envelope.test.ts` — the envelope characterisation
