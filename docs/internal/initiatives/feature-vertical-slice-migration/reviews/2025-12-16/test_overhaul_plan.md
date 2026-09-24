# JWT Handling Overhaul & Test Hardening Plan

## 1. Objective

Modernize Lakira’s JWT implementation so it meets production-grade expectations (secret hygiene, explicit algorithms, rotation, observability) and back the changes with deterministic unit/integration tests. The effort complements the ongoing feature vertical-slice migration by ensuring the auth slice exposes clear seams that regression suites can exercise consistently.

## 2. Current-State Summary

- Secrets are injected via `env.JWT_SECRET`, but realistic-looking values are still committed to `.env.*`; there is no `.env.example`, secret-scanning gate, or rotation playbook.
- `tokenGenerator` / `JwtTokenProvider` sign tokens with implicit HS256 defaults and a hard-coded `7d` TTL. Middleware verifies a single shared secret with no issuer/audience claims, `kid`, or skew tolerance.
- API tests under `__tests__/auth.test.ts` and other suites create tokens indirectly but never assert on claims, algorithms, or rotation logic. CI only fails when `JWT_SECRET` is missing at runtime.

## 3. Guiding Principles

1. **Fail fast**: Configuration modules should validate JWT settings at startup and in CI.
2. **Least privilege**: Use short-lived access tokens backed by refresh tokens or re-auth flows, limiting blast radius.
3. **Observability first**: Structured logging and metrics must surface invalid token attempts, rotation events, and refresh anomalies.
4. **Automation-backed security**: Secret scanning, CI enforcement, and automated rotation playbooks ensure humans do not become the weakest link.

## 4. Phased Plan

### Phase A – Foundations (Week 1)

1. **Secret Hygiene**
   - Strip secrets from `.env.*`, add `.env.example`, and document secret sourcing (GitHub Actions secrets, Vault, etc.).
   - Add `gitleaks` (or equivalent) to CI + pre-commit to block future leaks.
2. **Centralized JWT Config**
   - Introduce `src/config/jwtConfig.ts` to parse env vars (`JWT_SECRETS`, `JWT_ISSUER`, `JWT_AUDIENCE`, TTLs, skew).
   - Expose both symmetric and asymmetric settings so the auth slice can swap algorithms without touching consumers.
3. **Test Harness Updates**
   - Extend `__tests__/features/auth/**` with unit tests for the config module and `JwtTokenProvider`, ensuring missing/invalid env values fail deterministically.
   - Update `scripts/test-ci.sh` or GitHub Actions workflows to require JWT config secrets as inputs; fail jobs early if absent.

### Phase B – Token Semantics & Middleware (Week 2)

1. **Explicit Claims and Algorithms**
   - Update signing code to enforce `alg`, `iss`, `aud`, `sub`, `iat`, `exp`, and optionally `nbf`.
   - Shorten access-token TTL (e.g., 15 minutes) and add refresh tokens or re-auth flows. Store refresh tokens (hashed) in Redis/Postgres with rotation and revocation lists.
2. **Middleware & Error Handling**
   - Enhance `authMiddleware` to honor multiple keys, check `kid`, allow configurable clock skew, and map failure reasons to structured error responses.
   - Instrument middleware with winston logs/prometheus metrics (counts for invalid signature, expired tokens, unknown `kid`, replay attempts).
3. **Test Coverage**
   - Add slice-level unit tests validating claim construction, TTL clamping, and refresh token rotation.
   - Introduce integration tests (potentially under `__tests__/features/auth/infrastructure/http`) that hit the router/controller to verify new responses and error shapes.

### Phase C – Rotation, JWKS & Operations (Week 3+)

1. **Key Rotation + JWKS**
   - Support multiple active keys with `kid`. If staying with symmetric keys, manage them via versioned secrets; otherwise, introduce an asymmetric key pair and expose a JWKS endpoint under the auth slice.
   - Document and automate the rotation workflow (generate key, publish to secret manager, deploy, retire old key after TTL).
2. **CI/CD + Observability**
   - Update `.github/workflows/backend-ci.yml` to seed rotation secrets and run smoke tests verifying both old/new keys work during overlap windows.
   - Create dashboards/alerts (Grafana/Prometheus/ELK) for JWT failure spikes and rotation progress.
3. **Playbooks & Documentation**
   - Produce runbooks covering rotation, key compromise response, and refresh token invalidation.
   - Align regression suites so `__tests__/auth.test.ts` exercises both access and refresh flows, while feature-level specs assert invariants (issuer, audience, rotation, JWKS discovery).

## 5. Deliverables

1. Clean env files + secret scanning policy + onboarding docs.
2. Config module + refactored token generator/middleware with explicit claims, TTLs, and logging.
3. Refresh token storage + rotation/revocation support.
4. JWKS (or multi-key) support with documented rotation automation.
5. Expanded test coverage (unit + integration + CI guards) proving the new behavior.
6. Runbooks and monitoring that make JWT operations observable and auditable.

## 6. Success Metrics

- CI fails fast when JWT config is missing or invalid.
- Access tokens carry the documented claims/TTL, verified by automated tests.
- Rotation exercises complete in staging without downtime, and alerting confirms success/failure.
- No secrets live in the repo, and scanners enforce the policy continuously.
