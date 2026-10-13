# `JWT_SECRET` minimum length — Checklist

Lean kit: the acceptance criteria are stated here, not in a plan. Cut from `origin/dev` at
`dd65318` (#161).

## Phase 0 — kit and branch

- [x] `fix/jwt-secret-minimum-length` cut with `--no-track` from `origin/dev` at `dd65318`; HEAD
      and upstream verified
- [x] This kit: README, checklist, `decisions.md` with D-01 to D-03, written before any code

## Phase 1 — the refusal

- [x] `src/config/zodEnv.ts` — `JWT_SECRET_MIN_LENGTH` and `JWT_SECRET_TEMPLATE_PLACEHOLDER`; two
      refusals in the `superRefine` block above its production-only return, for `production` and
      `staging`; line 31 keeps `min(1)`
- [x] `__tests__/unit/config/zodEnv.production-guard.test.ts` — a long `JWT_SECRET` in
      `PRODUCTION_BASE` and in the staging mailpit case; the new cases of AC-1 to AC-4
- [x] `scripts/image-smoke.sh` — a `JWT_SECRET` of at least 32 characters
- [x] `.env.example` — a comment above `JWT_SECRET` stating the rule; the value unchanged, since
      `scripts/bootstrap-fork.sh` matches on it

## Phase 2 — the algorithm

- [x] `src/features/shared/auth/infrastructure/providers/JwtTokenProvider.ts` —
      `algorithm: "HS256"` on `sign`, `algorithms: ["HS256"]` on `verify`
- [x] `__tests__/unit/features/auth/infrastructure/providers/JwtTokenProvider.test.ts` — the
      cases of AC-7

## Phase 3 — documents, after review

- [x] ADR-0036 — two table rows and a note, dated 2026-10-13
- [x] `docs/reference/configuration.md`, `.claude/rules/environment.md`,
      `docs/tutorials/getting-started.md`, `docs/tutorials/fork-and-rebrand.md`
- [x] Register: B-07 and B-17 to Closed, naming this branch; the W2 todo marked Fixed; a row for
      `src/utils/token-generator.ts`
- [x] Loose ends from #161: ADR-0061 to Accepted in its file, the registry's README and
      `production-readiness` D-04; Closed row B-06 and its todo name #161; the register's "As of"
      line; the frontend's F ids on rows B-02, B-03, B-04, B-05, B-13, B-14 and B-15

## Discovered

- [x] Found: the placeholder is 33 characters, so the length rule alone accepts it → in scope;
      it has a rule of its own (D-01, AC-2)
- [x] Found: two guard cases that must resolve, the staging mailpit case and every
      `PRODUCTION_BASE` case, took the ambient secret → in scope, each sets its own (AC-5)
- [x] Found: `src/utils/token-generator.ts` signs outside the provider → out of scope, register
      row B-64
- [x] Found: `docs/reference/environments.md` tells a deployer to set staging's secret → in
      scope, it now states the length

## Review

Run on Node 24.21.0 at `dd65318` plus this change.

- typecheck, lint, format, build: pass.
- tests: unit 1028 passed (1012 before, 16 new); integration 230 passed, 5 skipped.
- OpenAPI check: no drift, 47 operations valid.
- image smoke: 7 of 7. security delta: skipped, no dependency changed.
- AC-5: `JWT_SECRET=short npm run test:unit`, 1028 passed.
- Built server, `NODE_ENV` `production` and `staging`: a one-character secret, a 31-character
  secret and the placeholder each exit 1 with a `JWT_SECRET` issue, and the 31-character value and
  the placeholder appear nowhere in the output. A 64-character secret passes validation and
  reaches Redis; the start then stops at this machine's Postgres, which speaks no SSL. The full
  production start is the image smoke's check 5.
- `NODE_ENV=development` with the placeholder: starts, as before.
- Not checked: the length of the deployed secrets and of the Actions secrets. They cannot be read
  from here; the PR body gives the owner the check.

## Acceptance

- [x] **AC-1** — With `NODE_ENV` `production` or `staging`, a `JWT_SECRET` shorter than 32
      characters fails validation with an issue whose path is `JWT_SECRET`; 31 characters is
      refused and 32 accepted. _Why:_ W2.
- [x] **AC-2** — With `NODE_ENV` `production` or `staging`, the template's placeholder is refused
      by its own rule. _Why:_ it is 33 characters and passes AC-1; a copied `.env.example` is the
      realistic failure.
- [x] **AC-3** — Neither message nor the `[ENV_ERROR]` line contains the secret's value. _Why:_
      C6: a startup error never prints a secret.
- [x] **AC-4** — `NODE_ENV` `test` and `development` accept a short secret and the placeholder.
      _Why:_ the suite, CI's placeholder and a fresh clone must keep working.
- [x] **AC-5** — The unit suite passes with a short ambient `JWT_SECRET`. _Why:_ the length of
      the Actions secret `JWT_SECRET_TEST` cannot be read, and no test may depend on it.
- [x] **AC-6** — The image smoke passes 7 of 7. _Why:_ its container runs `NODE_ENV=production`.
- [x] **AC-7** — `verify()` rejects a token signed with the right secret under HS384 and an
      unsigned `alg: none` token; `sign()` produces an HS256 header. _Why:_ B-17.
- [x] **AC-8** — ADR-0036's table, `docs/reference/configuration.md` and
      `.claude/rules/environment.md` state the new refusal. _Why:_ the refused set is documented
      there.

## Gates

- [x] typecheck
- [x] lint
- [x] format
- [x] tests
- [x] build
- [x] OpenAPI — no route or schema is touched; run to prove no drift
- [ ] security delta — skipped: no dependency changes
- [x] image smoke — `scripts/image-smoke.sh` changes
