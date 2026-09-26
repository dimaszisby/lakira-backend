# ADR-0047 — The caller's organizations are a collection route, `GET /organizations`, scoped by the token

- **Status:** Accepted
- **Date:** 2026-09-25
- **Related:** [ADR-0030](./adr-0030-membership-role-replaces-users-role.md) (roles),
  [ADR-0043](./adr-0043-session-issuance-at-every-authenticated-entry-point.md) (`switch-org` issues
  a session), [ADR-0045](./adr-0045-feature-modules-construct-nothing-on-import.md) (lazy feature
  construction the new handler follows)
- **Origin:** `D-01`..`D-03` in the list-user-organizations kit —
  [`list-user-organizations`](../../internal/initiatives/list-user-organizations/decisions.md)

---

## Context

`POST /auth/switch-org` needs an organization id, and nothing in the API told a client which
organizations the caller belongs to. The spec had `/organizations/{id}/members` and
`/organizations/{id}/invites` but no collection route, and the `User` schema returned by
`GET /auth/profile` carried no memberships. lakira-frontend's organization switcher was blocked on
this. It asked for either a collection route or memberships on the profile.

A membership's `status` is `active`, `invited` or `removed`, and `SwitchOrganization` accepts only
`active`. The current organization is carried only inside the access token.

## Decision

1. **`GET /api/v1/organizations` returns the caller's organizations.** It is authenticated, behind
   the user rate limiter, and takes no parameters. The user id comes only from the verified token,
   so it cannot list another user's organizations.
2. **Only active memberships, oldest first, unpaginated.** Every listed id is one `switch-org`
   accepts. Soft-deleted organizations are excluded.
3. **Each item carries `isCurrent`**, true for the organization the presented token is scoped to.
   Items are `{ organizationId, name, slug, role, joinedAt, isCurrent }`, in the standard success
   envelope under `data.organizations`.

## Options considered

- **Memberships on `GET /auth/profile`.** Rejected: it changes a response the frontend already types
  and caches, and mixes the user resource with tenancy. A switcher refresh would refetch the
  whole profile.
- **Return every membership status and let the client filter.** Rejected: the switcher would offer
  ids that `switch-org` refuses with 403.
- **Paginate.** Rejected for now: a user belongs to a handful of organizations, and `/members` is
  unpaginated for the same reason. Adding it later is additive.
- **No `isCurrent`; clients decode the JWT.** Rejected: it would make the token's payload part of
  the API contract.

## Consequences

- The response depends on the presented token as well as the user, because of `isCurrent`. A
  client cache must not survive a `switch-org` without refetching, and the frontend's cache keys are
  already organization-scoped.
- Today the `active` filter is defensive: removing a member deletes the row, and no code creates
  `invited` rows. It starts to matter if either changes.
- `OrganizationRepository` gained `findByIds`, which future batch reads can reuse.
- The spec has 47 operations. `switch-org` now has integration coverage, which it lacked, through
  the tests for this route.

## Links

- Kit: [`docs/internal/initiatives/list-user-organizations/`](../../internal/initiatives/list-user-organizations/README.md)
- Query: `src/features/shared/auth/application/queries/ListUserOrganizations.ts`
