# Credential changes — Checklist

Items name the artifact. Acceptance points at the plan's AC ids, and gates point at
`.claude/rules/workflow.md`; neither is copied.

## Phase 0: kit and issues

- [x] `docs/internal/initiatives/credential-changes/README.md`: status, slug, both branches,
      issue #309, links to the plan, checklist and decisions
- [x] `credential-changes-plan.md`: the plan as approved
- [x] `decisions.md`: D-01 to D-07, Accepted, dated 2026-11-24
- [x] #351, "One reset token can be spent twice by racing requests", filed (`type:bug`,
      `tier:5`, `sev:P3`, `state:ready`)
- [x] #352, "An email change can be undone from the old address for a few days", filed
      (`type:task`, `tier:5`, `state:deferred`)
- [x] Comment on #309: kit link, and the gating expectation moved to #311 (D-03)
- [x] `grep -r "\[NEEDS CLARIFICATION\]"` on the kit finds no marker; `format:check` passes
- [x] **STOP:** the owner approves the kit (approved 2026-11-24)

## Phase 1: the split and the password route (PR 1, `fix/309-credential-changes`)

- [x] `infrastructure/http/loginLockout.ts`: `makeAttemptCounter` factory. The login lockout is
      rebuilt from it with its key (`auth:lockout:<hashEmail>`), numbers and message unchanged.
- [x] `application/ports/CredentialAttemptsPort.ts`: `recordFailure(userId)` and
      `reset(userId)`. The adapter is wired in `feature.ts`, reusing `lockoutRedis`. As at login,
      the 429 check (`feature.credentialAttempts.check(userId)`) runs in the controller, since no
      domain error maps to 429.
- [x] `application/use-cases/ConfirmCurrentPassword.ts`:
  - compare through `PasswordHasher`;
  - a mismatch records a failure and throws `ValidationError` on `currentPassword`;
  - a match resets the counter.
- [x] `application/use-cases/ChangePassword.ts`:
  - confirm, refuse a new password equal to the current one, and hash before the transaction;
  - then, in one transaction: `revokeAllForUser`, `save`,
    `PasswordResetTokenRepository.invalidateAllForUser`, `issueRefreshToken.executeInTransaction`;
  - log `auth.sessions.revoked` with reason `password_change`.
- [x] `application/use-cases/UpdateProfile.ts`: loses `password` and `email`, and the
      refresh-token, issuer and transaction dependencies #308 gave it. It returns the user.
- [x] `infrastructure/http/schema.zod.ts`:
  - `changePasswordBody` (`currentPassword`, `password`, `passwordConfirmation`, refined to match);
  - `updateUserBody` refuses `email` and `password` with a message naming the route.
- [x] `infrastructure/http/router.ts`: `POST /change-password` through `authMiddleware`,
      `userRateLimiter`, `requireJsonObjectBody`, then `validate`. `methodNotAllowed` entries for
      it.
- [x] `infrastructure/http/controller.ts`: `changePassword` sets the refresh cookie. It and
      `updateProfile` set `Retry-After` on the counter's 429, as login does.
- [x] `feature.ts`: wiring for `ChangePassword`, `ConfirmCurrentPassword` and the counter.
      `UpdateProfile`'s constructor narrows.
- [x] Spec (`src/lib/openapi/openapi-docs.ts`, `openapi-config.ts`):
  - `POST /auth/change-password`, whose 200 declares `RefreshCookie`;
  - `PUT /auth/profile` loses its `ReissuedRefreshCookie`, and that component is removed;
  - regenerate the spec.
- [x] Pinned spec counts: `__tests__/unit/openapi-response-headers.test.ts` (the operation list)
      and `__tests__/unit/bootstrap-fork.test.ts` (the cookie-name count).
