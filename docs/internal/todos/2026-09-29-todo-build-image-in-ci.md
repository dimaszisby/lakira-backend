# Todo — CI never builds the production image

- **Status:** Fixed in kit [`build-image-in-ci`](../initiatives/build-image-in-ci/README.md)
  (ADR-0055), merged in #129. R6 stays open in the audit until a dated run confirms it (ADR-002)
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

## Fixed (2026-10-02)

`scripts/image-smoke.sh` (`npm run docker:smoke`) builds the image and checks it by running it, and
the `Image Smoke` workflow runs it on every push and pull request (ADR-0055). ADR-0042 keeps
`Accepted` and carries a status note that it is decided and not implemented. The image is still
built and discarded: shipping the built artefact remains ADR-0039 Part 2.
