# Security Reviewer Memory Index

- [Three prior SaaS audits completed](project_prior_audits.md) — audit-2026-05-01, audit-2026-05-20, audit-2026-05-24-independent; findings documented in docs/internal/audits/saas-readiness/
- [Fresh threat-surface scan 2026-06-05](project_scan_2026_06_05.md) — new gaps found: env singleton, RabbitMQ defaults, DISABLE_RATE_LIMITING no prod guard, sortBy open string, stats endpoint no date cap, SENTRY_DSN/RESEND_API_KEY not in sensitive-keys
