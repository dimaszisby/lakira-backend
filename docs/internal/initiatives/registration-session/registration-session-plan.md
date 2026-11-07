# Registration session — Plan

- **Status:** Done
- **Appetite:** 2 days — past that, cut the transaction wrap to its own ticket and ship the cookie
- **Date:** 2026-09-20

## Context and goals

`POST /auth/register` returns a 15-minute access token and sets no refresh cookie, so a newly
registered user is silently logged out when that token expires. `login`, `refresh` and `switchOrg`
all set one (`controller.ts:129`, `:180`, `:257`); `register` (`:69-96`) does not.

Surfaced by the `lakira-frontend` session 2026-09-17, briefed in
[`2026-09-18-todo-register-refresh-token.md`](../../todos/2026-09-18-todo-register-refresh-token.md)
and merged as #98. Neither audit campaign caught it — both predate it.

The brief left open whether this is a bug at all, or a deliberate "register → verify → log in"
stance. Resolved during planning: it is a bug. See [D-01](decisions.md).

When this lands, registration produces the same durable session as every other authenticated entry
point, and the rule is written down so the next entry point added does not repeat the omission.

## Acceptance criteria

- **AC-1** — `POST /auth/register` sets a `{APP_SHORT_NAME}_refresh` cookie with the same attributes
  `login` sets.
  _Why:_ register is the only authenticated entry point that issues no refresh token, which is the
  reported defect.
- **AC-2** — `POST /auth/refresh` presented with **only** the cookie from a register response
  returns a fresh access token.
  _Why:_ asserting the cookie exists does not prove the session survives, and survival past 15
  minutes is the actual symptom.
- **AC-3** — Refresh-token rows created by registration carry non-null `user_agent` and `ip`.
  _Why:_ ADR-0019 specified those columns for session auditing; nulls silently degrade the
  refresh-token family's forensic value.
- **AC-4** — Registration is atomic: a failure in any of user / organization / membership /
  refresh-token writes leaves none of them behind.
  _Why:_ `RegisterUser` performs three untransacted writes today; adding a fourth widens an existing
  partial-registration failure mode rather than narrowing it.
- **AC-5** — `npm run docs:openapi:check` reports no diff.
  _Why:_ no `Set-Cookie` is documented for any of the four cookie-setting endpoints, so this change
  should produce no spec drift. A diff means the no-spec-change finding behind
  [D-03](decisions.md) is wrong.
- **AC-6** — `auth-refresh.test.ts`'s `loginUser()` helper no longer registers-then-logs-in to
  obtain a cookie.
  _Why:_ that helper is the defect's existing workaround; leaving it hides the fix and the next
  reader re-derives the bug.

## Open questions

- [ ] **Q-1** — Should the new auth `TransactionPort` be adopted by the other multi-write auth use
      cases (`AcceptInvite`, `InviteUserToOrganization`), and should [D-02](decisions.md) be
      promoted to the ADR registry as a port-boundary decision? Not blocking — answerable after this
      lands.

## Out of scope

- Mounting `requireVerifiedEmail` or adding a verification config flag. **ADR-0018 stands**: the
  base deliberately gates nothing on email verification and forks wire it themselves.
- Refresh-token rotation and family revocation — working and tested.
- The undocumented 304 on both `/analytics` routes — its own PR, per [D-03](decisions.md).
- Documenting `Set-Cookie` across all four cookie-setting endpoints — filed as a follow-up todo.

## Decisions expected

All three were settled during planning and written to [`decisions.md`](decisions.md) at the moment
they were settled, not backfilled.

- **D-01** — Registration issues a full session, rather than dropping the access token.
- **D-02** — Wrap the whole use case in one transaction via a new auth `TransactionPort`.
- **D-03** — No OpenAPI change; the analytics 304 is un-batched.

D-01 is the promotion candidate for **ADR-0043** (next free — the registry holds 42 records, highest
`adr-0042`). Promote at end of task, once it is clear the decision survived implementation.

## Phases

### Phase 0 — Prove the negative

Write the AC-1/AC-2 integration test first, run it against `dev`, **watch it fail**, then implement.
A test that passes before the change is not testing the thing. This repo's recurring defect class is
gates that cannot fail.

### Phase 1 — Give auth a transaction port

Auth has no transaction abstraction. The metric feature already has the right one — copy its shape,
do not invent one:

