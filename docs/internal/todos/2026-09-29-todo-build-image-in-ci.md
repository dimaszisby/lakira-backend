# Todo — CI never builds the production image

- **Status:** Open (R6, P2)
- **Created:** 2026-09-29
- **Owner:** unassigned
- **Origin:** `docs/internal/audits/saas-readiness/audit-2026-09-29.md` §6 R6, §4.3 ADR-0042

---

## What

No workflow builds or starts the production image (twelve-factor TF-2). `cb99f50` fixed a runtime
image broken since `bba4e6c` and unnoticed for that reason. ADR-0042 (VPS Compose deploy) is marked
Accepted, but CI still deploys through Render hooks (`backend-ci.yml:389-419`), against
`docs/explanation/decisions/README.md:95` ("Flip to Accepted in the same PR that implements it").

## Suggested fix

A CI job running `npm run docker:build` and a container smoke test (`/api/v1/health`, and the
`NODE_ENV` default ADR-0050 pins). Correct ADR-0042's status, or add a note that it is decided but
not implemented. Do this before the VPS work, since that makes the image the deploy artefact.
