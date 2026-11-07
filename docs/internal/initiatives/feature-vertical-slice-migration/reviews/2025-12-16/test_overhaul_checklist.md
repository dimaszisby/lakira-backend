# JWT Handling Overhaul Checklist

## Phase A – Foundations

- [ ] Remove committed secrets from `.env.*` files and add `.env.example` with documented placeholders.
- [ ] Configure secret-scanning (e.g., `gitleaks`) in CI and pre-commit hooks; document allowlisted patterns.
- [ ] Build `src/config/jwtConfig.ts` with schema validation for secrets, issuer, audience, TTLs, algorithms, and skew.
- [ ] Refactor `tokenGenerator`, `JwtTokenProvider`, and `authMiddleware` to consume the config module exclusively.
- [ ] Extend `__tests__/features/auth/**` to cover the config module and token provider behavior (invalid env, TTL clamping).
- [ ] Update CI workflows (`.github/workflows/backend-ci.yml`) to require JWT secrets and fail early when absent.

## Phase B – Token Semantics & Middleware

- [ ] Enforce explicit JWT claims (`iss`, `aud`, `sub`, `iat`, `exp`) and algorithms for both sign and verify paths.
- [ ] Shorten access-token TTL, introduce refresh tokens, and store refresh state (DB/Redis) with rotation + revocation support.
- [ ] Harden `authMiddleware` with multi-key verification, configurable clock skew, structured logging, and Prometheus metrics.
- [ ] Add integration tests (auth router/controller) verifying success cases, expired tokens, invalid issuer/audience, bad `kid`, and refresh flows.
- [ ] Document the new token policy (TTL, claims, refresh cadence) in the architecture docs.

## Phase C – Rotation, JWKS & Operations

- [ ] Implement key versioning (`kid`) and support multiple active secrets; evaluate and document migration to asymmetric keys + JWKS endpoint.
- [ ] Automate rotation runbooks (generate key, distribute via secret manager, deploy overlapping configs, retire old key) and store them under `docs/development/operations/`.
- [ ] Update monitoring/alerting to track invalid token spikes, rotation progress, and refresh anomalies.
- [ ] Ensure GitHub Actions + staging pipelines run smoke tests that cover rotation overlap (old/new keys).
- [ ] Backfill regression suites (`__tests__/auth.test.ts`, `__tests__/features/auth/**`) with scenarios covering JWKS discovery, rotation overlap, and compromise response (revoke refresh tokens).
- [ ] Finalize incident response documentation for JWT compromise, referencing how to invalidate tokens and rotate keys rapidly.
