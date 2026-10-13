# `JWT_SECRET` minimum length — Decisions Log

`D-NN` entries scoped to this kit. Register rows are those of
`docs/internal/initiatives/backend-debt-register/register.md`.

---

## D-01 — `JWT_SECRET` needs 32 characters and may not be the template's placeholder, in production and staging

- **Status:** Accepted
- **Date:** 2026-10-13

**Context.** `JWT_SECRET` is validated as `z.string().min(1)` (`src/config/zodEnv.ts:31`). Tokens
are signed with HS256, where the secret's strength is the signature's, so whoever can guess the
secret can mint an access token for any user and organization. The audit of 2026-10-12 started the
server in production mode with `JWT_SECRET=a` (W2). The placeholder in `.env.example`,
`replace-with-a-long-random-secret`, is accepted too, and this repository is public. Written
before any code.

**Decision.** When `NODE_ENV` is `production` or `staging`, startup refuses a `JWT_SECRET` shorter
than 32 characters, and refuses the placeholder by a rule of its own. Both sit in the
`superRefine` block of ADR-0036, above its production-only return, beside the ADR-0049 check that
already covers staging. The messages name the variable, the rule and `NODE_ENV`, never the value.
`development` and `test` keep accepting any non-empty value. Length is counted in characters, as
`String.length` counts them: the rule has to be one a deployer can check by eye.

The placeholder needs its own rule because it is 33 characters long and passes the length check.
The analysis recommended refusing it as an addition; it is what makes the length rule mean
anything for a copied `.env.example`.

**Options considered.**

- _A minimum in every environment._ Rejected. It breaks three values the repository itself uses:
  `replace-with-test-secret` (`.env.test.example:6`), `security-delta-ci-placeholder`
  (`.github/workflows/backend-ci.yml:82`, a file a hook stops this session from editing), and the
  placeholder a fresh clone runs on in development until bootstrap rotates it.
- _Production only_, as most of ADR-0036 is. Rejected by the owner on 2026-10-13: staging is
  reachable from the internet and holds real accounts, so a forged token is a breach there too.
- _Measure entropy_, to refuse `aaaa…`. Rejected: more code, and a threshold no error message
  can explain to the person reading it at a failed deploy.
- _Refuse anything beginning `replace-with-`._ Not taken. The one other such value in the
  repository is 24 characters and falls to the length rule; a prefix rule would be a guess about
  strings nobody has written.

**Consequences.** A deployed staging or production service whose secret is short, or is the
placeholder, refuses to start on its next deploy. That is the point, and the owner checks the
length before promoting; replacing a secret logs every user out once, since issued access tokens
stop verifying. The image smoke runs in production mode, so its secret is lengthened in the same
change. The length of the Actions secret `JWT_SECRET_TEST` cannot be read, so every test that
loads the schema under production or staging sets its own secret.

Recorded in the registry as an amendment to
**[ADR-0036](../../../explanation/decisions/adr-0036-refuse-production-unsafe-env-switches.md)**
(two table rows and a note dated 2026-10-13), not as a new record: ADR-0036 is the refused set,
and its table has taken dated rows twice before.

## D-02 — HS256 is pinned where a token is signed and where it is verified

- **Status:** Accepted
- **Date:** 2026-10-13

**Context.** `jwt.verify(token, this.secret)`
(`src/features/shared/auth/infrastructure/providers/JwtTokenProvider.ts:22`) names no algorithm,
and `jwt.sign` takes the library's default (register row B-17). With a string secret,
`jsonwebtoken` 9 accepts any of HS256, HS384 and HS512 on verify. Written before any code.

**Decision.** `sign` passes `algorithm: "HS256"` and `verify` passes `algorithms: ["HS256"]`. What
the service issues and what it accepts are then stated in the code, not inherited from a default.

**Options considered.**

- _Pin on verify only._ Rejected: a later change of the library's default for `sign` would issue
  tokens the service itself refuses, and nothing in this file would show why.
- _Add `iss` and `aud`._ Rejected for now. There is one issuer and one audience; adding the
  claims refuses every token in flight at the moment of deploy, for no boundary that exists yet.

**Consequences.** No token issued today stops verifying: they are all HS256. A move to another
algorithm becomes a visible two-line change.

## D-03 — B-12 is not in this PR

- **Status:** Accepted
- **Date:** 2026-10-13

**Context.** Register row B-12, the RabbitMQ `guest` refusal that reads the separate fields while
the connection uses `RABBITMQ_URL`, edits the same `superRefine` block and amends the same ADR.
Its analysis says it could ride with B-07.

**Decision.** It gets its own PR, next. Agreed with the owner on 2026-10-13.

**Options considered.** _Bundle it._ Rejected for three reasons. It changes another subsystem: it
reorders URL normalisation ahead of the refusals and removes the `guest` schema defaults. Neither
of its wrong outcomes has been run, only read from the code. And this change can stop a staging
deploy; if it has to be reverted, the revert should not take a broker change with it.

**Consequences.** ADR-0036 is amended twice, by two PRs, each with one dated note.
