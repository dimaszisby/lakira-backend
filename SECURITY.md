# Security Policy

## Reporting a vulnerability

**Do not open a public issue for a security problem.**

Report privately through GitHub's
[private vulnerability reporting](https://github.com/dimaszisby/lakira-backend/security/advisories/new)
on this repository. If that is unavailable, contact the maintainer directly through their GitHub
profile.

Please include:

- What the issue is and where (file path, route, or request that triggers it).
- What an attacker could achieve with it.
- Steps to reproduce, or a proof of concept.
- Any suggested fix, if you have one.

This project is maintained by a single developer. Acknowledgement is best-effort, typically
within a week. There is no bug-bounty programme.

## Scope

This repository is the **backend**: an Express REST API, its queue worker, and the scripts that
fork it. The frontend it pairs with lives at
[`lakira-frontend`](https://github.com/dimaszisby/lakira-frontend) and has its own policy; report
browser-side issues there.

In scope here:

- Authentication, the refresh-token cookie, organization membership and role checks.
- Tenant isolation: a request, a cache entry or a job that reaches another organization's data.
- Rate limiting, and the client address it keys on (`TRUST_PROXY`).
- Input validation and the error envelope, including anything a response or a log line leaks.
- The queue worker and the jobs it runs.
- The startup refusals of production-unsafe settings (ADR-0036), and `scripts/bootstrap-fork.sh`.
- Dependency vulnerabilities reachable from application code.

Out of scope:

- Findings that require a compromised host, database or broker.
- Missing headers or configuration with no demonstrated impact.
- Automated scanner output without a working proof of concept.
- Denial of service through volumetric traffic.
- Issues in a deployment's own settings rather than this codebase.

## Known gaps

This repository publishes its own readiness assessment rather than implying it has none. See
[`SAAS-BASE-CHECKLIST.md`](SAAS-BASE-CHECKLIST.md) and the dated audits under
`docs/internal/audits/saas-readiness/`.

Security-relevant items already known and tracked — please do not re-report these:

- The login lockout fails open when Redis is down, and a stranger can lock a victim's account by
  failing logins for it.
- `hashEmail`, which names an address in logs and limiter keys, is unsalted.
- Reads have no per-route rate limit; only the app-wide limit applies.
- Registration answers differently for an address already in use.
- Access tokens carry no `iss` or `aud` claim.
- A configured CORS origin must match the browser's spelling exactly.
- Behind the frontend's proxy, every user shares the frontend server's per-IP rate-limit budget
  until the proxy forwards the browser's address.

A **fork** of this repository inherits all of the above. Read the checklist before deploying
one.

## Handling practices

- A `pre-commit` hook refuses a staged `.env*` file other than `*.example`.
- Every pull request runs the security delta gate: a critical or high advisory in a production
  dependency fails the pipeline (`docs/reference/security/`).
- Logs and Sentry events are masked by key and scrubbed before they leave the process
  (ADR-0059, ADR-0071). An error passed to the logger is reduced to an allowlist of fields.
- Startup refuses production-unsafe settings, such as disabled rate limiting or a guest broker
  login, in production and staging (ADR-0036).
