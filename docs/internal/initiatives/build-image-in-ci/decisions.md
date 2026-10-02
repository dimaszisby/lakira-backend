# Build Image in CI — Decisions Log

`D-NN` entries scoped to this kit.

---

## D-01 — CI builds the production image and smokes it in production mode, as its own workflow

- **Status:** Accepted
- **Date:** 2026-10-02

Promoted to the architecture decision registry as **[ADR-0055](../../../explanation/decisions/adr-0055-production-image-built-and-smoked-in-ci.md)**.
That file is authoritative; this entry is a pointer.

## D-02 — The smoke brings its own Postgres and Redis on a private network

- **Status:** Accepted
- **Date:** 2026-10-02

Promoted to the architecture decision registry as **[ADR-0055](../../../explanation/decisions/adr-0055-production-image-built-and-smoked-in-ci.md)**.
That file is authoritative; this entry is a pointer.

## D-03 — ADR-0042 stays Accepted, with a status note that it is not implemented

- **Status:** Accepted
- **Date:** 2026-10-02

**Context.** ADR-0042 was accepted on 2026-09-15, but CI still deploys through Render hooks. The
registry says to flip a record to `Accepted` in the PR that implements it, and the audit asks for
the status to be corrected.
**Decision.** Keep `Accepted` as the status of the decision and add a dated status note saying it
is decided and not implemented, with the evidence.
**Options considered.** Move it back to `Proposed`: rejected, the decision was taken deliberately
and other records (ADR-0039, ADR-0050, the frontend's production-URL request) already build on it.
**Consequences.** The registry holds one `Accepted` record that is not in the code, marked as such.

## D-04 — The Dockerfile unit test stays

- **Status:** Accepted
- **Date:** 2026-10-02

**Context.** `__tests__/unit/dockerfile.test.ts` pins ADR-0050 by reading the Dockerfile, because
CI did not build the image. The smoke now proves the same thing at run time.
**Decision.** Keep the test; update its comment and add a status note to ADR-0050.
**Options considered.** Delete it: rejected, it fails in seconds on a developer's machine, where
the smoke takes minutes and needs Docker.
**Consequences.** Two guards for one decision, at different speeds.
