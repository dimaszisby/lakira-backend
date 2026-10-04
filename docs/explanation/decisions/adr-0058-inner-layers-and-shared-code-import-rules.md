# ADR-0058 — The inner layers import no infrastructure, and shared code imports no feature

- **Status:** Accepted
- **Date:** 2026-10-04
- **Related:** SaaS-readiness caveat C4, findings S5 and S6
  (`docs/internal/audits/saas-readiness/audit-2026-10-03.md` § 4.1, § 6);
  [ADR-0044](./adr-0044-feature-boundaries-and-their-frozen-exceptions.md), whose rules these extend;
  [ADR-0023](./adr-0023-cross-feature-metric-access-provider.md);
  `.claude/rules/architecture.md` § Dependency Rules
- **Origin:** `D-02` and `D-03` in the boundary-rule-residuals kit —
  [`boundary-rule-residuals`](../../internal/initiatives/boundary-rule-residuals/decisions.md)

---

## Context

ADR-0044 put a wall between features: one feature reaches another through its `public.ts`, and
ESLint rejects anything deeper. Two routes around that wall stayed open, and the 2026-10-03 audit
kept caveat C4 open on them.

**Shared code.** The rules applied to `src/features/**` only. `src/types/` held two of the metric
feature's own type files, and they imported a Zod schema, three response DTO types and a domain
entity from four features. Feature code then imported those types, so one feature depended on
another's internals with a shared folder in between.

**The inner layers.** `.claude/rules/architecture.md` says the application layer depends on the
domain and on ports. The only lint rule behind that sentence banned the ORM models barrel. Four use
cases imported HTTP DTO types, the queue topology and `amqplib`'s message type, and lint passed.

## Decision

1. **The domain and application layers import no infrastructure.** In `domain/` and `application/`
   of every feature, and of `src/shared/`, ESLint rejects any import whose path has an
   `infrastructure` segment, relative or aliased.
2. **They import no driver package either.** The broker client, the web framework and its
   middleware, the ORM and its driver, the cache client, the mail provider, and the token and
   hashing libraries are rejected by name, subpaths and scoped siblings included
   (`sequelize/types`, `@redis/client`).
3. **Shared code imports no feature.** `src/types/`, `src/shared/`, `src/utils/` and `src/config/`
   may not import anything under `src/features/`, in either spelling, `public.ts` included. Three
   places outside `src/features/` do import feature files, and each is named in the config:
   - `src/infrastructure/db/` — the ORM registry, where every model meets (ADR-0044's frozen
     exception);
   - `src/lib/openapi/` — assembles the spec from every feature's schemas;
   - `src/utils/db-helper.ts` — Sequelize model files only.
     The entry points and `src/composition/` wire features and are not shared code.
4. **What the layers use instead.**
   - A use case declares the input it accepts. The controller passes the validated body, and the
     compiler proves the two shapes agree.
   - A queue handler receives `IncomingMessage` from
     `src/shared/application/ports/MessageHandlerPort.ts`, which names only the fields handlers
     read. The broker's message type satisfies it structurally.
   - The exchange and routing-key names a publisher passes to `MessageQueuePort.publish` live
     beside that port, in `src/shared/application/messaging/`.
   - A type that needs another feature's type lives in a feature and imports that feature's
     `public.ts`.
5. **Every rule has persisted cases.** `__tests__/unit/feature-boundaries.lint.test.ts` shows each
   rule rejecting and each exception allowing, as ADR-0044 decision 6 requires.

## Options considered

- **Ban only the imports found today.** Rejected: that is how the models-only rule left the rest
  open.
- **An allowlist of what the inner layers may import.** Rejected: it would have to list every
  utility and be edited with every change. The cost is in Consequences.
- **Let shared code import a feature's `public.ts`.** Rejected: a shared module that needs a feature
  is not shared.
- **Bring `src/infrastructure/db/` and `src/lib/openapi/` under the shared-code rule.** Rejected:
  both exist to gather feature files, and a rule with a standing exception on every line teaches
  nothing.
- **Give the queue its own "enqueue job" port and adapter per feature**, so use cases stop naming
  exchanges and routing keys. Deferred: it is the cleaner shape, but it changes a constructor and
  its wiring, and no rule here needs it.

## Consequences

- **A request field reaches a use case only once the use case's input declares it.** The two can
  drift in the permissive direction: a schema field the input does not name is passed and ignored.
- **The infrastructure rule is by path name.** Code that is infrastructure in fact but lives outside
  an `infrastructure/` directory is not caught: `@/shared/middleware/*`, `@/shared/cache/*` or
  `@/utils/redis-client.js` can still be imported by a use case. No inner-layer file does so today.
  The driver-package ban covers the same ground from the other side, for packages.
- **The rules read import paths.** A re-export through an allowed file gets past them, as with every
  rule in this config. A sibling's `public.ts` re-exports infrastructure mappers, and an application
  file may import it; that is ADR-0044's surface working as designed.
- **Not covered, and still open:** domain repositories importing a transaction type from
  `application/` (audit R11), and `AppError`, which carries an HTTP status, in application code
  (audit R7).
- **`src/types/` is smaller, not gone.** It keeps the types no single feature owns, including three
  feature-shaped files (`metric-log`, `metric-settings` and `user` domain types) that several
  features import.
- **Revert-safe.** No migration, data, dependency or API change. The behaviour of every use case is
  unchanged; only where types are declared has moved.

## Links

- Kit: `docs/internal/initiatives/boundary-rule-residuals/`
- Rules: `eslint.config.mjs` (`INNER_LAYER_INFRASTRUCTURE`, `INNER_LAYER_DRIVER_PACKAGES`,
  `SHARED_CODE_FEATURE_IMPORT`)
- Cases: `__tests__/unit/feature-boundaries.lint.test.ts`
- Moved: `src/features/public/metric/domain/metric.domain.ts`,
  `src/features/public/metric/infrastructure/http/metric.dto.ts`
