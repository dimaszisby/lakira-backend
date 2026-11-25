# Credential changes — Plan

- **Status:** Approved (2026-11-24)
- **Appetite:** 5 days — past that, cut what remains into its own issue rather than extend
- **Date:** 2026-11-24

The plan as approved in plan mode, kept as written, apart from its checklist, which is
[`credential-changes-checklist.md`](credential-changes-checklist.md). What changes while it runs
is in [decisions.md](decisions.md) and the checklist's Discovered section.

## Context and goals

Finding Y7 of the dated run of 2026-11-14 (#299). `PUT /api/v1/auth/profile` changes `email` and
`password` with nothing but an access token.

- **Today's code:** the request needs no current password (`schema.zod.ts:28-33`,
  `UpdateProfile.ts`), and `AuthUser.changeEmail` leaves `emailVerifiedAt` set
  (`AuthUser.ts:53-58`).
- **The attack:** one leaked 15-minute access token can move the account to another address and
  take over recovery. Script injected into the frontend can do it even though it cannot read the
  token, by riding the session through the proxy.
- **Since #308:** a password change also signs the owner out everywhere.
- **Also found:** a verification link stores only the user id, so a link sent to an old address
  can verify a new one.

Y6 and Y7 are why the run says NOT FORK-READY (ADR-001 criterion 3, category 1 at 67%).

Owner's choices, 2026-11-24, aiming for the long-term design with the friendliest experience:

- **D1.** Credential changes get their own routes, and each asks for the current password. The
  password check lives in one place, so a "confirm once" step can replace it later; OAuth is a
  listed deferral.
- **D2.** An email change stays pending until the new address confirms it. The old address is
  notified.
- **D3.** ADR-0018 stands, and nothing is gated on verification here. #311 already asks for
  inviting to need a verified address.
- **Add-ons:**
  - a wrong current password answers 400, never 401;
  - an own guess counter, not the login lockout;
  - an unchanged value is refused;
  - a password change spends reset links;
  - a confirmed email change revokes verification and reset links;
  - a "your password was changed" email;
  - a new URL setting with a production check;
  - a confirmation link spent once, even under races.
