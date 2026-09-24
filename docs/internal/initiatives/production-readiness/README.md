# Production Readiness Kit

Harden the deployment pipeline and fill runtime safety gaps: multi-stage Dockerfile, production deploy job with manual approval, account-lockout brute-force protection, and the missing e2e Jest project.

## Scope

- Multi-stage `Dockerfile` (build → runtime with `npm prune --omit=dev`, `USER node`, `dumb-init`).
- `deploy_production` job in `.github/workflows/backend-ci.yml` with manual approval + `migrate:production` step + `RENDER_PRODUCTION_DEPLOY_HOOK_URL` secret.
- Per-email Redis-backed account-lockout counter on failed login.
- Third Jest project `e2e` + placeholder `__tests__/e2e/auth-flow.e2e.test.ts`.

## Out of Scope

- Winston log-redaction filter — handled in the observability kit (Phase 2).
- Analytics env bypass of `envManager` — handled in the observability kit or cheap-P0 sweep.
- CORS multi-origin support — deferred (P2).

## References

- **Closes audit gaps:** [P1-8.3], [P1-8.4], [P1-4.4], [P1-7.1] in `docs/internal/audits/saas-readiness/audit-2026-05-01.md`
- **Owning ADRs:** ADR-005 (phase order) in `docs/internal/audits/saas-readiness/decisions.md`; (kit-local) ADR-001, ADR-002 in `./decisions.md`
- **Effort:** M (aggregate)
- **Status:** Done — shipped in #51 (`5c16bee`)
- **Predecessor / dependency:** Independent — can run in parallel with other phases
