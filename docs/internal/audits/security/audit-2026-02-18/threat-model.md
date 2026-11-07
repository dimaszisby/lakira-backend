# Threat Model - 2026-02-18

- Generated (UTC): 2026-02-18T08:36:30Z
- Sources: current code inspection, `tmp/security/security-delta-report.json`, and historical run `docs/internal/audits/security/audit-2025-11-21/`

## 1. System Overview

- Architecture: TypeScript/Express API with feature-sliced routers, Sequelize/Postgres, and Redis-backed rate limiting/cache.
- Primary assets: user identities/roles, metric/log/settings data, auth tokens, operational secrets.
- Internet-facing entry points: `/api/v1/auth/*`, metrics/log/settings routes, analytics routes, docs endpoints.
- Trust boundaries:
  - Client to API boundary (JWT, validation, method controls)
  - API to database boundary (TLS + credential management)
  - API to Redis boundary (availability and abuse controls)

## 2. Threat Scenarios

| threat_id      | stride_category              | asset                         | actor                                         | entry_point                     | trust_boundary         | preconditions                                    | attack_path                                                           | impact                                                                             | existing_controls                                                               | proposed_controls                                                                | risk_rating |
| -------------- | ---------------------------- | ----------------------------- | --------------------------------------------- | ------------------------------- | ---------------------- | ------------------------------------------------ | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------- |
| TM-20260218-01 | Elevation of Privilege       | User role integrity           | Authenticated user                            | `PUT /api/v1/auth/profile`      | Client -> API          | Valid JWT and profile update access              | Attempt to submit privileged `role` mutations via profile update path | Potential privilege escalation regression if privileged field controls are removed | Role removed from update DTO + regression test coverage                         | Keep contract test coverage and monitor profile update schema/use-case drift     | Low         |
| TM-20260218-02 | Tampering / Misconfiguration | API method policy consistency | Browser client / malicious script origin      | CORS preflight and PATCH routes | Browser -> API         | Browser-enforced CORS flow                       | Attempt route/method mismatch between CORS policy and routed verbs    | Inconsistent client behavior and avoidable workaround pressure                     | CORS methods now include routed verbs (including PATCH)                         | Keep static guardrail rule to detect future verb mismatches                      | Low         |
| TM-20260218-03 | Supply Chain / Tampering     | Runtime dependency trust      | External attacker via dependency exploit path | Dependency tree                 | Build/runtime boundary | Dependency graph drifts to vulnerable versions   | Exploit known advisory paths in vulnerable package versions           | Increased exploitation surface, denial or integrity impacts depending on advisory  | Dependency policy + patched paths in lockfile + clean production audit snapshot | Continue recurring dependency maintenance and audit gating                       | Low         |
| TM-20260218-04 | Information Disclosure       | API surface metadata          | External anonymous user                       | `/api/v1/docs*`                 | Client -> API          | Misconfigured env (`SWAGGER_REQUIRE_AUTH=false`) | Enumerate routes/schema from docs endpoints                           | Recon acceleration for further attacks                                             | Auth guard default enabled                                                      | Keep guard enabled outside local; enforce via env checks in deployment pipelines | Low         |
| TM-20260218-05 | Denial of Service            | Service availability          | External attacker                             | Global and route request paths  | Client -> API          | Misconfigured env toggles                        | Disable throttling via env drift and flood costly endpoints           | Brute force or service degradation                                                 | Rate limiter middleware and validated defaults                                  | Keep `DISABLE_RATE_LIMITING=false` default and monitor env drift                 | Medium      |

## 3. Prioritized Risks

- High: None in current snapshot
- Medium: TM-20260218-05
- Low: TM-20260218-01, TM-20260218-02, TM-20260218-03, TM-20260218-04

## 4. Notes on Historical Reconciliation

Previously critical findings from 2025 (signup role escalation and public metric write access) were reviewed and remain mitigated in current implementation paths. They are retained in `findings-log.md` as historical verified records for traceability.

## Definition of Done

- High-value assets and trust boundaries are documented.
- Threat scenarios map to current findings and control matrix entries.
