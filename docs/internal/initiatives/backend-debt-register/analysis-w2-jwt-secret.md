# B-07 — `JWT_SECRET` is accepted at any length

Register row [B-07](register.md), with B-17. Read at `bf72b58`.

## 1. What is wrong

`JWT_SECRET` is validated as `z.string().min(1)` (`src/config/zodEnv.ts:31`). Tokens are signed
with it using the library's default, HS256
(`src/features/shared/auth/infrastructure/providers/JwtTokenProvider.ts:17`), where the secret's
strength is the signature's. Reproduced in the audit of 2026-10-12: a production start with
`JWT_SECRET=a` passes environment validation.

The template's placeholder, `replace-with-a-long-random-secret` (`.env.example:25`), is accepted
too. A deployment that copies `.env.example` and skips the bootstrap script signs its tokens with
a string printed in a public repository, and anyone can mint an access token for any user id and
organization.

## 2. Root cause

The schema checks presence only. ADR-0036's production refusals cover switches that weaken the
service; a weak secret was never on that list.

## 3. Options

- **A. A minimum length for every environment** (32 characters). Simple. Breaks three values the
  repo itself uses: `replace-with-test-secret` (`.env.test.example:6`, 24 characters),
  `smoke-only-not-a-secret` (`scripts/image-smoke.sh:49`, 23 characters, and that container runs
  with `NODE_ENV=production`), and `security-delta-ci-placeholder`
  (`.github/workflows/backend-ci.yml:82`, 29 characters).
- **B. A minimum length in production and staging only.** Leaves tests alone. Still breaks the
  image smoke, which runs in production mode on purpose.
- **C. B, plus refuse the template's placeholder in production.** Catches the copied
  `.env.example`, which is the realistic failure.
- **D. Measure entropy.** Rejects `aaaaaaaa…`. More code, and a threshold nobody can explain in an
  error message.

## 4. Recommendation

**C**, at 32 characters, placed with the other ADR-0036 refusals so the error reads the same way.
Lengthen the image smoke's value in the same change. Leave the CI workflow alone if possible: it
runs under `NODE_ENV=test`, and editing a workflow file needs the owner's hand.

## 5. Acceptance criteria for the fix

- **AC-1** — A production start with a `JWT_SECRET` shorter than 32 characters exits 1 and names
  the variable and the rule, not the value. _Why:_ W2; and C6's rule that a startup error never
  prints a secret.
- **AC-2** — A production start with the template's placeholder exits 1. _Why:_ the copied
  `.env.example`.
- **AC-3** — `NODE_ENV=test` and `development` accept the existing short values. _Why:_ the suite
  and a fresh clone must keep working.
- **AC-4** — `npm run docker:smoke` passes, with its secret lengthened. _Why:_ it runs the image
  in production mode.
- **AC-5** — ADR-0036's table and `docs/reference/configuration.md` list the new refusal.
  _Why:_ the refused set is documented there and nowhere else.

## 6. Size and shape

≤½ day, most of it checking every place a short secret is set. Micro entry, and **an amendment to
ADR-0036**: the refused set is a security boundary. Gates: typecheck, lint, format, tests, build,
image smoke.

## 7. Depends on, unblocks

Depends on nothing. Deployed environments need a look first: if staging's secret is under 32
characters the deploy will refuse to start, which is the point, and the owner should know before
merging.

Related and separate, B-17: `jwt.verify(token, this.secret)`
(`JwtTokenProvider.ts:22`) pins no `algorithms`, `iss` or `aud`. With a symmetric secret and one
issuer the practical gap is small; pinning `algorithms: ["HS256"]` is one line and belongs in the
same PR.

A second signing path exists, `src/utils/token-generator.ts:18`, with a fixed seven-day expiry.
Its only callers are `scripts/seed-contract-tests.ts` and its own unit test. It is not reachable
from a request; worth deleting or moving under `scripts/` when this is touched.

## 8. Not verified

- The length of the secrets in the deployed environments and in the repository's Actions secrets
  (`JWT_SECRET_TEST`, `JWT_SECRET_PRODUCTION`). They cannot be read from the repo.
- That no test builds an environment with `NODE_ENV=production` and a short secret; the unit
  suite has to be run against the change to find out.
