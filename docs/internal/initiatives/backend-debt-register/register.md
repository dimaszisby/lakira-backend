# Backend debt register

**As of:** 2026-10-13, backend `dev` at `dd65318`. Ranked by [D-01](decisions.md).

**"What's next" is the first row below whose state is `ready`.** A row above it that is waiting on
someone is reported with it, as a gap. How rows are added and closed:
`.claude/rules/workflow.md` § What's next.

Columns. **Sev** is what the source recorded; `a / b` means the todo and a grader disagree, and the
higher ranks the row; `—` means ungraded. **Owed to** is who is waiting: `GOLD` (a clean audit
verdict), `FE` (lakira-frontend), `fork` (someone forking the template), `us`. **State** is `ready`,
`owner` (waiting on the owner's decision), `FE` (waiting on the frontend) or `unexplained`.

Sources are abbreviated: `A12 § 6` is `docs/internal/audits/saas-readiness/audit-2026-10-12.md`
§ 6; `A10`, `A05b`, `A05`, `A03`, `A0929` are the runs of those dates in the same folder; `N1` and
`N2` are Part 1 and Part 2 of the Notion page "FE and BE messages"; a bare filename is under
`docs/internal/todos/`. An `F-NN` after an item is the same item's row in lakira-frontend's
register (`docs/internal/initiatives/frontend-debt-register/register.md`, read 2026-10-13).

## Tier 1 — keeps an audit caveat open

No open row. B-01 is fixed (see Closed). **A dated audit run is owed**: only a run
can close C5 (ADR-002, ADR-012).

## Tier 2 — P1 or P2 owed to the frontend

| ID   | Item                                                                                               | Sev | Owed to | State       | Size | Source                                                                                       | Analysis                                           |
| ---- | -------------------------------------------------------------------------------------------------- | --- | ------- | ----------- | ---- | -------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| B-02 | Relative ranges leave out today; lifecycle timestamps are shifted; the fallback drops a log (F-10) | P2  | FE      | ready (Q-1) | ≤1d  | N1; [todo](../../todos/2026-10-13-todo-analytics-relative-range-and-lifecycle-timestamps.md) | [analysis](analysis-analytics-relative-range.md)   |
| B-03 | Staging's `CORS_ORIGIN` is unreported; the frontend's origins are not set per environment (F-02)   | P2  | FE      | owner, FE   | ≤1h  | N1                                                                                           | [analysis](analysis-decisions-owed-to-frontend.md) |
| B-04 | The production API URL is undecided (F-11)                                                         | P2  | FE      | owner       | —    | N1; `docs/reference/ci-pipeline/pipeline-overview.md:159`                                    | [analysis](analysis-decisions-owed-to-frontend.md) |
| B-05 | The browser's IP is lost through the frontend proxy, so proxied users share per-IP budgets (F-03)  | P2  | FE, us  | owner, FE   | ≤½d  | N2; [todo](../../todos/2026-10-02-todo-per-ip-limiter-hardening.md); ADR-0053                | [analysis](analysis-client-ip-and-trust-proxy.md)  |

B-02 is ready to build on the reading that today should be included. Q-1 in the plan is the
owner's confirmation of that reading.

## Tier 3 — P2 security

No open row. B-07 is fixed (see Closed).

## Tier 4 — other P2

| ID   | Item                                                                                    | Sev     | Owed to | State       | Size      | Source                                                                                        | Analysis                                               |
| ---- | --------------------------------------------------------------------------------------- | ------- | ------- | ----------- | --------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| B-08 | Bootstrap leaves `.env.test` on another login when `DB_USER` is not the template's (W3) | P2      | fork    | ready       | ≤½d       | A12 § 6 W3; [todo](../../todos/2026-10-12-todo-fork-bootstrap-review-leftovers.md) item 2     | [analysis](analysis-w3-t3-fork-bootstrap.md)           |
| B-09 | `--name lakira-x` is renamed twice (T3)                                                 | P3 / P2 | fork    | ready       | with B-08 | A12 § 4.3 T3; same todo, item 11                                                              | [analysis](analysis-w3-t3-fork-bootstrap.md)           |
| B-10 | Five domain repository interfaces import a type from the application layer (R11)        | P3 / P2 | us      | ready       | ≤½d       | A12 § 4.3 R11; [todo](../../todos/2026-09-20-todo-unify-auth-persistence-transaction-type.md) | [analysis](analysis-r11-domain-imports-application.md) |
| B-11 | Intermittent `Parse Error: Expected HTTP/` in the integration suite (R4)                | P2      | us      | unexplained | ?         | A0929 § 6 R4; [todo](../../todos/2026-09-25-todo-integration-parse-error-flake.md)            |                                                        |

## Tier 5 — P3 and ungraded

Analysed, because the frontend is party to them or a grader found them twice:

| ID   | Item                                                                                               | Sev | Owed to | State | Size | Source                                                                                                  | Analysis                                           |
| ---- | -------------------------------------------------------------------------------------------------- | --- | ------- | ----- | ---- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| B-12 | The `guest` refusal reads the separate fields; the connection uses `RABBITMQ_URL` (W4)             | P3  | us      | ready | ≤1h  | A12 § 6 W4, § 4.5 (ADR-0036)                                                                            | [analysis](analysis-w4-rabbitmq-guest-url.md)      |
| B-13 | `Set-Cookie` on four auth endpoints and the 304 on two analytics routes are not in the spec (F-15) | P3  | FE      | ready | ≤½d  | N2; [todo](../../todos/2026-09-20-todo-document-set-cookie-responses.md)                                | [analysis](analysis-set-cookie-and-304-in-spec.md) |
| B-14 | Any `x-request-id` a client sends is accepted unchecked (F-14)                                     | —   | us, FE  | ready | ≤1h  | A05b § 6 (carried from 2026-06-05); lakira-frontend `2026-10-04-todo-backend-request-id-unvalidated.md` | [analysis](analysis-x-request-id.md)               |
| B-15 | No shared pre-production smoke sequence is written down (F-16)                                     | P3  | FE      | ready | ≤1h  | N1                                                                                                      | [analysis](analysis-decisions-owed-to-frontend.md) |

Listed, not analysed ([D-03](decisions.md)). Security and privacy:

| ID   | Item                                                                                                                  | Sev | State           | Source                                                              |
| ---- | --------------------------------------------------------------------------------------------------------------------- | --- | --------------- | ------------------------------------------------------------------- |
| B-16 | Scrubber gaps in free text and URL values; no hook for logs (W5)                                                      | P3  | ready           | A12 § 6 W5; `2026-10-10-todo-sentry-scrubber-review-leftovers.md`   |
| B-18 | Per-IP limiters: IPv6 keyed per address, hop count unchecked                                                          | P3  | ready           | `2026-10-02-todo-per-ip-limiter-hardening.md`; see B-05             |
| B-19 | Two limiter store keys hold an email address                                                                          | P3  | ready           | `2026-10-05-todo-limiter-keys-hold-email-address.md`                |
| B-20 | Two log lines still carry row data or request text                                                                    | P3  | ready           | `2026-10-05-todo-log-lines-that-carry-row-or-body-text.md` (Partly) |
| B-21 | `NODE_ENV=Production` and three defaults; other startup and config leftovers                                          | P3  | ready           | `2026-10-10-todo-startup-and-config-review-leftovers.md`            |
| B-22 | Security polish: redirect built from `Host`; staging shows provider errors; no limiter on verify-email (S13)          | P3  | ready           | A03 § 6 S13                                                         |
| B-23 | Organization routers apply the user limiter before auth, so it keys by IP (R10)                                       | P3  | ready           | A0929 § 6 R10                                                       |
| B-24 | Two concurrent invites for one email and organization can both succeed                                                | —   | ready           | `2026-09-30-todo-pending-invite-uniqueness.md`                      |
| B-25 | `npm audit` findings left after the `proxy-addr` fix                                                                  | —   | ready           | `2026-10-06-todo-npm-audit-findings-october.md`                     |
| B-26 | The `esbuild` override crosses `tsx`'s declared range                                                                 | —   | kept on purpose | `2026-09-29-todo-esbuild-override-crosses-tsx-range.md`             |
| B-27 | Smaller items of the last run: `/health` returns the release; the 429 documents no `Retry-After`; env nits (W7, part) | P3  | ready           | A12 § 6 W7                                                          |

Architecture and code:

| ID   | Item                                                                                                                                                          | Sev | State                  | Source                                                               |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ---------------------- | -------------------------------------------------------------------- |
| B-28 | Boundary-rule gaps: `*.ts` only, name match and denylist, exemptions wider than stated (W6)                                                                   | P3  | ready                  | A12 § 6 W6; `2026-10-11-todo-apperror-lint-rule-review-leftovers.md` |
| B-29 | The feature-boundary rule stops at `src/features/` (T8, first half)                                                                                           | —   | ready                  | `2026-09-22-todo-feature-boundary-rule-scope.md`; A05 § 6 T8         |
| B-30 | The application layer speaks HTTP: `AppError` in 36 `application/` files (R7)                                                                                 | P3  | ready                  | A0929 § 6 R7; A12 § 4.3                                              |
| B-31 | The metric controller builds the analytics feature for the trends endpoint                                                                                    | —   | ready                  | `2026-09-24-todo-metric-trends-uses-analytics-composition-root.md`   |
| B-32 | Built features reach routers through module state, not injection                                                                                              | —   | ready                  | `2026-09-24-todo-inject-features-into-router-factories.md`           |
| B-33 | Architecture polish: unused request DTO types, a shape declared three times (T6)                                                                              | P3  | ready                  | A05 § 6 T6                                                           |
| B-34 | Architecture polish: the metric-log controller's fallback builds an unwired feature (S15)                                                                     | P3  | ready                  | A03 § 6 S15                                                          |
| B-35 | Smaller items of 2026-10-10: a 4xx `AppError` logged at error level with a stack, and others (V6)                                                             | P3  | ready                  | A10 § 6 V6                                                           |
| B-36 | Logger polish (U3)                                                                                                                                            | P3  | ready                  | A05b § 6 U3                                                          |
| B-37 | No lint rule for floating promises                                                                                                                            | P3  | ready                  | `2026-10-02-todo-no-floating-promises-lint.md`                       |
| B-38 | Shutdown has no overall bound and no re-entry guard                                                                                                           | P3  | ready                  | `2026-10-02-todo-shutdown-hardening.md`                              |
| B-39 | Transactional email is not durable                                                                                                                            | P3  | ready                  | `2026-10-02-todo-durable-email-delivery.md`                          |
| B-40 | Queue design: idempotency key, retry queue, unvalidated payload (R8)                                                                                          | P3  | ready                  | A0929 § 6 R8                                                         |
| B-41 | No cleanup of `processed_messages`                                                                                                                            | —   | deliberately not built | `2026-09-15-todo-processed-messages-cleanup.md`                      |
| B-42 | A migration's `down` re-adds foreign keys without `NOT VALID` (R9)                                                                                            | P3  | ready                  | A0929 § 6 R9                                                         |
| B-64 | `src/utils/token-generator.ts` is a second signing path with a fixed seven-day expiry and no pinned algorithm; only `scripts/seed-contract-tests.ts` calls it | —   | ready                  | [B-07's analysis](analysis-w2-jwt-secret.md) § 7                     |

API and data:

| ID   | Item                                                                                            | Sev | State            | Source                                                              |
| ---- | ----------------------------------------------------------------------------------------------- | --- | ---------------- | ------------------------------------------------------------------- |
| B-43 | A dashboard point with a real average of zero is returned as null                               | P3  | ready            | `2026-10-08-todo-dashboard-series-drops-zero-average.md`            |
| B-44 | `GET /metric-settings` treats `includeTotal=false` as true                                      | P3  | ready            | `2026-10-01-todo-metric-settings-include-total-coercion.md`         |
| B-45 | The single-log cache key omits the metric id (T5)                                               | P3  | ready            | A05 § 6 T5                                                          |
| B-46 | Cache keys: free text is not encoded; metric-log keys use literal `.js` placeholders (S12, R13) | P3  | ready            | A03 § 6 S12; `2026-10-01-todo-metric-log-cache-key-js-artifacts.md` |
| B-47 | Contract polish: probes not in the spec, `status` not an enum, 413 and 415 undocumented (S14)   | P3  | ready            | A03 § 6 S14                                                         |
| B-48 | The four Schemathesis gate warnings                                                             | —   | owner            | `2026-09-01-todo-schemathesis-gate-warnings.md`                     |
| B-49 | `last_log_at` can name a different log inside a repeated daylight-saving hour (T4)              | P3  | closes with B-02 | A05 § 6 T4                                                          |

Forkability, tests, docs and repo:

| ID   | Item                                                                                                                                                                                                                                                                               | Sev | State       | Source                                                                 |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ----------- | ---------------------------------------------------------------------- |
| B-50 | Bootstrap leftovers other than B-08 and B-09 (W7, part)                                                                                                                                                                                                                            | P3  | ready       | `2026-10-12-todo-fork-bootstrap-review-leftovers.md` items 1, 3 to 10  |
| B-51 | Bootstrap and `app-name.ts` derive the short name differently (U4)                                                                                                                                                                                                                 | P3  | ready       | `2026-09-24-todo-app-name-short-name-mismatch.md`; A05b § 6 U4         |
| B-52 | What the review of the `APP_NAME` default left open                                                                                                                                                                                                                                | P3  | ready       | `2026-10-07-todo-app-name-review-leftovers.md`                         |
| B-53 | Fork residue: fixed Compose container and volume names, links into `docs/internal/` (R12)                                                                                                                                                                                          | P3  | ready       | A0929 § 6 R12                                                          |
| B-54 | Intermittent 401 on register inside the queue integration test                                                                                                                                                                                                                     | —   | unexplained | `2026-09-24-todo-queue-test-intermittent-401.md`                       |
| B-55 | One unexplained failure of `metric-settings.test.ts` on 2026-10-11, not seen since                                                                                                                                                                                                 | —   | unexplained | `production-readiness` kit, PR #156 body; no todo                      |
| B-56 | Nothing checks `docs/reference/commands.md` against `package.json`                                                                                                                                                                                                                 | —   | ready       | `2026-09-24-todo-commands-doc-drift-check.md`                          |
| B-57 | `main` shares no history with `dev` or `staging`                                                                                                                                                                                                                                   | —   | owner       | `2026-09-24-todo-main-dev-unrelated-history.md`                        |
| B-58 | The jwt kit's folder uses underscores                                                                                                                                                                                                                                              | —   | ready       | `2026-09-19-todo-jwt-kit-underscore-naming.md`                         |
| B-59 | Follow-ups of 2026-06-04, never triaged                                                                                                                                                                                                                                            | —   | owner       | `2026-06-04-todo-saas-audit-and-workflow-followups.md`                 |
| B-60 | Nothing checks this register against the todo folder                                                                                                                                                                                                                               | —   | ready       | this kit, plan § Risks                                                 |
| B-61 | Rows of the 2026-06-05 run not re-read since; polish of 2026-09-29 (R13, rest)                                                                                                                                                                                                     | P3  | ready       | `audit-2026-06-05.md`; A0929 § 6 R13                                   |
| B-62 | Sentry: `event.server_name` can embed an address; a throwing hook lets the SDK send its own event unscrubbed; span attributes are a denylist                                                                                                                                       | P3  | ready       | `log-redaction-coverage` D-13, "From the review"                       |
| B-63 | Left by the review of B-06: `Cache-Control: no-store` on the probes; `x-forwarded-proto` is read whatever `trust proxy` says; the probes sit behind the production redirect; docs assets count against the app-wide limit; no automated test of the real app with rate limiting on | P3  | ready       | `production-readiness` D-04, "From the review"; ADR-0061 § Enforcement |

## Waiting on the owner, not code

| ID   | Question                                                                                    | Source                      |
| ---- | ------------------------------------------------------------------------------------------- | --------------------------- |
| O-01 | Are relative ranges meant to cover complete days only? (decides B-02)                       | N1; plan Q-1                |
| O-02 | Is the effort and model matrix settled? Its trial ended 2026-07-02 with no recorded outcome | `CLAUDE.md` § Task Defaults |
| O-03 | What does staging's `CORS_ORIGIN` hold? Only the Render dashboard shows it (B-03)           | N1                          |
| O-04 | Where is the frontend hosted, and does that host set `X-Forwarded-For`? (B-05)              | N2                          |

## The frontend's to raise, noted here so they are not lost

| Note                                                                           | Source (lakira-frontend, at `1edb13c`)                                  |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| `@sentry/node` 11 replaces `sendDefaultPii` with categories that default to on | `docs/internal/todos/2026-10-04-todo-backend-request-id-unvalidated.md` |

The third unraised note is B-14. A fourth, a second value in the same minute refused with a 409,
was settled on the frontend's side by lakira-frontend #88.

## Closed

Rows move here when their fix is written, with the branch; the PR number is added once merged.

| ID   | Item                                                             | Fixed in                                                                                                                                                             | Confirmed by an audit                                      |
| ---- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| B-01 | A Sentry transaction carries the request's peer address (C5, W1) | #160 (`ebfce52`); [`log-redaction-coverage` D-13](../log-redaction-coverage/decisions.md)                                                                            | Not yet; a run is owed                                     |
| B-06 | The probes run after the body parsers, ahead of the limiter      | #161 (`dd65318`); [ADR-0061](../../../explanation/decisions/adr-0061-a-request-is-counted-before-its-body-is-parsed.md)                                              | Not graded by an audit; the PR's reviewer graded it closed |
| B-07 | `JWT_SECRET` is accepted at any length, in production too (W2)   | `fix/jwt-secret-minimum-length`; [`jwt-secret-minimum-length` D-01](../jwt-secret-minimum-length/decisions.md); ADR-0036 amended                                     | Not yet; a run is owed                                     |
| B-17 | `verify()` pins no `algorithms`, `iss` or `aud`                  | `fix/jwt-secret-minimum-length`, which pins HS256 on sign and verify; `iss` and `aud` are deliberately not added ([D-02](../jwt-secret-minimum-length/decisions.md)) | Not graded by an audit                                     |
