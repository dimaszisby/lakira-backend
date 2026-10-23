# Node 24 runtime — Decisions Log

`D-NN` entries scoped to this kit.

---

## D-01 — Target Node 24

- **Status:** Accepted
- **Date:** 2026-09-24

Promoted to the architecture decision registry as **[ADR-0046](../../../explanation/decisions/adr-0046-node-24-runtime.md)**.
That file is authoritative; this entry is a pointer.

## D-02 — CI reads the Node version from `.nvmrc`

- **Status:** Accepted
- **Date:** 2026-09-24

Promoted to the architecture decision registry as **[ADR-0046](../../../explanation/decisions/adr-0046-node-24-runtime.md)**.
That file is authoritative; this entry is a pointer.

## D-03 — Base image `node:24-alpine`, not pinned by digest

- **Status:** Accepted
- **Date:** 2026-09-24

Promoted to the architecture decision registry as **[ADR-0046](../../../explanation/decisions/adr-0046-node-24-runtime.md)**.
That file is authoritative; this entry is a pointer.

## D-04 — Swap `@tsconfig/node18` for `@tsconfig/node24`

- **Status:** Accepted
- **Date:** 2026-09-24

Promoted to the architecture decision registry as **[ADR-0046](../../../explanation/decisions/adr-0046-node-24-runtime.md)**.
That file is authoritative; this entry is a pointer.

## D-05 — Fetch the newest 24.x wherever the runtime is installed

- **Status:** Proposed
- **Date:** 2026-10-23

**Context.** Node 24.22.1 (2026-10-20) is a security release: five High CVEs, in TLS, DNS and the
bundled Brotli. The repo pins the major only (`24`), so no file names a patch to bump, but two
places did not fetch the newest one. `setup-node` without `check-latest` uses the runner's cached
24.x, which can trail a release by days. `docker build` without `--pull` reuses a cached
`node:24-alpine`: on the owner's machine it was still 24.21.0.
**Decision.** Every `setup-node` step (8 in `backend-ci.yml`, 1 each in `commit-lint.yml` and
`fork-smoke.yml`) sets `check-latest: true`. `npm run docker:build` and `scripts/image-smoke.sh`
build with `--pull`. The pins stay at the major, as ADR-0046 decisions 2 and 3 set them.
**Options considered.** _Pin `24.22.1` exactly:_ reproducible, but nothing here bumps it, so each
security release would need a PR like this one, and a missed one is silent; the reason ADR-0046
rejected a digest. _Raise `engines` to `>=24.22.1`:_ npm only warns, and the floor goes stale on
the next release.
**Consequences.** Each CI job asks nodejs.org for the newest 24.x, a few seconds per job. A new
24.x reaches CI on its next run, so a regression in a patch release can turn CI red with no change
here; `.nvmrc` can name an exact version for as long as one is bad. A local image build checks the
registry and needs network. Already-built images, including a running deploy, keep their Node
until rebuilt.
