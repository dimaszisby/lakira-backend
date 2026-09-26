# List the caller's organizations — Plan

- **Status:** Done
- **Appetite:** 1 day — past that, drop `isCurrent` (D-03) rather than extend
- **Date:** 2026-09-25

## Context and goals

lakira-frontend's organization switcher is blocked. `POST /auth/switch-org` needs an organization
id, and nothing in the API tells the frontend which organizations the caller belongs to. The
OpenAPI spec has `/organizations/{id}/members` and `/organizations/{id}/invites` but no collection
route, and the `User` schema returned by `GET /auth/profile` carries no memberships. The request is
the P1 record "List the current user's organizations" (raised 2026-08-29) in the frontend-to-backend
handoff log.

When this lands, one authenticated route returns the caller's own organizations with enough for the
switcher: id, name, slug, role, join date, and which one the current token is scoped to. It is
published in the OpenAPI spec, so the frontend's `api:spec:check` picks it up.

Checked against `origin/dev` at `93c7fa6`.

## Acceptance criteria

- **AC-1** — `GET /api/v1/organizations` with a valid token returns 200 and the caller's active
  memberships only.
  _Why:_ the frontend's ask; the switcher needs the list.
- **AC-2** — A user in two organizations gets both; a user in one gets one.
  _Why:_ the frontend's acceptance line, and the one-user-two-orgs scenario it could not verify.
- **AC-3** — No request can list another user's organizations: the route takes no user or
  organization parameter, and the user id comes only from the token.
  _Why:_ the ask's scoping rule; this is a tenancy boundary.
- **AC-4** — Unauthenticated requests get 401.
  _Why:_ the frontend's acceptance line.
- **AC-5** — `isCurrent` is true for exactly the token's organization, and moves after
  `POST /auth/switch-org`.
  _Why:_ D-03.
- **AC-6** — The route and its response schema are in the committed OpenAPI spec, and
  `npm run docs:openapi:check` passes.
  _Why:_ the frontend picks the route up from the spec.
- **AC-7** — ADR-0047 is Accepted and in the registry, and D-01..D-03 point to it.
  _Why:_ an API interface change requires an ADR.

## Open questions

None.

## Out of scope

- Pagination, filtering, and creating or renaming organizations.
- The existing `/organizations/{id}/members` OpenAPI description says "all active memberships", but
  the query returns every row. Every row is active today (removal deletes the row, and nothing
  creates `invited` rows), so the statement is true but not enforced. Filed as a todo if still
  relevant after this work.
- The emailed-tokens request, which is a separate handoff record.

## Decisions expected

- Route shape: a collection route or a field on the profile response (D-01)
- Which memberships are listed, in what order, and whether to paginate (D-02)
- Whether items mark the current organization (D-03)

## Phases

### Phase 0 — Kit and branch

Branch from `dev` at `93c7fa6`; this kit.

### Phase 1 — Domain and application

`OrganizationRepository.findByIds`, following `UserRepositorySequelize.findByIds`: an early return
on an empty array, then `Op.in`. A `ListUserOrganizations` query, following
`ListOrganizationMembers`: a batch lookup and a `Map` join, with the DTO type exported next to the
query. Wired in `feature.ts`. Unit-tested.

### Phase 2 — HTTP and contract

`listMyOrganizations` controller, `GET /` on the organization router with a 405 guard, OpenAPI
schema and path, regenerated spec, integration tests.

### Phase 3 — Docs

API reference coverage counts, product requirements, the frontend handoff reference, ADR-0047.

## Risks and trade-offs

- **The list is unpaginated.** It is fine at a handful of organizations per user. Adding paging
  later is additive (query parameters with defaults) and does not break the response shape.
- **`isCurrent` restates what the token already says.** It is kept because the alternative
  asks every client to decode the JWT, which is an implementation detail of auth.

## Rollback

Code only; no migration or data change. Reverting the merge commit removes the route. The
frontend degrades to the pre-change state (no switcher).

## Security and data

The route is a tenancy read. It reads the user id only from the verified token (`req.user.id`,
set by `authMiddleware`) and accepts no parameters, so there is no identifier to tamper with.
`authMiddleware` already rejects a token whose organization has no active membership. The route
returns only organization names and slugs the caller belongs to, plus the caller's own role.

## References

- `src/features/shared/auth/application/queries/ListOrganizationMembers.ts` — the pattern followed
- `src/features/shared/auth/application/use-cases/SwitchOrganization.ts` — the active-membership rule
- ADR-0030 (roles), ADR-0045 (lazy feature construction)