- `src/features/public/metric/application/ports/TransactionPort.ts`
- `src/features/public/metric/infrastructure/persistence/SequelizeTransactionPort.ts`
- wired in `src/features/public/metric/feature.ts:30` as an overridable dependency

New: `src/features/shared/auth/application/ports/TransactionPort.ts` and
`src/features/shared/auth/infrastructure/persistence/SequelizeTransactionPort.ts`.

Do **not** reuse `RefreshTokenRepository.runInTransaction`
(`RefreshTokenRepositorySequelize.ts:81-87`) to span user/org/membership writes — it works, but
opening a transaction for three other aggregates through the refresh-token repository is a layering
violation.

### Phase 2 — Thread an optional transaction through three ports

`UserRepository`, `OrganizationRepository` and `MembershipRepository` take no transaction. Add an
**optional** `tx?: PersistenceTransaction` to `create()` on each; the Sequelize implementations pass
`{ transaction: tx }` to `Model.create`.

Optional is load-bearing: it keeps all fifteen existing unit-test doubles of these ports valid
without edits.

### Phase 3 — The fix

- `RegisterUser.ts` — constructor grows `IssueRefreshToken` and `TransactionPort` (mirror
  `LoginUser.ts:22-29`); wrap the four writes in `runInTransaction` using
  `issueRefreshToken.executeInTransaction` (`IssueRefreshToken.ts:47`), not `execute`; return type
  grows `rawRefreshToken`. Uniqueness pre-checks stay where they are — they are reads.
- `feature.ts:102-108` — construct with the two new dependencies (`loginUser` at `:109-115` is the
  template).
- `controller.ts:69-96` — call the existing `setRefreshCookie` helper (`:35-43`, unchanged) and
  thread `userAgent`/`ip` from `req` exactly as `login` does at `:117-118`.

### Phase 4 — Cleanup and gates

Simplify the `loginUser()` helper (AC-6); run gates.

## Risks and trade-offs

- **Optional `tx?` is a weaker guarantee than a required one.** A future caller can forget it and
  silently write outside the transaction. Accepted: requiring it would force edits to fifteen test
  doubles and every existing caller, for a guarantee the type system still would not enforce at the
  call sites that matter.
- **Touching three shared repository ports for one use case's benefit.** Contained by making the
  parameter optional and additive — no existing behaviour changes.
- **The transaction wrap is the larger half of the work.** If the appetite is blown, the cookie fix
  alone still satisfies AC-1/AC-2/AC-3; AC-4 is the separable part.

## Rollback

No migration and no deploy change. Revert-safe: no data is written that the previous version cannot
read — a refresh-token row issued at registration is indistinguishable from one issued at login.

## Security and data

This touches a trust boundary: session issuance.

- The cookie reuses the existing `setRefreshCookie` helper unchanged — `httpOnly`, `secure` in
  production/staging, `sameSite: strict`, scoped `path`. No new cookie surface.
- Registration currently hands a 15-minute access token to an unverified email address with **no
  refresh-token family**, so there is no revocation path short of expiry. Issuing a family makes
  that session revocable through the existing `RevokeRefreshTokenFamily`. This is a net improvement.
- AC-3 exists for this reason: without `user_agent`/`ip`, a registered user's session cannot be
  attributed during an incident.
- No new secrets, no new personal-data fields, no tenancy change.

## Observability

At 2am the question is "did registration half-succeed?". Today that is invisible. After Phase 2 a
failed registration rolls back wholly, so the signal is the existing error log from `catchAsync`.
Worth checking that `auth.refresh.reuse_detected` (ADR-0019 §5) does not start firing for newly
registered users — that would mean the register-issued family is being double-spent.

## Success metrics

None stated. The acceptance criteria are the check; a metric here would be a sentence written to
fill a heading.

## References

- [`2026-09-18-todo-register-refresh-token.md`](../../todos/2026-09-18-todo-register-refresh-token.md) — the brief (#98)
- [ADR-0018](../../../explanation/decisions/adr-0018-verification-middleware-not-applied-to-existing-routes.md) — verification middleware deliberately unmounted
- [ADR-0019](../../../explanation/decisions/adr-0019-refresh-token-storage-and-rotation.md) — refresh-token storage and rotation; grew `LoginUser`, never mentions register
- [`2026-08-31-todo-analytics-304-etag.md`](../../todos/2026-08-31-todo-analytics-304-etag.md) § "Left undone deliberately"
