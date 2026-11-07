# Control Catalog - ASVS + Top 10 + SSDF Mapping

## Purpose

This catalog maps Lakira backend control domains to OWASP ASVS L2, OWASP Top 10, and NIST SSDF so each audit finding can be traced to an industry-standard baseline.

| Domain ID     | Control Domain                  | Control Objective                                             | OWASP ASVS (L2) | OWASP Top 10 (2021)                            | NIST SSDF (SP 800-218) | Primary Evidence Artifacts           |
| ------------- | ------------------------------- | ------------------------------------------------------------- | --------------- | ---------------------------------------------- | ---------------------- | ------------------------------------ |
| LC-ARCH-01    | Architecture & Threat Modeling  | Maintain explicit trust boundaries and threat scenarios       | V1              | A04 Insecure Design                            | PO.1, PW.1, RV.1       | `threat-model.md`, `audit-plan.md`   |
| LC-AUTH-01    | Authentication                  | Enforce strong auth workflows and brute-force resistance      | V2              | A07 Identification and Authentication Failures | PW.6, RV.1             | auth route tests, findings log       |
| LC-AUTHZ-01   | Authorization                   | Enforce object-level and function-level access control        | V4              | A01 Broken Access Control                      | PW.5, RV.1             | service/router code evidence         |
| LC-SESSION-01 | Session/JWT Security            | Protect token integrity and lifecycle controls                | V3              | A07 Identification and Authentication Failures | PW.6                   | JWT provider/middleware refs         |
| LC-INPUT-01   | Input Validation                | Validate and constrain all external inputs                    | V5              | A03 Injection                                  | PW.5, RV.1             | Zod schemas, middleware refs         |
| LC-API-01     | API Surface Hardening           | Restrict methods, docs exposure, and unsafe defaults          | V14             | A05 Security Misconfiguration                  | PW.6                   | server config, method guards         |
| LC-DATA-01    | Data Protection & Secrets       | Protect sensitive data at rest/in transit and secret handling | V8, V9          | A02 Cryptographic Failures                     | PS.1, PW.4             | env schema, DB TLS config            |
| LC-LOG-01     | Logging & Monitoring            | Avoid sensitive leakage and preserve traceability             | V10             | A09 Security Logging and Monitoring Failures   | RV.1, RV.3             | logger config, log samples           |
| LC-ABUSE-01   | Rate Limiting & Abuse           | Resist brute force, flooding, and expensive query abuse       | V7              | A04 Insecure Design, A10 SSRF (abuse vectors)  | PW.6, RV.1             | limiter config, analytics guards     |
| LC-SCA-01     | Dependencies & Supply Chain     | Detect and remediate vulnerable dependencies                  | V14.2           | A06 Vulnerable and Outdated Components         | PO.3, PW.4, RV.1       | `dependency-policy.md`, audit output |
| LC-CICD-01    | CI/CD Security Gates            | Enforce pre-merge and pre-release security checks             | V1.14           | A05 Security Misconfiguration                  | PO.4, RV.1             | workflow, gate reports               |
| LC-RUNTIME-01 | Runtime Configuration Hardening | Harden env defaults and deployment behavior                   | V1.14, V14      | A05 Security Misconfiguration                  | PW.1, PW.6             | env schema, infra settings           |
| LC-IR-01      | Incident Readiness              | Preserve auditability and incident response loop              | V10             | A09 Security Logging and Monitoring Failures   | RV.3, PO.5             | incidents log, decisions log         |

## Usage Rules

- Every finding entry must include at least one ASVS, one Top 10, and one SSDF mapping.
- Control IDs in this file are the canonical references for `control-matrix.md` and `findings-log.md`.
- When standards versions change, update this file first, then update templates/checklists.
