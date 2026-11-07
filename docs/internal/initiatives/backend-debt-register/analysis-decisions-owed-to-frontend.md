# B-03, B-04, B-15 — Decisions the backend owes the frontend

Register rows [B-03, B-04 and B-15](register.md). Read from the Notion page (Part 1) on 2026-10-13
and the backend at `bf72b58`. These are not code analyses: each is a decision or a document, and
this note says what is decided, what blocks it, and who moves next.

## B-04 — The production API URL

- **Asked:** 2026-02-18. Blocks the frontend's production config and its CSP `connect-src`.
- **State:** undecided. `docs/reference/ci-pipeline/pipeline-overview.md:159` lists Production as
  `TBD`. ADR-0042 (Accepted 2026-09-15) settles where it will run, Docker Compose on a
  self-managed VPS, not what it will be called.
- **Blocked on:** the owner choosing a domain and provisioning the host. No backend code.
- **Next move:** the owner's. When the name exists, one line in `pipeline-overview.md` and the
  Notion record moves to Completed.
- **Cost of waiting:** none until a release is planned.

## B-03 — CORS origins per environment

- **Asked:** 2026-02-18. Two parts.
- **Part 1, report staging's `CORS_ORIGIN`:** a Render setting, readable only in the dashboard.
  The owner's, five minutes (register O-03).
- **Part 2, add the frontend's origins per environment:** waits on the frontend naming its preview
  and production origins, which waits on its own domain decision.
- **What the code does today:** an unset `CORS_ORIGIN` falls back to `http://localhost:3000`
  (`src/server.ts:157`); the variable takes a comma-separated list (ADR-007 of the audit folder's
  decisions).
- **Worth knowing:** most frontend calls go server to server through `/api/proxy`, where CORS does
  not apply. This matters only for direct browser calls.
- **Next move:** the owner reads the staging value and writes it on the Notion record.

## B-15 — A shared pre-production smoke sequence

- **Asked:** 2026-02-18, P3. A short sequence both repos run before promoting.
- **State:** not written. The backend has two neighbours that are not it: `npm run docker:smoke`
  proves the image starts and serves the probes (ADR-0055), and `Fork Smoke` proves a fork passes
  its gates (ADR-0051). Neither exercises a deployed environment.
- **What can be done now:** write the sequence as a how-to under `docs/how-to/ci-cd/`: health,
  ready, register or login and check the cookie, one authenticated read, one write and its
  cleanup. ≤1h, no code, and no production environment is needed to write it.
- **What cannot:** run it against production, which does not exist.
- **Next move:** the backend's. It is the one row of the three that is ready.

> **2026-10-16:** the "State" line missed a third neighbour. `npm run test:smoke`
> (`tests/smoke/run-smoke.mjs`, #72) does exercise a deployed environment: CI runs it as
> `smoke_staging` and before a production deploy. It checks the release, `/ready`, `/health` and a
> 401 without a token, and never logs in. The sequence, written on `docs/pre-production-smoke`,
> starts with it ([`ci-pipeline` D-01](../ci-pipeline/decisions.md)).

## Not verified

- The staging `CORS_ORIGIN` value, and whether staging is still deployed at the URL the Notion
  record names.
- Whether the frontend has since chosen its production domain; its repo was read for code, not for
  that decision.
