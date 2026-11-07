# List the caller's organizations — Checklist

## Phase 0 — Kit and branch

- [x] `feat/list-user-organizations` cut with `--no-track` from `dev` at `93c7fa6`
- [x] This kit: README, plan, checklist, `decisions.md` with D-01..D-03

## Phase 1 — Domain and application

- [x] `OrganizationRepository.findByIds(ids)` declared, and implemented in
      `OrganizationRepositorySequelize` with an empty-array short-circuit
- [x] `src/features/shared/auth/application/queries/ListUserOrganizations.ts` — active-only,
      `joinedAt` order, skips memberships whose organization is missing, sets `isCurrent`
- [x] `__tests__/unit/features/auth/application/ListUserOrganizations.test.ts` — active-only
      filter, missing-organization skip, `isCurrent` mapping, and an empty list when there are no
      memberships (the query passes `[]` through; the repository short-circuits it). Proven to
      fail with the `isActive()` filter removed
- [x] `feature.ts` wires `listUserOrganizations`; the `jest.Mocked<OrganizationRepository>` doubles
      in `InviteUserToOrganization.test.ts` and `RegisterUser.test.ts` gain `findByIds`

## Phase 2 — HTTP and contract

- [x] `organization.controller.ts` — `listMyOrganizations`
- [x] `organization.router.ts` — `GET /` behind `userRateLimiter` and `authMiddleware`, plus a 405
      guard for other methods
- [x] `openapi-schemas.ts` — `UserOrganization`, `UserOrganizationListResponse`;
      `openapi-docs.ts` — `GET /organizations` (200, 401, 500); spec regenerated
- [x] `__tests__/integration/api/organization-membership.test.ts` — `GET /api/v1/organizations`:
      one organization, two after an accepted invite, `isCurrent` after switch-org, removed member,
      401, 405. Proven to fail (3 tests) with a wrong `currentOrganizationId`. These are also the
      first integration tests to exercise `POST /auth/switch-org`

## Phase 3 — Docs

- [x] `docs/reference/api/README.md` — operation count, the `Organizations` tag count, and the
      fuzz-exclusion statement corrected (see Discovered)
- [x] `docs/explanation/product-requirements.md` — the Organizations row and the operation count
- [x] `docs/reference/frontend-handoff.md` — `GET /api/v1/organizations` feeds `/switch-org`
- [x] ADR-0047, its registry row, and the next free number (ADR-0048)

## Discovered

- [x] Found: the plan expected the contract gate to fuzz the new route (38/47). It selected 37/47:
      `run-local.js` fuzzes only the tags in `DEFAULT_TAGS`, and `Organizations` has never been in
      it (tag list 2026-01-14, organization routes 2026-05-17). → out of scope, filed as
      `docs/internal/todos/2026-09-25-todo-fuzz-organization-routes.md`. The route is covered by
      unit, integration and end-to-end checks.
- [x] Found: `docs/reference/api/README.md` said one documented route is excluded from fuzzing; three
      tags are (`Admin` 1, `Organizations` 6, `Dummy Data` 3) → in scope, corrected in Phase 3.
- [x] Found: one full run failed `metric-category.test.ts` in the shared `TRUNCATE` setup, with an
      empty database error; 3 further full runs passed → out of scope, recorded in
      `docs/internal/todos/2026-09-25-todo-integration-parse-error-flake.md`.
- [x] Found: with `NODE_ENV=development` the console email log prints only the subject line, not
      the body, so an invite token cannot be read from a dev server's log. This reproduces the
      frontend's separate "read emailed tokens outside production" request. → out of scope; that
      request is its own handoff record. The end-to-end check seeded memberships in SQL instead.
- [x] Found: the `/organizations/{id}/members` OpenAPI text says "active memberships" while the
      query returns every row → not filed. Every row is active today, so the text is true; ADR-0047
      records when that would change.

## Acceptance

- [x] AC-1 — verified by the integration test for a one-organization user and the removed-member test
- [x] AC-2 — verified by the integration test for an accepted invite
- [x] AC-3 — verified by review of the route (no parameters) and the removed-member test
- [x] AC-4 — verified by the 401 integration test
- [x] AC-5 — verified by the switch-org integration test and the unit test
- [x] AC-6 — verified by the OpenAPI gate: the regenerated spec validates (47 operations, 339
      `$ref`s, 50 schemas) and is deterministic; the drift diff is exactly the new path until the
      spec is committed
- [x] AC-7 — ADR-0047 in the registry

## Gates

- [x] typecheck
- [x] lint
- [x] format
- [x] tests — unit 607/607; integration 202 passed, 5 skipped (3 consecutive full runs; one earlier run hit the flake in Discovered)
- [x] build
- [x] OpenAPI — see AC-6
- [x] contract gate (`contract:local:gate`) — exit 0, seed 42, 37/47 selected, 1370 generated / 1370
      passed, the 2 known warnings. The new operation is not selected; see Discovered
- [ ] security delta — skipped: no dependency changes

## End-to-end check

Against a real server (`tsx src/server.ts` on Node 24, Compose Postgres and Redis). User M had
three memberships: its own organization, `admin` in A's (seeded active), and C's (seeded
`invited`). `GET /organizations` returned 2 items, M's own with `isCurrent: true`, and omitted C's.
After `switch-org` to A's organization, `isCurrent` moved to A's. `switch-org` to C's returned 403.
A's own list was unaffected (1 item). Unauthenticated: 401.
