# Lakira Backend to Frontend CI/CD Handoff

Written **February 16, 2026**; auth, CORS, CI-gate and path details re-checked against the code on
**2026-09-24**. This document captures the backend details needed to implement frontend CI/CD safely.

---

## 1. Environment Matrix (Dev/Staging/Prod) + FE-Consumed Env Vars

FE convention: keep these equal per environment:

- `API_URL`
- `NEXT_PUBLIC_API_BASE_URL`

| Target env            | `API_URL`                                            | `NEXT_PUBLIC_API_BASE_URL`                           | Backend health URL                                          | Status                                             |
| --------------------- | ---------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------- |
| `dev`                 | `http://localhost:5000/api/v1`                       | `http://localhost:5000/api/v1`                       | `http://localhost:5000/api/v1/health`                       | Active (`npm run dev`; Compose `app` is on `8001`) |
| `staging` / `preview` | `https://lakira-backend-staging.onrender.com/api/v1` | `https://lakira-backend-staging.onrender.com/api/v1` | `https://lakira-backend-staging.onrender.com/api/v1/health` | Active                                             |
| `prod`                | `TBD`                                                | `TBD`                                                | `TBD`                                                       | Production backend URL not available yet           |

Secret naming already used in docs:

- FE CI secret: `STAGING_API_BASE_URL` (feed both FE vars in CI)
- BE CI secret: `STAGING_BASE_URL` (the `smoke_staging` job; same value as above)

---

## 2. API Contract Source of Truth + Versioning/Compatibility Policy

### Source of truth

- Committed OpenAPI spec: `docs/reference/api/lakira-backend-openapi.json`
- Runtime endpoint: `GET /api/v1/docs/openapi.json`
- Generation command: `npm run docs:openapi:generate`

### Current compatibility policy

- The live API namespace is versioned under `/api/v1/*`.
- Any FE-visible contract change must update:
  - backend implementation,
  - OpenAPI spec,
  - contract tests (Schemathesis),
  - FE integration points.
- For potentially breaking changes, backend and frontend must explicitly decide whether to:
  - keep backward compatibility in `v1`, or
  - introduce `v2` endpoints and run a controlled migration.

---

## 3. Auth, CORS, CSRF, Cookie/Domain/SameSite

### Auth strategy

- Requests authenticate with a short-lived **access token** as a Bearer header
  (`Authorization: Bearer <token>`), HS256-signed. Lifetime is `ACCESS_TOKEN_TTL_SEC`, default
  **900 s (15 minutes)**.
- `POST /api/v1/auth/login` and `POST /api/v1/auth/register` return the access token as
  `data.token` **and** set a **refresh token** cookie (see below).
- `POST /api/v1/auth/refresh` reads that cookie, rotates it (single use; reuse revokes the whole
  token family), sets a new cookie and returns a new `data.token`. Refresh-token lifetime is
  `REFRESH_TOKEN_TTL_DAYS`.
- `POST /api/v1/auth/logout` revokes the refresh-token family server-side and clears the cookie.
  The FE should also drop its in-memory access token.
- Other auth routes: `/forgot-password`, `/reset-password`, `/verify-email`,
  `/resend-verification`, `/switch-org` (all under `/api/v1/auth`).

### CORS behavior

- CORS origin is controlled by backend env var `CORS_ORIGIN`: a comma-separated allowlist of exact
  origins (ADR-0034). Unset, it defaults to `http://localhost:3000`.
- Backend has `credentials: true` — required for the refresh cookie.
- Allowed methods: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`.

Guidance for FE deployment surfaces (documentation-only, no backend code change in this task):

| FE surface    | CORS expectation                                                                                                                  |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Local FE      | `CORS_ORIGIN=http://localhost:3000`                                                                                               |
| Preview FE    | List each preview origin in `CORS_ORIGIN` (comma-separated). Matching is exact — no wildcards, and case and trailing slash matter |
| Production FE | `TBD` until FE production domain is finalized                                                                                     |

### CSRF and cookies

- The refresh token is an **httpOnly cookie** named `<app>_refresh` (`lakira_refresh` for this
  repo), `SameSite=Strict`, `Path=/api/v1/auth/refresh`, `Secure` in staging and production. The
  FE never reads it; it only needs to send `credentials: "include"` on `/auth/refresh` and
  `/auth/logout`. No `Domain` attribute is set, so it is host-only.
