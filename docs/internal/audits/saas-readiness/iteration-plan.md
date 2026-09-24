# SaaS-Readiness Iteration Plan

**Owner:** @dimaszisby (single-developer)
**Cadence:** Iterative; no fixed deadline. Each phase is a self-contained PR.
**Source of truth for gap IDs:** [`audit-2026-05-01.md`](./audit-2026-05-01.md).
**Source of truth for the binary fork-ready gate:** ADR-001 in [`decisions.md`](./decisions.md).

This is the master roadmap for closing the 18 ❌ + 21 ⚠️ items in the audit. Each phase below has its own kit (or extends an existing kit) under `docs/internal/initiatives/`. P2-only items are deferred and not yet scaffolded.

## Phase Index

| #   | Phase                          | Kit folder                                                                                                                               | Closes audit gaps                  | Effort | Status                                       | Gating ADR(s)                                                                      |
| --- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------ | -------------------------------------------- | ---------------------------------------------------------------------------------- |
| 0   | Cheap-P0 sweep                 | (no kit; ADR-006 in this folder)                                                                                                         | P0-6.1, P0-6.2, P0-11.1, P0-4.1    | S      | Done — #40, #49                              | —                                                                                  |
| 1   | JWT lifecycle + refresh tokens | [`../../initiatives/jwt/`](../../initiatives/jwt/)                                                                                       | P0-1.1, P1-10.3                    | L      | Done — #41                                   | ADR-001 (kit-local)                                                                |
| 2   | Observability foundations      | [`../../initiatives/observability/`](../../initiatives/observability/)                                                                   | P0-5.1, P1-5.2, P1-5.3, P1-4.3     | M      | Done — #42                                   | —                                                                                  |
| 3   | Email verification             | [`../../initiatives/email-verification/`](../../initiatives/email-verification/)                                                         | P1-1.2                             | M      | Done — #43                                   | —                                                                                  |
| 4   | Multi-tenancy foundation       | [`../../initiatives/multi-tenancy/`](../../initiatives/multi-tenancy/)                                                                   | P0-3.1, P0-9.1, P1-1.3             | L      | Done — #44–#47                               | ADR-004, promoted as ADR-0012 — Accepted 2026-09-24 (shipped in #44–#47)           |
| 5   | Architecture drift cleanup     | [`../../initiatives/feature-vertical-slice-migration/`](../../initiatives/feature-vertical-slice-migration/) (existing kit, new tracker) | P1-10.1, P1-10.2, P2-10.4, P2-10.5 | M      | Done — #48                                   | ADR-003, promoted as ADR-0011 — still Proposed; revised by ADR-0037, also Proposed |
| 6   | Forkability scaffolding        | [`../../initiatives/forkability/`](../../initiatives/forkability/)                                                                       | P1-11.2, P1-11.3, P1-11.4, P2-11.5 | M      | Mostly done — #49, #50, #67; P2-11.5 partial | —                                                                                  |
| 7   | Production runtime + CI/CD     | [`../../initiatives/production-readiness/`](../../initiatives/production-readiness/)                                                     | P1-8.3, P1-8.4, P1-4.4, P1-7.1     | M      | Done — #51                                   | —                                                                                  |
| 8   | Subscription model             | [`../../initiatives/subscription-billing/`](../../initiatives/subscription-billing/)                                                     | P1-9.2                             | L      | Deferred — not started                       | None — Phase 4 is done                                                             |

Status legend: ⏳ Scaffolded = doc kit exists, no code yet · ⏳ Ready to kick off = no kit, single ADR is the artifact · ⏳ Blocked = kit exists but a Proposed ADR must be Accepted before code starts · ⚠️ Mostly Done = primary targets closed but one or more sub-items remain partial · ✅ Done = all phase targets closed · 🅿️ Deferred = scaffold only; do not start.

**Phase 6 partial:** P1-11.2 (CONTRIBUTING.md), P1-11.3 (`scripts/bootstrap-fork.sh`), and P1-11.4 (APP_NAME centralization) are closed. P2-11.5 (CachePort consolidation) shipped a shared `CachePort<T>` in `src/shared/application/ports/`, but only `metric-category` re-exports it; `metric`, `metric-log`, `analytics`, and `metric-settings` still declare per-feature ports. See `audit-2026-05-20.md` § P2-11.5.

## Recommended Execution Order

