# One pending invite per organization and email — Checklist

Lean kit: the acceptance criteria are stated here, not in a plan. Cut from `origin/dev` at
`8af8465` (#179).

## Acceptance criteria

- **AC-1** — Two concurrent `POST /organizations/:id/invites` for one email give one 201 and one
  409 with the existing message; one row is stored and one email sent.
  _Why:_ the race in register row B-24.
- **AC-2** — Re-inviting after the earlier invite expired gives 201, and the expired row is gone.
  _Why:_ that works today, and the owner chose to keep it by deleting the expired row (D-01).
- **AC-3** — A live pending invite still gives 409 on a second invite; an accepted invite does not
  block a new one. _Why:_ behaviour today.
- **AC-4** — The migration deletes expired unaccepted rows and builds the index; with two live
  invites colliding it throws, naming a count and no address, and leaves the table unchanged;
  `down` drops the index. _Why:_ the owner's choice (D-01); an address is personal data.
- **AC-5** — Comparison ignores case: `A@x.com` and `a@x.com` collide. _Why:_ the use case
  lowercases, but the index must hold whatever writes the row.

## Phase 0 — kit and branch

- [x] `fix/pending-invite-uniqueness` cut with `--no-track` from `origin/dev` at `8af8465`; HEAD
      and upstream verified
- [x] This kit: README, checklist, `decisions.md` with D-01, written before any code

## Phase 1 — tests first

- [x] `__tests__/unit/features/auth/application/InviteUserToOrganization.test.ts` — the expired
      invite is deleted before `save`; a 409 from `save` propagates and sends no email
- [x] `__tests__/integration/api/organization-membership.test.ts` — AC-1, AC-2, AC-3, AC-5

## Phase 2 — the index

- [x] `src/migrations/20261018000001-unique-pending-invite-per-email.cjs` — deletes expired
      unaccepted rows, refuses live duplicates, creates `uq_organization_invites_pending_email`;
      `down` drops it
- [x] `OrganizationInviteRepository` and `OrganizationInviteRepositorySequelize` —
      `deleteExpiredPendingByEmailAndOrg`; `save` maps the index's violation to the 409
- [x] `InviteUserToOrganization` — deletes the expired invite before the pending check;
      `PENDING_INVITE_EXISTS_MESSAGE` shared with the repository

## Phase 3 — documents, after review

- [x] D-01 promoted to ADR-0064
- [x] `docs/reference/database-schema.md` — the index on `organization_invites`
- [x] The todo Closed, with a Resolution section
- [x] Register: B-24 to Closed, naming this branch; "As of"; the README's top ready row
- [x] Loose ends from #179: `register-rate-limiter` D-06 and D-07 Accepted; the B-23 and B-68
      Closed rows name #179

## Discovered

- [x] Found: the expired delete matched `email` exactly, so an expired row stored in another case
      would survive and block a re-invite under the case-insensitive index → in scope; it compares
      `lower(email)`
- [x] Found: `npm run typecheck` checks migrations, and no migration had read a query result →
      in scope; the new one reads its counts with `QueryTypes.SELECT` and JSDoc casts
- [x] Found: a hook refuses edits to any file in `src/migrations/`, new ones included, so one
      query in the new migration keeps an indentation off by two spaces → left; cosmetic
- [x] Found: `CLAUDE.md` counted 63 ADRs → in scope; 64

## Gates

- [x] typecheck
- [x] lint
- [x] format
- [x] tests (`db:migrate:test` first)
- [x] build
- [x] OpenAPI
- [x] migration `up`, `down`, `up` against the dev database, and the refusal case

## Review

Run on Node 24.21.0 at `8af8465` plus this change.

- typecheck, lint, format, build: pass.
- tests: unit 1222 passed; integration 249 passed, 5 skipped. Before the change, four of the five
  new integration tests failed; the concurrent pair answered 201 twice. AC-3 passed before, as a
  guard on behaviour that already held.
- OpenAPI check: no drift.
- Migration against the local dev database: `up`, `down`, `up` clean (the first `up` deleted 2
  expired invites). With two live invites for one email in mixed case, `up` refused with
  `1 ... pair(s)`, and the 4 seeded rows and no index remained. With the duplicate removed by hand,
  `up` deleted the expired row and built the index, which then refused a mixed-case insert. Seed
  rows removed.
- security delta: skipped, no dependency changed. image smoke: skipped, the image is unchanged.
