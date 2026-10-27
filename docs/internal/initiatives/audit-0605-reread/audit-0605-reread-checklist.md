# The 2026-06-05 run, re-read; the rest of R13 — Checklist

Lean kit: the acceptance criteria are stated here. Read against `origin/dev` at `e6f7d4b` (#228).

## Acceptance criteria

- **AC-1** — `package.json` declares no `body-parser`; the production tree is otherwise identical,
  and the request path is unchanged. _Why:_ R13's last open item (D-01).
- **AC-2** — Each of the run's 20 findings has a row below with a state and evidence a reader can
  follow. _Why:_ B-61 (D-02).
- **AC-3** — Each finding that is Open has a todo and a register row, and
  `debt-register-todos.test.ts` passes. _Why:_ the register is where "what's next" is read (D-02).
- **AC-4** — `audit-2026-06-05.md` does not change. _Why:_ a dated run is a record.

**Out of scope.** Fixing any finding left Open; re-reading the other dated runs.

## R13, the rest

`audit-2026-09-29.md:186`, four items:

| Item                              | Now        | Evidence                                                                                   |
| --------------------------------- | ---------- | ------------------------------------------------------------------------------------------ |
| `".js"` as cache sentinels        | Fixed      | none left; `metric-log/infrastructure/http/cache-keys.ts:18` describes the old ones (#195) |
| `CLAUDE.md` says 45 ADRs          | Fixed      | it says 83, the count in the registry (#226)                                               |
| `body-parser` declared and unused | Fixed here | D-01                                                                                       |
| CI runs both test projects twice  | Fixed      | each runs once, in parallel, behind one gate (ADR-0081)                                    |

## The re-read

`audit-2026-06-05.md` § 4.4 and § 6. "Then" is the run's grade.

| Finding                                                        | Then | Now          | Evidence                                                                                                                                                                           |
| -------------------------------------------------------------- | ---- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N1 — visualization cache keys scoped by user, not organization | P0   | Fixed        | `VisualizationCacheRedis.ts:57-81` puts `organizationId` in the prefix and the hash (`f5f28b9`, 2026-08-23)                                                                        |
| N2 — the invalidation port takes no organization               | P0   | Fixed        | `VisualizationInvalidationPort.ts:2-6` takes `(userId, organizationId, metricId)` (`f5f28b9`)                                                                                      |
| N3 — cache-key organization scoping not structural             | P1   | Fixed        | `buildCursorCacheKey` takes `organizationId` as a required string (`shared/cache/keys.ts:49-69`); `architecture.test.ts:143` "cache keys are tenant-scoped" (`f5f28b9`, `b45c4f3`) |
| N4 — no request id over the queue                              | P1   | Fixed        | the publisher sets it from the request's context (`RabbitMQPublisher.ts:101`), the consumer runs the job in it (`RabbitMQConsumer.ts:112`); B-84, #203                             |
| N5 — two dummy routes missing from the spec                    | P1   | Fixed        | `/metrics/dummy` and `/metric-categories/dummy` are in the spec (`8adf7b8`)                                                                                                        |
| F1 — `DISABLE_RATE_LIMITING` allowed in production             | P1   | Fixed        | refused at startup in production and staging (`zodEnv.ts:577`; ADR-0036, `f5f28b9`)                                                                                                |
| N6 — one queue for every organization, no budget               | P2   | Open         | [todo](../../todos/2026-10-27-todo-one-queue-for-every-organization.md), B-97, waits on the owner                                                                                  |
| N7 — no tracing or metrics beyond Sentry                       | P2   | Open         | [todo](../../todos/2026-10-27-todo-opentelemetry-not-adopted.md), B-96; ADR-0038 still Proposed                                                                                    |
| N8 — pool is the default, not tunable                          | P2   | Open         | [todo](../../todos/2026-10-27-todo-database-pool-not-tunable.md), B-94; `db.ts` sets no `pool`                                                                                     |
| N9 — one Redis client for everything                           | P2   | Open         | [todo](../../todos/2026-10-27-todo-one-redis-client-for-everything.md), B-95; still one client, though a `SCAN` page does not block other commands                                 |
| N10 — stats aggregated in JS                                   | P2   | Fixed        | `AVG`, `MIN`, `MAX`, `COUNT` in SQL (`MetricLogStatsRepoSequelize.ts:55-58`; #202)                                                                                                 |
| N11 — a redundant join in `listLogs`                           | P2   | Not a defect | the join also filters owner and soft delete (D-04)                                                                                                                                 |
| F2 — `SENTRY_DSN` not masked                                   | P2   | Fixed        | `dsn` is a suffix term of the sensitive-key pattern (`sensitive-keys.ts:22`; #105)                                                                                                 |
| F3 — RabbitMQ `guest` defaults in production                   | P2   | Fixed        | refused at startup when RabbitMQ is on (`zodEnv.ts:641-663`; `f5f28b9`, and by URL in #167)                                                                                        |
| F4 — stats over an unbounded range, reduced in JS              | P2   | Fixed        | one SQL aggregate over a half-open range (#202, ADR-0079)                                                                                                                          |
| F5 — settings repository trusts the caller on ownership        | P2   | Not a defect | the use case checks ownership through `MetricAccessPort` (D-03)                                                                                                                    |
| F6 — CORS origins not normalized                               | P3   | Open         | [todo](../../todos/2026-10-27-todo-cors-origins-not-normalized.md), B-98                                                                                                           |
| F7 — refresh cookie `SameSite=Strict`                          | P3   | Not a defect | recorded in ADR-0019 (D-05)                                                                                                                                                        |
| `x-request-id` taken unchecked                                 | P3   | Fixed        | 1 to 64 characters of `[A-Za-z0-9._-]`, else a new id (B-14, #169)                                                                                                                 |
| `SENTRY_TRACES_SAMPLE_RATE` not clamped                        | P3   | Open         | [todo](../../todos/2026-10-27-todo-sentry-sample-rate-not-clamped.md), B-99                                                                                                        |

Eleven fixed, three not defects, six open: the run's 20 (R13 counted apart).

## Work

- [x] Branch `chore/audit-0605-reread` cut with `--no-track` from `origin/dev` at
      `e6f7d4b`; HEAD and upstream verified
- [x] #228's loose ends: `backend-debt-register` D-11 Accepted; B-60 names `#228 (e6f7d4b)`; "As
      of" `e6f7d4b`
- [x] `npm uninstall body-parser`; the 896 lockfile entries keep version and integrity, and the
      production tree holds the same 261 packages (D-01)
- [x] The re-read above, each row checked in the code at `e6f7d4b`
- [x] Six todos dated 2026-10-27, and register rows B-94 to B-99, placed by the register's D-01
- [x] B-61 to Closed

## Discovered

- [x] Found: N9's "blocking SCAN" overstates it; each page is its own round trip → the todo says
      so and asks for a measurement first
- [x] Found: F7 needs no owner's question, as the plan expected for a deliberate choice, since
      ADR-0019 records it → D-05

## Acceptance

- [x] AC-1 — `npm ls --omit=dev --all` holds the same package set; `npm ls body-parser` shows only
      Express's copy; the integration suite's body-parser cases pass
- [x] AC-2 — the table above
- [x] AC-3 — `debt-register-todos.test.ts` passes with the six todos and rows
- [x] AC-4 — `git diff` shows no change under `docs/internal/audits/`

## Gates

Node 24.22.1.

- [x] typecheck, lint, format — clean
- [x] tests — unit with coverage, 160 suites, 1703 tests; integration with coverage, 43 suites (2
      skipped), 316 tests (6 skipped), the body-parser client-error suite among them
- [x] build — clean
- [x] security delta — 0 critical, 0 high, 0 blocking; `npm audit --omit=dev` the 2 accepted
      moderates
- [x] image smoke — all seven checks
- [x] OpenAPI — not run: no route or schema change