1. **Phase 0** first (S-effort, ~1 day total). Closes 4 P0s including LICENSE + README + .env.example, immediately satisfying fork-ready exit criterion #4.
2. **Phase 1** next. Refresh tokens + verify-port leak block any cleanup of auth.
3. **Phase 2** in parallel with 1 if context allows — observability has no overlap with auth code.
4. **Phase 3** (email verification) builds on Phase 1's TokenProvider.verify() extension.
5. **Phase 6** (forkability) can interleave whenever a small slot opens — most items are S-effort.
6. **Phase 7** (production runtime) before any production traffic.
7. **Phase 4** (multi-tenancy) once ADR-004 is Accepted. Largest effort; touches every domain table.
8. **Phase 5** (drift cleanup) after multi-tenancy's table changes settle, since drift fixes will collide with `organization_id` migrations.
9. **Phase 8** (subscription) once Phase 4 lands — billing is per-organization.

## Per-Phase Kit Map

Each kit's `README.md` ends with the same cross-reference block so the audit re-runs can mechanically verify mapping:

```md
## References

- **Closes audit gaps:** [P0-X.Y], [P1-A.B] in `docs/internal/audits/saas-readiness/audit-2026-05-01.md`
- **Owning ADRs:** ADR-NNN in `docs/internal/audits/saas-readiness/decisions.md`; (kit-local) ADR-001 in `./decisions.md`
- **Effort:** S/M/L
- **Status:** Proposed | In progress | Accepted
- **Predecessor / dependency:** (e.g., "depends on Phase 1 completing the TokenProvider.verify() extension")
```

When a phase ships, the row in this file moves from ⏳ Scaffolded → ✅ Done with a link to the merged PR. The audit re-run script can then auto-mark the closed gap IDs as ✅ in the next dated audit file.

## P2-Only Items (Deferred — Not Scaffolded)

These items in `audit-2026-05-01.md` are not blocking and have no kit yet. Open one when the work is up next:

