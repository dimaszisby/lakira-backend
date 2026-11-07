# Threat Model - 2026-05-18

- Generated (UTC): 2026-02-18T11:04:09Z
- Sources: `docs/internal/audits/security/audit-2025-11-21/*`, `docs/internal/audits/security/audit-2026-02-18/*`, current code + precheck artifacts in `tmp/security/`

## 1. System Overview

- Architecture summary: TypeScript/Express backend with feature-sliced modules, PostgreSQL/Sequelize, and Redis-backed caching/rate limiting.
- Primary assets: user identity/role data, metric/log/settings tenant data, auth tokens, environment secrets, CI security evidence.
- Internet-facing entry points: auth APIs, metrics/log/settings/category APIs, analytics APIs, docs endpoints, health endpoint.
- Trust boundaries:
  - Client -> API
  - API -> PostgreSQL
  - API -> Redis
  - CI pipeline -> repository/workflow policy

## 2. Threat Scenarios

| threat_id      | stride_category                    | asset                                    | actor                       | entry_point                    | trust_boundary    | preconditions                                     | attack_path                                                       | impact                                                   | existing_controls                                                            | proposed_controls                                                                  | risk_rating |
| -------------- | ---------------------------------- | ---------------------------------------- | --------------------------- | ------------------------------ | ----------------- | ------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------- |
| TM-20260518-01 | Elevation of Privilege             | Role integrity                           | External authenticated user | Auth profile/register routes   | Client -> API     | Ability to submit crafted auth payloads           | Attempt privileged role mutation through user-controllable fields | Unauthorized admin-level access                          | Auth schemas and use-cases exclude role mutation from profile update         | Keep auth contract regression tests in CI and audit-week manual payload checks     | Low         |
| TM-20260518-02 | Tampering                          | Tenant-owned metric data                 | External authenticated user | Metrics/log/settings CRUD      | Client -> API     | Knowledge of another tenant resource identifier   | Attempt cross-tenant read/write by guessing IDs                   | Data tampering and cross-tenant confidentiality breach   | Ownership validation in `db-helper` and auth middleware                      | Re-run non-owner integration checks during audit week                              | Low         |
| TM-20260518-03 | Information Disclosure             | API metadata and route contracts         | External anonymous user     | Docs endpoints                 | Client -> API     | Swagger auth guard disabled in deployment         | Enumerate contracts and parameters from public docs               | Recon acceleration for chained attacks                   | `SWAGGER_REQUIRE_AUTH` defaults to true and docs are guardable               | Add deployment checklist assertion for docs auth in staging/prod                   | Low         |
| TM-20260518-04 | Spoofing / Man-in-the-Middle       | Database credentials and data-in-transit | Network attacker            | PostgreSQL connection          | API -> PostgreSQL | Misconfigured TLS validation at environment level | Intercept DB traffic if certificate validation is disabled        | Credential theft and response tampering                  | `DB_SSL_REJECT_UNAUTHORIZED` wired in runtime and migration configs          | Keep environment review and certificate rotation checks in quarterly execution     | Medium      |
| TM-20260518-05 | Denial of Service                  | API availability                         | External attacker           | Large request payloads         | Client -> API     | Public endpoint access                            | Send oversized payloads to exhaust memory/CPU                     | Service degradation and outage                           | `REQUEST_BODY_LIMIT`, global/user rate limiting                              | Add periodic load/abuse simulation in release-delta audits                         | Medium      |
| TM-20260518-06 | Denial of Service / Resource Abuse | Analytics query capacity                 | External authenticated user | Analytics visualization routes | Client -> API     | Valid user token                                  | Spam high-cardinality range queries                               | Database pressure and increased response latency         | Dedicated `analyticsRateLimiter`                                             | Monitor analytics query latency and tune per-environment thresholds                | Medium      |
| TM-20260518-07 | Supply Chain Tampering             | Runtime dependency trust                 | External attacker           | Dependency graph               | Build -> Runtime  | Vulnerable package introduced by update drift     | Exploit known advisory via vulnerable transitive dependency       | Remote execution or integrity risk depending on advisory | `npm audit --production --json`, dependency policy, CI security delta checks | Keep monthly dependency maintenance PRs and quarterly deep triage                  | Low         |
| TM-20260518-08 | Availability / Control Degradation | Abuse resistance controls                | Misconfiguration            | Redis/rate-limiter lifecycle   | API -> Redis      | Redis unavailable and config drift                | Rate limiting falls back to weaker behavior or noisy error loop   | Increased brute-force/abuse window                       | Redis lifecycle handling and fallback logging in limiter/client              | Keep redis health checks and explicit prod config assertions in deployment process | Medium      |

## 3. Prioritized Risks

- Critical: None in 2026-02-18 precheck snapshot.
- High: None in 2026-02-18 precheck snapshot.
- Medium: TM-20260518-04, TM-20260518-05, TM-20260518-06, TM-20260518-08
- Low: TM-20260518-01, TM-20260518-02, TM-20260518-03, TM-20260518-07

## Definition of Done

- Every high-value asset has at least one mapped scenario.
- Scenarios map to controls and reconciled findings where applicable.
