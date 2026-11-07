# Threat Model – Lakira Backend

- **Generated:** Fri Nov 21 17:53:00 WIB 2025
- **Sources:** Derived from `docs/security-audit-log-baseline-simple.md` and `docs/security-audit-log-features-simple.md`.

## 1. System Overview

- **Architecture:** TypeScript/Express API (`src/server.ts`) talking to PostgreSQL via Sequelize and Redis for caching/rate limiting.
- **Deployment tiers:** Development, staging, production with environment-driven configs (`src/config/zodEnv.ts`, `src/config/db.ts`).
- **Primary modules:** Auth, metrics, metric logs/settings, analytics visualizations, each exposed via dedicated controllers/routes/services (`src/routes`, `src/controllers`, `src/services`, `src/features`).

## 2. Assets & Security Objectives

| Asset                                       | Objective                                                                           |
| ------------------------------------------- | ----------------------------------------------------------------------------------- |
| User identities & roles                     | Prevent unauthorized creation/escalation of privileged users.                       |
| Metrics/logs/settings data                  | Ensure only owners can read/write; protect against tampering and bulk exfiltration. |
| Operational secrets (DB creds, JWT secrets) | Maintain confidentiality and integrity when loading configs.                        |
| Infrastructure availability                 | Resist DoS via oversized bodies, query storms, or testing utilities.                |
| Telemetry/logs                              | Avoid leaking sensitive identifiers.                                                |

## 3. Actors & Entry Points

- **External anonymous user:** Can hit public endpoints such as `/api/v1/docs`, `/api/v1/auth/register`, `/api/v1/auth/login`.
- **Authenticated standard user:** Accesses metric/log/settings APIs, analytics dashboard routes.
- **Compromised network actor:** Able to intercept DB traffic if TLS validation is weak.
- **Misconfigured deployment:** Ships .env defaults (weak DB creds, disabled Redis) or exposes test utilities.

Entry points stem from the REST API (JSON bodies), Swagger UI, and infrastructure services (PostgreSQL, Redis).

## 4. Trust Boundaries

- **Client ↔ API:** Enforced via JWT auth, but input size is unrestricted and validation gaps exist (login, admin role).
- **API ↔ Database:** Configured TLS currently skips certificate verification, allowing MITM.
- **API ↔ Redis:** Optional connection logic can terminate the process or disable rate limiting depending on env flags.

## 5. Threat Scenarios

| ID  | Description                                                                                                                                                                                                  | Source Findings         | Impact                                                          | Mitigations                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| T1  | **Privilege escalation via signup.** `role` is user-controlled and persisted verbatim (`auth schema`, auth use case). Attackers register as admin.                                                           | Features log §5.1       | Admin compromise, full data exposure.                           | Remove `role` from public schema, hard-code server-side defaults, require elevated workflow for admin creation. |
| T2  | **World-writable “public” metrics.** Authorization guards allow access when `isPublic` is true and new metrics default to public, so any authenticated user can mutate another user’s metrics/logs/settings. | Features log §5.2       | Cross-tenant data tampering/exfiltration.                       | Require owner ID checks on all writes/reads; treat `isPublic` as read-only discovery flag; default to private.  |
| T3  | **Database MITM via lax TLS.** Production/staging set `rejectUnauthorized: false`, so certificates aren’t verified.                                                                                          | Baseline log §5.1       | Credential theft, query manipulation, data breach.              | Enforce full TLS verification or tunnel through trusted proxies.                                                |
| T4  | **Unauthenticated Swagger enumeration.** `/api/v1/docs` exposes full OpenAPI schema without auth.                                                                                                            | Baseline log §5.2       | Facilitates recon, parameter discovery for attackers.           | Protect docs behind auth, IP allowlists, or remove from prod.                                                   |
| T5  | **Request-body DoS.** `express.json()` has no size limit, enabling large payloads to exhaust memory/CPU.                                                                                                     | Baseline log §5.3       | Service degradation, potential crashes.                         | Apply body size limits, streaming uploads, and monitoring.                                                      |
| T6  | **Ineffective rate limiting when Redis disabled or NODE_ENV mis-set.** Test/dev defaults allow ~1M requests; Redis optional connection may exit process or disable limits.                                   | Baseline log §5.4, §5.6 | Brute-force and DoS easier; unstable availability.              | Require Redis in prod, adopt sane caps per env, add circuit breakers.                                           |
| T7  | **Weak default DB credentials.** `postgres/password` defaults activate when env vars missing.                                                                                                                | Baseline log §5.5       | Easy credential guessing if misconfigured deployment goes live. | Fail fast when env vars missing; limit defaults to local-only.                                                  |
| T8  | **Login endpoint brute-force + injection risk.** Lacks validation and throttling; accepts arbitrary JSON.                                                                                                    | Features log §5.3       | Account takeover via password guessing or resource exhaustion.  | Add Zod schema, rate limiting, device fingerprinting, CAPTCHA.                                                  |
| T9  | **Testing utilities open to all users.** Dummy metric/log generators allow high-volume inserts.                                                                                                              | Features log §5.4       | Data pollution, storage exhaustion.                             | Remove or guard behind admin flag/feature toggle.                                                               |
| T10 | **Analytics query abuse.** Visualization routes lack rate limiting yet run heavy aggregation SQL.                                                                                                            | Features log §5.6       | Expensive queries can starve DB, cause latency.                 | Add route-specific throttles, async jobs, caching with TTLs.                                                    |
| T11 | **Sensitive identifiers logged in plaintext.** Cache helpers print user IDs, metric IDs, filters.                                                                                                            | Features log §5.5       | Log compromise reveals behavior, facilitates targeted attacks.  | Use structured logging with redaction or disable verbose logs in prod.                                          |
| T12 | **Configuration drift / secret sprawl.** Dual env loaders (`zodEnv`, `config.cjs`) increase risk of inconsistent hardening.                                                                                  | Baseline log §5.7       | One subsystem may ship weaker settings (e.g., TLS, creds).      | Consolidate env loading; share validation between runtime and tooling.                                          |

## 6. Risk Prioritization

- **Critical:** T1, T2 – immediate cross-tenant compromise and admin takeover.
- **High:** T3, T4, T5, T8, T9, T10 – enable MITM, recon, DoS, brute-force, and abuse of heavy workloads.
- **Medium/Low:** T6, T7, T11, T12 – amplify attack surface when combined with misconfiguration or log leaks.

## 7. Recommended Roadmap

1. **Access Control Hardening:** Fix role assignment and metric ownership logic before next release.
2. **Surface Reduction:** Lock Swagger behind auth, disable dummy endpoints, prune verbose logs.
3. **Platform Resilience:** Enforce TLS verification, configure body/rate limits, ensure Redis availability, and fail fast on weak defaults.
4. **Analytics Safeguards:** Add throttles/caching for visualization routes and monitor query costs.
