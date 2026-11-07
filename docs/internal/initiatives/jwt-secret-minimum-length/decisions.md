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

## D-04 — The `guest` refusal judges the credentials the connection will use

- **Status:** Accepted (merged in #167, `61df15f`)
- **Date:** 2026-10-14

Micro entry for register row B-12 (finding W4 of `audit-2026-10-12.md`, P3), the work D-03 put
off, on `fix/rabbitmq-guest-url-refusal`. Written before any code.

**Context.** In production with `RABBITMQ_ENABLED=true`, startup refuses `guest` in
`RABBITMQ_USER` and `RABBITMQ_PASSWORD`. The connection uses `RABBITMQ_URL` as given whenever it
is set and ignores the two fields. So a URL that logs in as `guest` starts beside non-guest
fields, and a URL with real credentials is refused when the fields are unset, since they default
to `guest`. Read while planning, and not in the analysis: a URL that names no credentials also
connects as `guest`, because the client library fills them in.

**Decision.** Three points.

1. One helper in `src/config/zodEnv.ts` returns the user and password the connection will use:
   the URL's when `RABBITMQ_URL` is set, `guest` and `guest` when that URL names neither, and
   the two fields otherwise. The refusal judges what it returns. When the URL supplied a `guest`
   value the issue's path is `RABBITMQ_URL`; otherwise it is the field, as before. No message
   quotes the URL.
2. The normaliser takes the user and password from the same helper, so the two `env` fields say
   what the connection uses.
3. The `guest` schema defaults stay.

**Options considered.**

- _Run the normaliser before the refusals and remove the defaults,_ which the analysis
  recommended. Rejected. Reordering means moving every refusal out of the schema's `superRefine`
  or turning the normalisers into a schema transform, which changes how all nine refusals run to
  fix two. Removing the defaults changes the type of two `env` fields and what development gets
  with nothing set. Once the check reads the URL when there is one, the defaults cause no wrong
  outcome.
- _Check the URL as well as the fields._ Rejected: with a URL set the fields are not used, so a
  `guest` field beside a good URL would be refused for nothing.
- _Cover staging too,_ as D-01 does for the secret. Not taken here: it could stop a staging
  deploy whose broker settings cannot be read from the repository. It is the owner's call.

**Consequences.** A production deployment with the queue on and a `guest` or credential-less
`RABBITMQ_URL` refuses to start on its next deploy. One with a good URL and unset fields, refused
until now, starts. An unreadable URL is not judged by the refusal; the normaliser rejects it
straight after, naming the variable and never the value. ADR-0036 is amended a second time, as
D-03 said it would be.

**What the runs showed.** Both wrong outcomes were read from the code and never run until now.
Eight of the eleven new unit cases fail on the code at `6429fda`: a `guest` URL beside non-guest
fields was accepted, and a URL with real credentials beside `guest` fields was refused. On the
built server with `NODE_ENV=production` and the queue on, a `guest` URL and a URL with no
credentials each exit 1 with an `[ENV_ERROR]` line that names `RABBITMQ_URL` and holds no part of
the URL; a URL with real credentials passes validation, and the start then stops at this
machine's Postgres, which speaks no SSL.

**From the review,** my own. A URL that names a user and no password now gives an empty
`env.RABBITMQ_PASSWORD`, where the field's value was kept before; the client sends an empty
password in that case, so the field now says what happens. An empty password is not refused,
here or in the fields. `normalizeRedisConfig` copies the URL's password the same guarded way, and
`REDIS_PASSWORD` has no default, so it does copy; when both are set and differ the field keeps
its own value while the client uses the URL. No refusal reads it, and it is left alone. Not
graded by anyone else.
