# Fuzz the organization routes — Checklist

Lean kit: the acceptance criteria are stated here. Checked against `origin/dev` at `cdc9090`.

## Acceptance criteria

- **AC-1** — `contract:local:gate` selects `GET /organizations` and
  `GET /organizations/{id}/members` and passes, with `{id}` set to the token's organization.
  _Why:_ fuzzing that only ever hits 403 tests nothing.
- **AC-2** — Every other organization operation is selected and passing, or excluded with
  `--exclude-name` and a one-line reason beside it. _Why:_ no silent gaps.
- **AC-3** — The gate passes with seed 42; the new `Selected` figure is recorded, and the two known
  warnings are unchanged or explained. _Why:_ the gate's figures are quoted as baselines.
- **AC-4** — Breaking `GET /organizations`'s response shape fails the gate (proven, then reverted).
  _Why:_ a fuzzer that cannot fail is decoration.
- **AC-5** — `docs/reference/api/README.md` states the new coverage and exclusions; the todo is
  closed. _Why:_ the reference claimed a coverage figure.

## Baseline (unchanged tree, 2026-09-29)

`contract:local:gate`: exit 0, **37/47 selected**, seed 42, 1369 generated / 1369 passed, the two
known warnings (2 authentication, 3 schema-mismatch).

## Phase 0 — Kit and branch

- [x] `test/fuzz-organization-routes` cut with `--no-track` from `dev` at `cdc9090`
- [x] This kit, with D-01

## Phase 1 — The read-only pair

- [x] `scripts/seed-contract-tests.ts` — the seed output records the primary org id
- [x] `tests/contract/hooks/seeded_ids.py` — `/organizations/{id}/members` uses the primary org
- [x] `run-local.js` — `Organizations` in `DEFAULT_TAGS`; the four write routes excluded by name
      for now
- [x] The gate passes; AC-1; AC-4 proven and reverted

## Phase 2 — The write routes, one at a time

- [x] `POST /organizations/{id}/invites` → D-02
- [x] `PATCH /memberships/{id}` → D-03
- [x] `DELETE /memberships/{id}` → D-04
- [x] `POST /invites/accept` → D-05

## Phase 3 — Docs

- [x] `docs/reference/api/README.md` — coverage and exclusions
- [x] The todo closed

## Discovered

- [x] Found at baseline: the session's Node 24 toolchain in the scratchpad had lost
      `npm/lib/cli.js` to temp cleanup, so the first baseline run failed before reaching the tests →
      not a repo issue; re-extracted from the checksum-verified tarball.

## Gate runs (seed 42)

| Run                          | Selected | Generated / passed | Result                                    |
| ---------------------------- | -------- | ------------------ | ----------------------------------------- |
| Baseline (unchanged)         | 37/47    | 1369 / 1369        | pass                                      |
| Phase 1: the read-only pair  | 39/47    | 1389 / 1389        | pass; `/members` 17x 200, no 403          |
| Response shape broken (AC-4) | 39/47    | 1390, 1 failure    | fail on `GET /organizations`, as intended |
| + invites                    | 40/47    | 1407 / 1407        | pass; 18x 201                             |
| + PATCH and DELETE           | 42/47    | 1443 / 1443        | pass; 18x 200 and 17x 200                 |
| + accept (probe, reverted)   | 43/47    | 1463 / 1463        | pass, but 19x 400 and a 4th warning       |
| Final                        | 42/47    | 1441 / 1441        | pass                                      |

Every run warned about the same auth operations (`refresh`, `reset-password`, `switch-org`,
`verify-email`). The Examples phase skips one more operation than at baseline because
`GET /organizations` has no input to take an example from; it is fuzzed in the Coverage and Fuzzing
phases.

## Gates

- [x] typecheck
- [x] lint
- [x] format
- [x] tests — unit 621/621, integration 202 passed, 5 skipped
- [x] build
- [x] contract gate — exit 0, seed 42, **42/47 selected**, 1441 generated / 1441 passed, the same
      four operations warned as at baseline
- [x] OpenAPI — no change, exit 0
- [ ] security delta — skipped: no dependency changes
