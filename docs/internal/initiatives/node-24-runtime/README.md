# Node 24 runtime

**Status:** Complete locally; gates green on Node 24.21.0. AC-2 (CI green on 24) waits on the PR.
Promoted to [ADR-0046](../../../explanation/decisions/adr-0046-node-24-runtime.md).
**Slug:** `node-24-runtime` · **Branch:** `chore/node-24-runtime`

Lean kit — no plan; acceptance criteria live in the checklist.

Node 20 reached end of life on 2026-04-30 and no longer receives security fixes, yet the backend
built, tested and shipped on it. lakira-frontend raised the move as a P2 request and is moving to
Node 24 at the same time, so both repos describe one runtime. This kit moves every Node pin to 24,
including the production image, which ADR-0042 makes the future deploy artefact.

- [Checklist](node-24-runtime-checklist.md) — work items, acceptance, gates
- [Decisions](decisions.md) — `D-NN` entries