- `SameSite=Strict` means the FE and API must be same-site for the cookie to be sent. A
  cross-site setup (different registrable domains) will not refresh; do not weaken it to `None`
  without a CSRF defence (open finding F7).
- No CSRF token contract is enforced. The access token is a header, and the cookie is `Strict` and
  scoped to one path.

### Important release risk to resolve before full FE CD

- Both risks previously listed here are resolved: `PATCH` is in the CORS allow-methods, and
  `CORS_ORIGIN` accepts multiple origins. The remaining one is the `SameSite=Strict` constraint
  above for cross-site preview domains.

---

## 4. FE/BE Release Dependency Rule

Use this release rule:

| Change type                                          | Can FE and BE deploy independently? | Recommended order                                                       |
| ---------------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------- |
| FE-only UI/internal changes (no API contract change) | Yes                                 | FE deploy anytime                                                       |
| BE-only internal changes (no API contract change)    | Yes                                 | BE deploy anytime                                                       |
| Backward-compatible API additions/changes            | Partially (coordinate)              | BE first (staging `smoke_staging` green), then FE                       |
| Breaking API changes                                 | No                                  | Introduce compatibility/versioning plan first, then coordinated rollout |

Minimum gate before FE production promotion:

1. Backend staging health green.
2. Backend checks green: `contract_local` (Schemathesis, pre-deploy), plus `smoke_staging` on the `staging` branch.
3. FE CI checks green against staging API base URL.

---

## 5. Smoke-Check Targets + Non-Prod Test Account Flow

### Smoke endpoints

- `GET /api/v1/health` -> expect `200` and `status: ok`
- `POST /api/v1/auth/login` -> expect `200` and token in payload
- `GET /api/v1/auth/profile` with bearer token -> expect `200`
- `GET /api/v1/metrics?limit=1` with bearer token -> expect `200`

### Non-prod account flow

- Local deterministic user (seed script): `contract-primary@lakira.dev` / `ContractPrimary!123`
- Staging: use a dedicated synthetic test account (documented example: `staging-tester@lakira.app`). The CI smoke suite needs no account or token
- Do not commit staging credentials; store them only in GitHub/Vercel secrets

### Example post-deploy smoke sequence

```bash
curl -fsS "$STAGING_HEALTH_URL"

TOKEN=$(curl -fsS -X POST "$STAGING_BASE_URL/auth/login" \
  -H "content-type: application/json" \
  -d '{"email":"<staging-test-email>","password":"<staging-test-password>"}' \
  | jq -r '.data.token')

curl -fsS "$STAGING_BASE_URL/auth/profile" \
  -H "Authorization: Bearer $TOKEN"

curl -fsS "$STAGING_BASE_URL/metrics?limit=1" \
  -H "Authorization: Bearer $TOKEN"
```

---

## 6. References

- `docs/reference/environments.md`
- `docs/internal/initiatives/ci-pipeline/GITHUB_ACTIONS_PIPELINE_PLAN.md`
- `docs/internal/archive/frontend/ci-cd/ENVIRONMENTS_MATRIX.md`
- `docs/internal/initiatives/tests-4-contract-tests/README.md`
- `docs/internal/initiatives/tests-4-contract-tests/seed-strategy.md`
- `docs/reference/ci-pipeline/workflow-guidelines.md`
- `src/server.ts`
- `src/features/shared/auth/infrastructure/http/authMiddleware.ts`
- `src/features/shared/auth/infrastructure/http/controller.ts` (cookie settings)
- `src/features/shared/auth/infrastructure/providers/JwtTokenProvider.ts`

---

## 7. Unresolved (TBD - Deferred)

These items are intentionally unresolved for now and will be completed later when production setup is ready.

| Item                                           | Current value | Follow-up question                                                                          |
| ---------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------- |
| Production backend API base URL                | `TBD`         | What is the exact production backend API base URL (must include `/api/v1`)?                 |
| Production frontend domain (for CORS guidance) | `TBD`         | What is the final FE production domain that backend should allow as `CORS_ORIGIN` guidance? |
