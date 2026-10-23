# OpenAPI contract polish — Checklist

Lean kit: the acceptance criteria are stated here. Checked against `origin/dev` at `d985155` (#214).

## Acceptance criteria

- **AC-1** — `/health` and `/ready` are in the spec under `Health`, with no 429; `/ready` documents 503. _Why:_ S14 (D-01).
- **AC-2** — Every error component's `status` is an enum matching `envelopeStatus`. _Why:_ S14
  (D-02).
- **AC-3** — Every operation with a `requestBody` documents 413 and 415, and the validator fails
  on one that does not. _Why:_ S14 (D-03).
- **AC-4** — Routes and handlers are unchanged; every gate passes; the contract gate's operation
  set is unchanged. _Why:_ spec only.

## Phase 0 — kit and branch

- [x] `fix/openapi-contract-polish` cut with `--no-track` from `origin/dev` at `d985155`; HEAD and
      upstream verified
- [x] This kit: README, this file, `decisions.md` with D-01 to D-04
- [x] #214's loose ends: `metric-access-wiring` D-01 to D-03 Accepted, README Done; B-88's Closed
      row names #214; "As of" `d985155`

## Phase 1 — tests first

- [x] `__tests__/unit/lib/openapi-contract-polish.test.ts` failed on `dev`: 6 of 7 cases; the one
      that passed checks that no operation without a body has 413 or 415
- [x] `openapi-429.test.ts`: every operation but the probes, and a case that the probes have none

## Phase 2 — the changes

- [x] `openapi-config.ts`: `Health` tag, `status` enums, two components, the 404 comment
- [x] `openapi-docs.ts`: the probes, the 429 skip, the 413/415 loop
- [x] `openapi-schemas.ts`: `RateLimitError`'s `status`, the schema of a limiter's own 429 (D-02)
- [x] `scripts/validate-openapi.ts`: the `Health` exemption, the 413/415 check. A spec with the 413
      removed from `POST /auth/login` and the 429 from `GET /metrics` failed on both
- [x] Spec regenerated: 49 operations, 22 with a body

## Phase 3 — gates, review, docs

- [x] Gates, below
- [x] Review of the diff: `docs/reference/api/README.md` would have said every served route is in
      the spec; `/api/v1/docs` is not, and the sentence says so
- [x] `docs/reference/api/README.md`: coverage, the 429/413/415 rule, the `Health` row;
      `.claude/rules/api-design.md` § HTTP Status Codes
- [x] Register: B-47 to Closed
- [x] Notion Part 2: none (D-02)

## Discovered

- [x] Found: `__tests__/unit/openapi-response-headers.test.ts` › "429 responses are declared on
      every operation" counts every operation in the committed spec → in scope, it now excludes the
      probes (D-01)
- [x] Found: `RateLimitError` in `openapi-schemas.ts` typed `status` as a bare string too → in
      scope, an enum (D-02)

## Acceptance

- [x] AC-1 — `openapi-contract-polish.test.ts` › the probes; `openapi-429.test.ts` › not on the
      probes
- [x] AC-2 — `openapi-contract-polish.test.ts` › the error envelope's status, and `RateLimitError`
- [x] AC-3 — `openapi-contract-polish.test.ts` › 413 and 415; the validator run above
- [x] AC-4 — no file under `src/` changed outside `src/lib/openapi/`; the gates below

## Gates

- [x] typecheck — clean
- [x] lint — clean
- [x] format — `prettier --check` on every touched file: clean
- [x] tests — `test:unit:coverage` 150 suites, 1541 tests passed, thresholds met;
      `test:integration:coverage` 43 suites passed (2 skipped), 303 tests passed (6 skipped),
      thresholds met, against throwaway Postgres 18 and Redis 7
- [x] build — clean
- [x] OpenAPI — `docs:openapi:generate` reproduces the committed spec byte for byte, and
      `docs:openapi:validate` passes (49 operations)
- [ ] contract gate — not run locally: it migrates and seeds the database in `.env.test`, which is
      the owner's running `postgres_db`; left to CI's `contract_local` job
- [ ] security delta — skipped: no dependency change
- [ ] image smoke — skipped: no `Dockerfile`, `.dockerignore` or dependency change