- **Separate issues:**
  - an undo link in the old-address notice;
  - the reset-token race (LOW-1 of #308's review).
- **Not done:** ending sessions on an email change.

**Size: standard kit.** `docs/internal/initiatives/credential-changes/`: README, plan,
checklist, decisions. Appetite about 5 days.

**Two PRs, two branches.** Both are cut with `--no-track` from `origin/dev`, and the README names
both:

- `fix/309-credential-changes`: the kit, then Phase 1.
- `fix/309-credential-changes-email`: Phase 2.

Neither says `Closes #309`. The issue says a dated run must confirm, so both say `Refs #309`.

**Model:** Opus at high effort, with no implementation subagents. Review uses the
`security-reviewer` agent; #232, the effort and model matrix, is still the owner's open question.

**ADRs, promoted from `decisions.md` in the PR that implements each:**

- ADR-0098, "Credential changes have their own routes and ask for the current password" (D-01, PR 1).
- ADR-0099, "An email change waits for the new address to confirm it" (D-02, PR 2).

## Acceptance criteria

### Phase 1: the split and the password route

- **AC-1.** `PUT /auth/profile` with `email` or `password` answers 400, and the message names the
  route to use. `username` and `isPublicProfile` change as before.
  _Why:_ Y7. Zod drops unknown keys, so without this refusal a removed field would answer 200 and
  change nothing.
- **AC-2.** `POST /auth/change-password { currentPassword, password, passwordConfirmation }`:
  - a wrong current password answers 400 on `body.currentPassword`, never 401;
  - a right one answers 200 with ADR-0097's behaviour: other sessions end, and this one gets a new
    cookie.
    _Why:_ Y7. The frontend proxy reads 401 as a dead session and signs the user out.
- **AC-3.** A new password equal to the current one answers 400, and so does a mismatched
  confirmation.
  _Why:_ a plain answer instead of a silent no-op.
- **AC-4.** After 5 wrong current passwords within 15 minutes for one user, both credential routes
  answer 429 with `Retry-After` until the window passes. Login is unaffected. The counter's key
  holds the user id, never an address.
  _Why:_ a script riding the session cannot grind guesses, and a typo in settings never blocks
  signing in (ADR-0032 for the key).
- **AC-5.** A password change marks the user's unused reset tokens used, in its transaction.
  _Why:_ a reset link sent before the change must not undo it (LOW-2 of #308's review).

### Phase 2: the pending email change

- **AC-6.** `POST /auth/change-email { currentPassword, email }` answers as follows, and the
  account's email does not change on any of them:
  - a wrong password: 400, counted as in AC-4;
  - the same address: 400;
  - an address in use: 409;
  - otherwise 202.
    _Why:_ Y7, and a typo cannot break recovery.
- **AC-7.** A 202 sends two emails:
  - to the new address: a confirmation link;
  - to the old address: a notice naming the new address masked (`n•••@example.com`).
    Neither carries text the user chose beyond the address itself.
    _Why:_ the owner's alarm, and #311's lesson about free text in mail.
- **AC-8.** `POST /auth/confirm-email-change { token }` needs no session.
  - With a valid token:
    - the email changes;
    - `emailVerifiedAt` is set;
    - the user's unused verification and reset tokens are revoked;
    - the token is spent.
  - An unknown, used or expired token answers a generic 400.
  - Two confirmations racing each other change the email once.
  - An address taken in the meantime answers 409, and nothing changes.
    _Why:_ clicking proves control of the new address; leftover links went to the old one.
- **AC-9.** A new request replaces a pending one, and the earlier link stops working.
  _Why:_ a typo is fixed by asking again.
- **AC-10.** A password change or a reset sends "your password was changed" to the account's
  address.
  _Why:_ the owner's alarm if someone else did it.
- **AC-11.** Each new job's message carries ids only. With the queue off, or after a failed
  publish, each email is sent once, under the ADR-0080 rule.
  _Why:_ the queue rules in `architecture.md`; covered by the fallback-sends-once and concurrency
  suites.
- **AC-12.** Change-email requests have a per-user limiter of their own, and the confirm route
  goes through the verify-email route's per-IP limiter.
  _Why:_ an account must not mail arbitrary addresses 50 times per 15 minutes (the #311 vector),
  and tokens must not be guessable.
- **AC-13.** `FRONTEND_EMAIL_CHANGE_URL` is read like the other three link settings. Production
  refuses its localhost default at startup; staging warns.
  _Why:_ the unrefused-default gap noted on 2026-11-23, without breaking a staging deploy that
  has not set it.
- **AC-14.** The spec documents the three new routes and `PUT /auth/profile`'s narrower body, and
  `docs:openapi:check` passes.
  _Why:_ a downstream repository generates its types from the spec.

## Open questions

None open. The two-PR split, the two ADRs and the job design are settled below as D-01 to D-07.
Any fork found while building is logged as a new `D-NN` the moment it is decided.

## Out of scope

- **Gating any route on a verified email.** That is #311 (D-03), and ADR-0018 stands.
- **An undo link** in the old-address notice: a new issue (§ Issues).
- **The reset-token race** (LOW-1): its own issue.
- **The three existing `FRONTEND_*_URL` settings' localhost defaults:** still unfiled. Refusing
  them could break a staging deploy that leaves them unset.
- **Ending sessions on an email change**, and a "confirm once" step for later sensitive actions.
- **The frontend's settings UI and confirmation page.** They are lakira-frontend's work, flagged
  through Notion.

## Decisions expected

All settled at approval and written Accepted in [decisions.md](decisions.md); kept here as approved.

- **D-01. Credential changes have their own routes and ask for the current password.**
  - The routes are `POST /auth/change-password` and `POST /auth/change-email`.
  - `PUT /auth/profile` keeps `username` and `isPublicProfile`.
  - The proof is a `currentPassword` field, checked by one application-layer step
    (`ConfirmCurrentPassword`) that both use cases call.
  - Rejected: `currentPassword` on `PUT /auth/profile`, and step-up by recent login (session
    riding passes it). → ADR-0098, in PR 1.
- **D-02. An email change is pending until the new address confirms it; the old address is told.**
  - The new address and the old one are stored on the request row, so a notice reaches the old
    address even after a confirmation, and a later undo can restore it.
  - Rejected: change at once and mark unverified (a typo breaks recovery; it would also clear
    "verified" and block #311's gate). → ADR-0099, in PR 2.
- **D-03. ADR-0018 stands; #309's gating expectation moves to #311.** The owner chose this
  2026-11-24, and a comment on #309 records it.
- **D-04. The guess counter is per user and separate from the login lockout.**
  - It uses the lockout's numbers (5 attempts, 15 minutes) under its own prefix
    (`auth:credential-attempts:<userId>`).
  - `loginLockout.ts` today hard-codes its key, threshold and message for email, so it becomes a
    small factory, `makeAttemptCounter({ prefix, keyOf, threshold, ttlSeconds, message })`, over
    the same `LockoutRedisClient`. Login's own counter is built from it, its behaviour unchanged.
  - It fails open when Redis is down, as the login lockout does.
  - Rejected: sharing the login lockout, where a typo in settings would block signing in.
- **D-05. Two new jobs.**
  - `AUTH_SEND_EMAIL_CHANGE_EMAIL` follows the reset pattern (ADR-0069). The message carries the
    request's id. The job mints the token, stores its hash, and sends to the new address. The
    fallback runs in the request.
  - `AUTH_SEND_ACCOUNT_NOTICE` follows the verification pattern (ADR-0067). The message carries
    `{ userId, notice, requestId? }`, where `notice` is `email_change_requested` or
    `password_changed`. The fallback runs after the response.
  - Rejected: one job sending both emails, where a retry would mint a second link and kill the
    first.
- **D-06. Limits.**
  - The change-email request limiter is keyed by user (`RATE_LIMIT_EMAIL_CHANGE_USER_MAX`) and
    runs after `authMiddleware`.
  - The confirm route reuses the verify-email per-IP limiter, because it submits an emailed token,
    as `/verify-email` does.
- **D-07. `FRONTEND_EMAIL_CHANGE_URL`:** production refuses the localhost default; staging warns
  (ADR-0036's staging exception pattern).

## Phases

### Phase 0: the kit and the issues (on `fix/309-credential-changes`)

1. Write the kit: README, plan, checklist and decisions (D-01 to D-07, Accepted).
2. File the two issues and comment on #309 (§ Issues).
3. **STOP:** the owner approves the kit.

### Phase 1: the split and change-password (PR 1)

- **Use case:** `ChangePassword`. It calls `ConfirmCurrentPassword`, then reuses #308's
  transaction: revoke, save, issue. It also calls `PasswordResetTokenRepository.invalidateAllForUser`.
- **`UpdateProfile`:** loses `password` and `email`.
- **Router, schema and controller:** `changePasswordBody`, and the refusing refinement on
  `updateUserBody`.
- **Counter:** `CredentialAttempts`, built on the lockout, wired in `feature.ts`.
- **Spec, tests, ADR-0098, and docs** (security rules, frontend handoff, requirements, C4).

### Phase 2: the pending email change (PR 2)

- **Storage:** migration `email_change_tokens`, plus the model, entity, mapper and repository.
  The token is stored only as a hash, is single use, and holds `new_email`, `old_email` and the
  expiry. Spending it is conditional (`WHERE used_at IS NULL`).
- **Use cases:**
  - `RequestEmailChange`: validate, supersede any pending request, create the row, publish the
    two jobs.
  - `ConfirmEmailChange`: in one transaction, spend the token conditionally, re-check the
    address, set the email and `emailVerifiedAt`, revoke verification and reset tokens.
  - Two jobs: their handlers, worker consumers, `QUEUES`/`ROUTING_KEYS`, topology and
    `WORK_QUEUES`.
- **Email templates:** the confirmation, the old-address notice, and "password changed". The
  last is also wired into `ChangePassword` and `ResetPassword`.
- **Limiter and env vars:** the request limiter, `FRONTEND_EMAIL_CHANGE_URL` with its production
  refusal, and `RATE_LIMIT_EMAIL_CHANGE_USER_MAX`.
  - Update `docs/reference/configuration.md` (the count moves 74 → 76, including its worker list)
    and `.env.example`.
  - Update `c4-containers.md`'s queue count.
- **Spec, tests (unit, integration, fallback-sends-once, concurrency), ADR-0099, docs,** and the
  Notion BE-to-FE record (with the owner's OK at handover).

## Risks and trade-offs

- **More surface.** Three routes, two jobs, one table and two env vars, for the friendliest
  long-term flow.
- **Timing.** The next dated run waits about 3 days longer than the quick path would.
- **No email changes between the PRs.** Between PR 1 and PR 2, email changes are unavailable.
  No client uses them today.
- **Late delivery in a race.** The old-address notice can arrive after the change is confirmed.
  It reads `old_email` from the row, so it still reaches the right place.

## Rollback

- **Migration:** `down` drops `email_change_tokens`, verified in PR 2. No existing table changes.
- **Code:** revert-safe. Pending rows are simply unused after a revert.
- **Deploy:** production needs `FRONTEND_EMAIL_CHANGE_URL` set before PR 2 reaches it, or the
  startup check stops it.

## Security and data

The change touches a trust boundary (credential changes) and personal data (addresses).

- Addresses never appear in logs: name a person by user id, and an address by `hashEmail`.
- Job messages carry ids only.
- Tokens are stored as hashes only (ADR-0008).
- Templates escape HTML and carry no user-chosen text beyond the address.

## Observability

Each line carries ids only:

- `auth.credentials.password_changed`
- `auth.email_change.requested`
- `auth.email_change.confirmed`
- `auth.credentials.attempts_exceeded` at warn
- the existing `auth.sessions.revoked`

## Issues (filed on approval; approving the plan was the owner's confirmation)

- **New, bug: "One reset token can be spent twice by racing requests."** Labels `tier:5`,
  `sev:P3`, `state:ready`. LOW-1 only, from `.git/ISSUE_DRAFT-reset-token-lifecycle.md`, trimmed:
  LOW-2 moves into AC-5.
- **New, task: "An email change can be undone from the old address for a few days."** Labels
  `tier:5`, `state:deferred` until #309's PR 2 merges. It builds on D-02's stored `old_email`:
  an undo token in the notice, restoring the old address and ending every session.
- **Comment on #309:** link the kit, and say the gating expectation moved to #311 under ADR-0018
  (D-03).

Not in this plan, still waiting on the owner: moving #308 to `state:deferred`, and the issue for
the three existing `FRONTEND_*_URL` defaults.

## Verification

- **Phase 0:** `grep -r 'NEEDS CLARIFICATION'` on the kit finds nothing. The issues exist with
  their labels. `npm run format:check` passes on the kit files.
- **Phases 1 and 2:** every gate by name.
  - Always: typecheck, lint, format, unit, integration and build.
  - OpenAPI, because routes and schemas change.
  - Image smoke, because PR 2 changes worker inputs and adds a migration.
  - Security delta is skipped unless a dependency changes.
- **Integration suites:** a new `auth-credential-changes.test.ts` covers AC-1 to AC-10 against
  the real stack, with a capturing email sender. The fallback-sends-once and concurrency suites
  gain the two jobs.
- **Review:** the `security-reviewer` agent on each PR's diff, before docs.

## References

- Issue #309; `docs/internal/audits/saas-readiness/audit-2026-11-14.md` § 6, Y7 (#299)
- [ADR-0097](../../../explanation/decisions/adr-0097-a-password-reset-or-change-ends-every-other-session.md) — what a password change does to sessions
- [ADR-0018](../../../explanation/decisions/adr-0018-verification-middleware-not-applied-to-existing-routes.md) — no route gated on verification
- ADR-0067, ADR-0069, ADR-0080 — the email job patterns D-05 follows
- Issue #311 — inviting needs a verified address