- [x] Tests, unit:
  - new: `ConfirmCurrentPassword.test.ts`, `ChangePassword.test.ts`, the counter's own test;
  - updated: `UpdateProfile.test.ts`, `controller.test.ts`, `router.test.ts`, the `loginLockout`
    tests.
- [x] Tests, integration:
  - `auth-session-revocation.test.ts` moves its password-change cases to
    `POST /auth/change-password`;
  - new: `auth-credential-changes.test.ts` covers AC-1 to AC-5.
- [x] ADR-0098, promoted from D-01, plus its registry row; the next free number moves to
      ADR-0099; the ADR count in `CLAUDE.md` moves to 98.
- [x] ADR-0097: a dated status note. The re-issued cookie moved from `PUT /auth/profile` to
      `POST /auth/change-password` (ADR-0098).
- [x] Docs, after review:
  - `.claude/rules/security.md` (Authentication Flow, and a credential-attempts note);
  - `docs/reference/frontend-handoff.md`;
  - `docs/explanation/product-requirements.md` (the auth routes row);
  - `docs/explanation/architecture/c4-components-auth.md` (use-case list).

## Phase 2: the pending email change (PR 2, `fix/309-credential-changes-email`)

- [ ] Migration `src/migrations/2026MMDDHHMMSS-create-email-change-tokens.cjs` with a working
      `down`:
  - columns: `id`, `user_id` (users, CASCADE), `new_email`, `old_email`, `token_hash` (unique,
    nullable until the job mints it), `expires_at`, `used_at`, timestamps;
  - index `(user_id, used_at)`.
- [ ] Model `models/email-change-token.sequelize.ts`, registered in `registerAuthModels` and
      `associateAuthModels` (`user.sequelize.ts`, with `User.hasMany`); `src/infrastructure/db/types.ts`
      gains the `DbModels` key.
- [ ] Entity `domain/entities/EmailChangeToken.ts`, mapper `EmailChangeTokenMapper.ts`,
      repository `EmailChangeTokenRepository.ts` and its Sequelize implementation:
  - `create`, `supersedeAllForUser`, `findById(id, tx)`, `setTokenHash(id, hash, tx)`,
    `findByTokenHash`;
  - `spend(id, now, tx)`, a conditional update reporting whether it spent the token.
- [ ] `application/use-cases/RequestEmailChange.ts`:
  - confirm, then refuse the same address (400) or one in use (409);
  - in one transaction, supersede the user's pending rows and create the new row;
  - publish both jobs. The confirmation's fallback runs in the request (ADR-0069, ADR-0080). The
    notice's runs in the background (ADR-0067).
- [ ] `application/use-cases/ConfirmEmailChange.ts`. In one transaction:
  - `spend`, with a generic 400 when it did not spend;
  - re-check the address (409 rolls back);
  - `changeEmail` and `setEmailVerifiedAt`, then `save`;
  - revoke the user's verification and reset tokens;
  - log `auth.email_change.confirmed`.
- [ ] Jobs, each with its handler and its `parseJob` through `readJobBody` and `isUuid`:
  - `SendEmailChangeEmailHandler`: `{ requestId }`; mints the token, stores its hash, and sends
    inside `runOnce`;
  - `SendAccountNoticeHandler`: `{ userId, notice, requestId? }`.
- [ ] Wiring for both jobs:
  - `src/shared/application/messaging/job-routes.ts`: two `QUEUES` and two `ROUTING_KEYS`;
  - `src/shared/infrastructure/queue/topology.ts`: two `assertWorkQueue`;
  - `src/worker.ts`: two `RabbitMQConsumer`;
  - `feature.ts`: return entries;
  - `__tests__/unit/shared/infrastructure/queue/topology.test.ts`: `WORK_QUEUES`;
  - `docs/explanation/architecture/c4-containers.md`: the queue count.
- [ ] Templates `email-change-confirm.ts`, `email-change-notice.ts` (masked new address) and
      `password-changed.ts`. Each escapes HTML and carries no user-chosen text beyond the address.
