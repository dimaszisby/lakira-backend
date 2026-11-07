# CI Pipeline Kit — Decisions Log

Entries scoped to the CI pipeline kit. The kit's plan and checklist predate the `decisions.md`
convention; this log starts with the first decision taken after it.

---

## D-01 — The pre-production smoke sequence is one how-to page, built on `test:smoke`

- **Status:** Accepted (merged in #171, `5960efd`)
- **Date:** 2026-10-16

Micro entry for register row B-15 (P3; the frontend's F-16, asked on 2026-02-18), on
`docs/pre-production-smoke`. Written before the page.

**Context.** The frontend asked for a short sequence both repos run before promoting: health, an
auth round trip that sets the cookie, one authenticated read and one write with its cleanup,
written down in the backend repo for the frontend to link. `npm run test:smoke`
(`tests/smoke/run-smoke.mjs`, #72, ADR-0039) already runs against a deployed environment, and CI
runs it as `smoke_staging` and before a production deploy. It checks the release, `/ready`,
`/health`, and that a protected route answers 401 without a token. It needs only a base URL, so
it never logs in, reads as a user or writes. The register's analysis of B-15 did not name it.
**Decision.** The sequence is a how-to page,
`docs/how-to/ci-cd/run-the-pre-production-smoke-sequence.md`. Its first step is `test:smoke`. The
rest are run by hand with `curl` as a dedicated smoke account: log in, refresh with the cookie,
read the profile, create and delete a metric, log out. The account is made once per environment,
and its password is kept outside the repo.
**Options considered.** Registering a fresh user on every run: registration is limited to 10 per
hour per IP (ADR-0053), sends an email, and leaves a user behind each time. Extending
`run-smoke.mjs` with the authenticated steps now: it needs the account's credentials as a CI
secret and a step in `backend-ci.yml`, which is a change to the pipeline and not to this row's
scope; filed as register row B-67. Pointing at `test:smoke` alone: it does not cover what the
frontend asked for.
**Consequences.** Until B-67 lands, steps after the first are manual and can be skipped silently;
the page says so. Each run leaves one soft-deleted metric row on the smoke account. The
frontend's half, its own path through `/api/proxy`, is written in its repo and links here.
