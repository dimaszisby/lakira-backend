# Registration session — Checklist

## Phase 0 — Prove the negative

- [x] `__tests__/integration/api/auth-refresh.test.ts` — new case "register sets a refresh cookie
      with login's attributes", comparing register's `Set-Cookie` attribute set against login's.
      Reuses the existing `extractRefreshCookie` helper.
- [x] `__tests__/integration/api/auth-refresh.test.ts` — new case "a register-issued cookie
      refreshes into a new access token".
- [x] Ran both against unchanged source: **2 failed**, for the right reasons — no cookie issued
      (`undefined`), and `/auth/refresh` with no cookie returning 401.

## Phase 1 — Auth transaction port

- [x] `src/features/shared/auth/application/ports/TransactionPort.ts`
- [x] `src/features/shared/auth/infrastructure/persistence/SequelizeTransactionPort.ts`
- [x] `src/features/shared/auth/feature.ts` — `const tx = new SequelizeTransactionPort()`

## Phase 2 — Optional transaction through three ports

- [x] `src/features/shared/auth/domain/repositories/UserRepository.ts` — `create(data, tx?)`
- [x] `src/features/shared/auth/domain/repositories/OrganizationRepository.ts` — `create(data, tx?)`
- [x] `src/features/shared/auth/domain/repositories/MembershipRepository.ts` — `create(data, tx?)`
- [x] `UserRepositorySequelize.ts` — `{ transaction }` on both `create` and `reload`
- [x] `OrganizationRepositorySequelize.ts` — same
- [x] `MembershipRepositorySequelize.ts` — same
- [x] Confirmed the optional parameter held: `tsc` reported **one** error across the whole repo, in
      `RegisterUser.test.ts` (constructor arity), not in any repository double.

## Phase 3 — The fix

- [x] `RegisterUser.ts` — takes `IssueRefreshToken` and `TransactionPort`; `AuthResult` grows
      `rawRefreshToken`; four writes inside one `runInTransaction` via `executeInTransaction`
- [x] `feature.ts` — `RegisterUser` constructed with the two new dependencies
- [x] `controller.ts` — threads `userAgent`/`ip` from `req`, calls `setRefreshCookie`
- [x] `__tests__/unit/features/auth/application/RegisterUser.test.ts` — new constructor, plus cases
      for shared transaction handle, request context, and abort-without-issuing

## Phase 4 — Cleanup

- [x] `auth-refresh.test.ts` — `loginUser()` no longer registers-then-logs-in for a cookie
- [x] `docs/internal/todos/2026-09-20-todo-document-set-cookie-responses.md` — filed

## Discovered

- [x] Found: `PersistenceTransaction` is now declared twice inside the auth slice — in the new
      `application/ports/TransactionPort.ts` and in `domain/repositories/RefreshTokenRepository.ts`.
      Both are `unknown`, so they interoperate and nothing breaks. → **out of scope**, filed as
      `docs/internal/todos/2026-09-20-todo-unify-auth-persistence-transaction-type.md`.
      Reconciling means touching `RefreshTokenRepository` and `IssueRefreshToken`, which are
      explicitly out of scope for this kit.
- [x] Found: two unit tests needed updating for the new call signatures —
      `controller.test.ts` (fake `req` had no `headers`, so threading `user-agent` broke it) and
      `UserRepositorySequelize.test.ts` (`create` now receives a second argument). → **in scope**,
      done in Phase 3.

## Acceptance

- [x] AC-1 — `auth-refresh.test.ts` › register sets a refresh token cookie with login's attributes,
      and `controller.test.ts` › registers new users via use case asserts `res.cookie`
- [x] AC-2 — `auth-refresh.test.ts` › a register-issued cookie refreshes into a new access token
- [x] AC-3 — `RegisterUser.test.ts` › passes request context through to the refresh token
- [x] AC-4 — `RegisterUser.test.ts` › issues the refresh token inside the same transaction as the
      writes, and › aborts without issuing a refresh token when a write fails. **Partial:** see
      Review — the unit tests prove all four writes share one transaction handle; the rollback
      itself is Sequelize's contract, exercised through `SequelizeTransactionPort`.
- [x] AC-5 — `npm run docs:openapi:check` exited 0 with no diff
- [x] AC-6 — `loginUser()` now calls `registerUser()` and logs in only to exercise the login path

## Gates

- [x] typecheck — `npm run typecheck`, exit 0
- [x] lint — `npm run lint`, exit 0
- [x] format — `npm run format:check`, exit 0
- [x] tests — `npm run test:unit` exit 0 (569 passed, 90 suites); `npm run test:integration` exit 0
      (196 passed, 5 skipped, 28 of 30 suites). Run separately, not combined.
- [x] build — `npm run build`, exit 0
- [x] OpenAPI — `npm run docs:openapi:check`, exit 0, no diff. 46 operations, 333 `$refs`,
      48 schemas validated.
- [ ] security delta — **skipped**, no dependency added, upgraded or removed.

Flake check: `auth-refresh.test.ts` run five consecutive times, 9/9 passing each time.

---

## Review

**Outcome.** `POST /auth/register` now issues a refresh cookie identical to login's, inside a single
transaction covering the user, organization, membership and refresh-token writes. All six acceptance
criteria met; all gates green except the security delta, which does not apply.

**What the negative proof showed.** Both new integration tests failed against unchanged source
before implementation — the first because no `Set-Cookie` was present at all, the second with a 401
from `/auth/refresh`. Neither could have passed by accident, which is the point.

**Where AC-4 is weaker than it reads.** The unit tests prove every write receives the same
transaction sentinel and that a mid-sequence failure aborts before the refresh token is issued.
They do not prove the database rolls back — that is `sequelize.transaction()`'s contract, reached
through `SequelizeTransactionPort`. A true end-to-end atomicity test needs a way to force a failure
after the first write, and `buildAuthFeature` exposes no repository override to inject one
(`AuthFeatureOverrides` covers only `emailSender` and `lockoutRedis`). Widening that override
surface was out of scope here. Worth doing if partial registrations are ever observed.

**D-03's premise held.** `docs:openapi:check` exited 0 with no diff, confirming that no endpoint
documents its `Set-Cookie` header and that this change is invisible to the published contract.
`lakira-frontend` needs no sync for this work.

**Q-1 remains open** — whether `AcceptInvite` and `InviteUserToOrganization` should adopt the new
`TransactionPort`, and whether D-02 warrants its own ADR as a port-boundary decision.
