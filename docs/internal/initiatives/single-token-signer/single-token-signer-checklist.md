# One way to sign a token — Checklist

Lean kit: the acceptance criteria are stated here. Checked against `origin/dev` at `2330901` (#209).

## Acceptance criteria

- **AC-1** — No file under `src/` or `scripts/` calls `jwt.sign` except `JwtTokenProvider`.
  _Why:_ B-64, one signing path.
- **AC-2** — The seeded token's header says `alg: HS256`; `JwtTokenProvider.verify` accepts it as
  the seeded user in the seeded organization; it expires 7 days after it was issued. _Why:_ B-64;
  the contract run depends on it (D-02).
- **AC-3** — `src/utils/token-generator.ts` and its unit test are gone, and nothing references
  them. _Why:_ B-64.
- **AC-4** — Every gate passes, and the OpenAPI spec is unchanged. _Why:_ no contract change.

## Phase 0 — kit and branch

- [x] `refactor/single-token-signer` cut with `--no-track` from `origin/dev` at `2330901`; HEAD
      and upstream verified
- [x] This kit: README, this file, `decisions.md` with D-01 and D-02
- [x] #209's loose ends: `logger-polish` D-01 to D-03 Accepted, README Done; the register's B-36
      Closed row names `#209 (2330901)`; "As of" `2330901`
- [x] Register: B-42's state `owner`, its item naming the immutable-migration rule, and question
      O-05

## Phase 1 — a guard first

- [x] `architecture.test.ts` › one way to sign a token › imports jsonwebtoken only in
      JwtTokenProvider: failed on `dev`, naming `src/utils/token-generator.ts` (AC-1). Stricter
      than `jwt.sign`: verifying elsewhere would also skip the pinned algorithm

## Phase 2 — the change

- [x] `scripts/seed-contract-tests.ts` signs with `JwtTokenProvider` and `SEED_TOKEN_TTL`, passing
      `username` (D-01, D-02)
- [x] `src/utils/token-generator.ts` and `__tests__/unit/utils/token-generator.test.ts` deleted

## Phase 3 — gates, review, docs

- [x] AC-2 run: `migrate:test` then `seed:contract-tests` against throwaway Postgres 18. Both
      tokens decode to `alg: HS256` and `exp - iat = 604800`, with the seeded id, username and
      organization; `JwtTokenProvider.verify` accepts the primary one under `.env.test`'s secret
- [x] Review of the diff: no defect. Lint allows the seed's import of the provider, so the
      fallback the plan named (an export from `public.ts`, or an exemption) was not needed
- [x] Register: B-64 to Closed, naming the branch. Removing its row narrowed one five-row table,
      which prettier re-padded
- [x] Notion Part 2: none

## Discovered

None.

## Acceptance

- [x] AC-1 — `architecture.test.ts` › one way to sign a token
- [x] AC-2 — the seed run above
- [x] AC-3 — a search for `token-generator` and `tokenGenerator` in `src`, `scripts`,
      `__tests__`, `tests`, `.github` and `package.json` finds nothing
- [x] AC-4 — the gates below

## Gates

Node 24.22.0; integration against throwaway Postgres 18 and Redis 7, migrated with `migrate:test`.

- [x] typecheck — clean (`scripts/**/*.ts` is in its scope)
- [x] lint — clean
- [x] format — `prettier --check` on every touched file: clean
- [x] tests — `test:unit:coverage` 149 suites, 1540 tests passed, thresholds met;
      `test:integration:coverage` 43 suites passed (2 skipped), 303 tests passed (6 skipped),
      thresholds met
- [x] build — clean
- [x] OpenAPI — `docs:openapi:check` clean
- [ ] security delta — skipped: no dependency change
- [ ] image smoke — skipped: no `Dockerfile`, `.dockerignore` or dependency change
