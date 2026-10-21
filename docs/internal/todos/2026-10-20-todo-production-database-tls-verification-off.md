# Todo — a production database connection may skip TLS verification

- **Status:** Closed on `fix/database-tls-and-staging-refusals`
  ([`database-tls-and-staging-refusals`](../initiatives/database-tls-and-staging-refusals/README.md),
  ADR-0036 note of 2026-10-21). Reproduced by a test first; a dated run is owed to confirm it
- **Created:** 2026-10-20
- **Owner:** unassigned
- **Origin:** dated SaaS-readiness run of 2026-10-20, finding X1
  ([`audit-2026-10-20.md`](../audits/saas-readiness/audit-2026-10-20.md) § 6)

---

## What

`DB_SSL_REJECT_UNAUTHORIZED=false` is not on the production refusal list (`src/config/zodEnv.ts:506-558`),
`.env.example:69` sets it to `false`, and staging defaults to it, because the default is true only when
`NODE_ENV` is `production` (`zodEnv.ts:116-119`). The migration config (`src/config/config.cjs:11`)
defaults to true, so the app and the migrations disagree.

Reproduced on the dated run of 2026-10-20: production and staging starts with the variable `false`
pass environment validation.

## Suggested fix

Refuse `false` in production (ADR-0036's list), default to true in staging, and change the template's
value. Make `config.cjs` read the same rule.
