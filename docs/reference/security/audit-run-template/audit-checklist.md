# Security Audit Checklist - {{AUDIT_DATE}}

- Generated (UTC): {{GENERATED_AT_UTC}}

Use `docs/reference/security/security-audit-master-checklist.md` as the canonical control list.

| Status | Control ID    | Control                                             | Evidence Ref | Notes |
| ------ | ------------- | --------------------------------------------------- | ------------ | ----- |
| [ ]    | LC-ARCH-01    | Architecture and threat model coverage complete     |              |       |
| [ ]    | LC-AUTH-01    | Authentication input/rate controls validated        |              |       |
| [ ]    | LC-AUTHZ-01   | Object-level authorization validated                |              |       |
| [ ]    | LC-INPUT-01   | Validation/deserialization controls validated       |              |       |
| [ ]    | LC-API-01     | API docs/method/CORS hardening validated            |              |       |
| [ ]    | LC-DATA-01    | Secrets and TLS controls validated                  |              |       |
| [ ]    | LC-LOG-01     | Logging redaction and monitoring controls validated |              |       |
| [ ]    | LC-ABUSE-01   | Rate-limit and abuse controls validated             |              |       |
| [ ]    | LC-SCA-01     | Dependency and supply-chain checks complete         |              |       |
| [ ]    | LC-CICD-01    | CI security gate checks complete                    |              |       |
| [ ]    | LC-RUNTIME-01 | Runtime config hardening validated                  |              |       |
| [ ]    | LC-IR-01      | Incident/exception readiness validated              |              |       |

## Definition of Done

- Every required control has a status and evidence reference.
- Failed controls are represented in `findings-log.md`.
