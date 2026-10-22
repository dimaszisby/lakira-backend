# Decisions — architecture-dead-code

## D-01 — One `TransactionPort` and one adapter, in the shared kernel

- **Status:** Proposed
- **Date:** 2026-10-23

**Context.** Auth and metric each declared `TransactionPort` in `application/ports/` and each had a
`SequelizeTransactionPort`; both pairs were byte-identical (R11's rest, A1020 § 4.3). ADR-0022,
still Proposed, calls for one transaction port.
**Decision.** The port moves to `src/shared/application/ports/TransactionPort.ts`, beside
`MessageQueuePort`, and the adapter to
`src/shared/infrastructure/persistence/SequelizeTransactionPort.ts`. Both features import them; the
four feature copies are deleted. ADR-0022 gains a status note linking here. Found while
implementing: a third declaration sat at the end of auth's domain `RefreshTokenRepository.ts`, and
`RefreshTokenRepositorySequelize` implemented it with a third `runInTransaction`, so the feature
handed `RotateRefreshToken` the repository as its transaction. That declaration and method are
deleted, and `RotateRefreshToken` takes the shared port and the feature's one
`SequelizeTransactionPort`; both opened the same `sequelize.transaction`.
**Options considered.** _Keep one feature's copy and import it from the other:_ a feature may not
import another feature's application port (ADR-0058).
**Consequences.** A third feature that needs a transaction takes the shared port; nothing is
copied.

---

## D-02 — A feature's `index.ts` exports routers and middleware, never its build function

- **Status:** Proposed
- **Date:** 2026-10-23

**Context.** Every `index.ts` re-exported `buildXFeature`, which nothing imported through it:
`src/composition` and the tests take it from `feature.ts` (X47). `src/app.ts` imports `index.ts`,
so it could rebuild a feature, such as metric-log without its wiring (ADR-0056), unchecked.
**Decision.** The six re-exports are removed, and `architecture.test.ts` fails on an `index.ts`
that re-exports from `./feature.js`.
**Options considered.** _Leave them, unused:_ the risk the audit names stays open.
**Consequences.** A feature is built in `src/composition` or in a test, through `feature.ts`.

---

## D-03 — The dead `db-helper.ts` exports are deleted

- **Status:** Proposed
- **Date:** 2026-10-23

**Context.** Of `src/utils/db-helper.ts`'s six exports only `validateMetricAccess` has a caller,
`MetricAccessSequelize` (X50). The other five were reached only by their unit tests.
**Decision.** Delete `validateMetricCategoryAccess`, `findOwnedMetric`, `findOwnedCategory`,
`findOwnedMetricSettings` and `findOwnedMetricLog`, their tests, and the imports they leave unused.
**Options considered.** _Keep them for a fork to use:_ each feature already reads ownership through
its own repository; these duplicate it untested in production.
**Consequences.** `db-helper.ts` imports one model type.

---

## D-04 — `env-test-utils.ts` moves to `__tests__/helpers/`

- **Status:** Proposed
- **Date:** 2026-10-23

**Context.** `src/tests/env-test-utils.ts` is used only by tests and `jest.setup.unit.ts`, but
`tsconfig.build.json` compiles all of `src`, so it shipped in `dist` (X51).
**Decision.** Move it to `__tests__/helpers/env-test-utils.ts`; its importers use a relative path,
as `__tests__/integration/helpers/test-utils.ts`'s do. ESLint refuses `process.env` in any file
under `__tests__`, and this helper is the one that sets it for the rest, so `eslint.config.mjs`
exempts that one file, by name.
**Options considered.** _A path alias such as `@tests/*`:_ a fifth alias for one file, which would
also need mapping in Jest and ESLint. _Leave it in `src/tests` and exclude that folder from
`tsconfig.build.json`:_ no lint exemption, but test code stays under `src`, which is the finding.
**Consequences.** `src` holds no test code.

---

## D-05 — Auth's Redis client needs no cast

- **Status:** Proposed
- **Date:** 2026-10-23

**Context.** `buildAuthFeature` passed `redisClient as unknown as LockoutRedisClient`, with no
comment saying why (X51). `LockoutRedisClient` names five members of the `redis` client, and
`RedisClientType` has each with a compatible signature.
**Decision.** The cast is removed; typecheck passes without it. The other uncommented cast, the
aggregate row in `MetricLogStatsRepoSequelize`, is needed (Sequelize types `findOne` as a model
even with `raw: true`) and gains a comment.
**Options considered.** _Comment the auth cast too:_ it would explain a cast that hides nothing
but a future mismatch, which is the thing the type should catch.
**Consequences.** A change to the `redis` client that breaks the lockout's five calls now fails
typecheck.