- P2-1.4 — OAuth / social login
- P2-2.2 — Shared `Page<T>` pagination helper
- P2-3.3 — Dev/test seed scripts
- ~~P2-4.5 — CORS multi-origin~~ — closed by `09f8d82` (#53)
- P2-4.6 — `xss-clean` retirement
- P2-5.4 — APM / metrics readiness (Prometheus)
- P2-9.3 — General feature-flag system
- P2-9.4 — Outbound webhook delivery

## Maintenance Rules

- **Append-only:** finished phases keep their row (status → ✅ Done with PR link). Do not delete.
- **One mutable surface:** the **Status** column of each row. Everything else describes intent and should not change.
- **Cross-link bidirectionally:** every kit's `README.md` references this file in its "Predecessor / dependency" line; this file references every kit folder.
- **Rerun audit after each phase:** generate a new dated `audit-YYYY-MM-DD.md`; diff its scorecard against `audit-2026-05-01.md` so the closed gaps are visible in the public `SAAS-BASE-CHECKLIST.md`.

## Audit History

- `audit-2026-05-01.md` — original baseline: 26 ✅ / 21 ⚠️ / 18 ❌; 7 P0, 17 P1, 11 P2 open; NOT fork-ready (3 of 4 ADR-001 criteria fail).
- `audit-2026-05-20.md` — post Phases 0–7: 52 ✅ / 9 ⚠️ / 4 ❌; 0 P0, 4 P1, 9 P2 open; criterion #3 still fails on Cat 4 (62.5%, blocked by P1-4.2 env-reads). Functionally shippable; not strictly fork-ready under ADR-001.
- `audit-2026-05-24-independent.md` — independent re-audit: **GOLD WITH CAVEATS**; ADR-001 gate PASS; 6 caveats + 8 judgment items. Source code unchanged through 2026-06-05.
- `audit-2026-06-05.md` — fresh threat-surface re-audit: **GOLD WITH CAVEATS — DOWNGRADED PENDING N1+N2+F1**. C1–C6 open-unchanged. Two new P0 (cache-layer cross-tenant scoping) + one new HIGH (DISABLE_RATE_LIMITING no prod guard). Six P1 + six P2 + four P3 newly surfaced. ADR-003 reopened (see ADR-011).

## Newly-Discovered Gaps — 2026-06-05

Surfaced by `audit-2026-06-05.md`. Same priority/effort convention as the baseline gaps; cross-linked to the ADRs they trigger.

| ID      | Pri                          | Area             | Effort | Summary                                                                                                                | Owning ADR      |
| ------- | ---------------------------- | ---------------- | ------ | ---------------------------------------------------------------------------------------------------------------------- | --------------- |
| N1      | ~~P0~~ **CLOSED 2026-08-23** | Multi-tenancy    | ≤1h    | `viz`/`vizdash` Redis cache keys scoped by `userId` only — cross-org disclosure on cache hit                           | ADR-009         |
| N2      | ~~P0~~ **CLOSED 2026-08-23** | Multi-tenancy    | ≤1h    | `VisualizationInvalidationAdapter` signature missing `organizationId` — invalidation breaks after N1 fix               | ADR-009         |
| F1      | ~~P1~~ **CLOSED 2026-08-23** | Security         | ≤30m   | `DISABLE_RATE_LIMITING` has no `NODE_ENV=production` schema guard — silent killswitch in prod                          | ADR-010         |
| N3      | ~~P1~~ **CLOSED 2026-08-23** | Multi-tenancy    | ≤1d    | Cache-key scoping pattern systemic — `buildCursorCacheKey` + `MetricCacheRedis` + `MetricLogCacheRedis`                | ADR-009         |
| N4      | P1                           | Observability    | ≤1d    | RabbitMQ messages don't propagate `x-request-id`; consumer not wrapped in ALS                                          | —               |
| N5      | ~~P1~~ **CLOSED 2026-08-24** | API contracts    | ≤1d    | OpenAPI spec omits `/metrics/dummy` and `/metric-categories/dummy` (mounted in code, missing from spec)                | —               |
| ADR-011 | P1                           | Architecture     | ≤1d    | Resolve auth-flat vs metric-nested persistence layout disagreement; migrate auth to nested                             | ADR-011         |
| N6      | P2                           | Scaling          | ≤1w    | One RabbitMQ queue serves all orgs; no per-org routing or publisher-side budget                                        | —               |
| N7      | P2                           | Observability    | ≤1d    | No APM / OpenTelemetry beyond Sentry sampling (overlaps deferred P2-5.4)                                               | —               |
| N8      | P2                           | Scaling          | ≤1h    | Sequelize default pool `max: 5`; no env-tunables                                                                       | —               |
| N9      | P2                           | Scaling          | ≤1d    | Single shared Redis client; SCAN-heavy invalidation blocks every other op                                              | —               |
| N10     | P2                           | Performance      | ≤1h    | `MetricLogStatsRepoSequelize.computeStats` aggregates in JS instead of SQL `AVG/MIN/MAX`                               | —               |
| N11     | P2                           | Performance      | ≤1h    | `MetricLogQueryRepoSequelize.listLogs` redundant JOIN for org isolation when `metric_logs.organization_id` is NOT NULL | —               |
| F2      | ~~P2~~ **CLOSED 2026-09-22** | Secrets          | 5m     | `SENTRY_DSN` not matched by `SENSITIVE_KEY_PATTERN` (latent leak) — closed by `21f12eb` (#105)                         | (related to C6) |
| F3      | ~~P2~~ **CLOSED 2026-08-23** | Security         | 30m    | RabbitMQ defaults `guest:guest` with no prod guard — refused in production by `f5f28b9` (#64)                          | ADR-010         |
| F4      | P2                           | Abuse / DoS      | 2–3h   | `/metric-logs/stats` accepts unbounded date range; `findAll` full-table fetch + JS reduce                              | —               |
| F5      | P2                           | Multi-tenancy    | 30m    | `MetricSettingsRepositorySequelize.create()` does not defensively re-validate metric→org binding                       | —               |
| F6      | P3                           | DX               | 15m    | CORS allowlist not normalized (case, trailing slash); breaks legitimate requests                                       | —               |
| F7      | P3                           | Auth / DX        | 15m    | Refresh cookie `sameSite: "strict"` doc gap may push forkers to weaken to `"none"`                                     | —               |
| —       | P3                           | Observability    | 15m    | `x-request-id` header trusted unbounded (no UUID validation / length cap)                                              | —               |
| —       | P3                           | Config hardening | 5m     | `SENTRY_TRACES_SAMPLE_RATE` not clamped to `[0,1]` at schema layer                                                     | —               |

**Recommended execution order for the 2026-06-05 batch** (status as of 2026-09-24: steps 1 and 2
are done except N4; of step 3, C1/C3/C4 are closed and N7/N8/N9 and the ADR-011 migration remain
open; all of C1–C6 are closed — see `FINAL-AUDIT-SUMMARY.md`):

1. **Same-day patch PR** — N1 + N2 + F1 (cumulative ≤2h). Cross-tenant cache disclosure + rate-limit killswitch are the two findings that meaningfully shift the verdict.
2. **Within-week** — N3, N4, N5, F2, F3, F4 + close C5/C6 from the 05-24 punch list (all are ≤1d).
3. **Within-month** — C1/C3/C4 closure (the long-tracked caveats), N7/N8/N9 scaling defaults, ADR-011 persistence-layout migration.
4. **Defer-and-track** — N6 per-org queue routing (becomes urgent when a fair-use SLA is signed); Phase 8 subscription/billing remains the only deferred initiative.