- [ ] `ChangePassword` and `ResetPassword` publish the `password_changed` notice.
- [ ] `src/config/zodEnv.ts`:
  - `FRONTEND_EMAIL_CHANGE_URL`, with production refusing the localhost default and staging
    warning;
  - `RATE_LIMIT_EMAIL_CHANGE_USER_MAX`;
  - cases in `__tests__/unit/config/zodEnv.production-guard.test.ts`.
- [ ] `src/shared/middleware/rate-limiter.ts`: `createEmailChangeRateLimiter`, keyed by user,
      with its own store name. The lists it must join:
  - `architecture.test.ts`: the limiter count (11 → 12) and the `USER_KEYED_LIMITER` regex;
  - `rate-limiter.envelope.test.ts`: `LIMITERS`;
  - `rate-limiter.test.ts`: the prefix and IPv6 lists;
  - `router.test.ts`: the mock sentinels.
- [ ] Router:
  - `POST /change-email`: `authMiddleware`, the new limiter, body checks, `validate`;
  - `POST /confirm-email-change`: the verify-email per-IP limiter first, then body checks;
  - `methodNotAllowed` entries for both.
- [ ] Spec: both routes, regenerated. The pinned counts are rechecked.
- [ ] Tests:
  - unit: each use case and each handler;
  - integration: `auth-credential-changes.test.ts` covers AC-6 to AC-10;
  - `fallback-sends-once.integration.test.ts` and `email-jobs-concurrency.integration.test.ts`
    gain the two jobs (AC-11).
- [ ] ADR-0099, promoted from D-02, plus its registry row; the next free number moves to
      ADR-0100; the ADR count moves to 99.
- [ ] Docs, after review:
  - `docs/reference/configuration.md` (two rows, the worker's list, and the count of 74 → 76 in
    `CLAUDE.md`);
  - `.env.example`;
  - `docs/reference/database-schema.md` (the new table; its stale "27 applied" header);
  - `.claude/rules/security.md` (rate limits);
  - `frontend-handoff.md`.
- [ ] Notion "FE and BE messages" record, with the owner's OK at handover: the frontend needs a
      settings UI and a page at `FRONTEND_EMAIL_CHANGE_URL`.

## Discovered

- [x] Found while planning Phase 1: a `ValidationError` named no field → in scope, Phase 1, as
      D-08 (`ValidationError` takes `{ field }`; the field is named as the auth routes name a body
      field, `currentPassword`, as register names `passwordConfirmation`)
- [x] Found while planning Phase 1: only `changePassword` takes the counter's 429 → in scope,
      Phase 1 (the checklist line that named `updateProfile` too was wrong)
- [x] Found in Phase 1's review: parallel wrong guesses all read the same count, so up to 50 were
      judged → in scope, Phase 1: attempts are reserved before they are judged (D-04 amended,
      `makeAttemptCounter().reserve`), with a test firing 10 at once
- [x] Found in Phase 1's review: the login lockout has the same check-then-count gap → out of
      scope, predates the kit; noted in D-04 and ADR-0098 for #349's race-condition control
- [x] Found in Phase 1: `auth.test.ts` updated a profile with an `email`, which is now refused →
      in scope, Phase 1 (the test sends only the profile fields)

## Acceptance

- [x] AC-1 to AC-5: verified by `auth-credential-changes.test.ts` and the unit tests (PR 1)
- [ ] AC-6 to AC-14: verified by `auth-credential-changes.test.ts`, the two email-job suites,
      `zodEnv.production-guard.test.ts` and `docs:openapi:check` (PR 2)

## Gates (per PR)

- [ ] typecheck · lint · format · unit · integration · build · OpenAPI
- [ ] image smoke: PR 2 (worker inputs, migration)
- [ ] security delta: only if a dependency changes
- [ ] review: the `security-reviewer` agent on the diff, then fixes, then docs
