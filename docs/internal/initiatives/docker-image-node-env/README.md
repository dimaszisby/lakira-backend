# Run the production image as production by default

**Status:** Complete — gates green, awaiting PR. D-01..D-03 promoted to
[ADR-0050](../../../explanation/decisions/adr-0050-production-image-defaults-node-env.md).
**Slug:** `docker-image-node-env` · **Branch:** `fix/docker-image-node-env`

Lean kit — no plan; acceptance criteria live in the checklist.

The production `Dockerfile` set no `NODE_ENV`, and the schema defaults it to `development`, so a
container started without it switched off every startup refusal (ADR-0036, ADR-0048, ADR-0049).
This kit makes the image default to `production`, with any runtime value still winning. Origin:
[`2026-09-27-todo-docker-image-sets-no-node-env.md`](../../todos/2026-09-27-todo-docker-image-sets-no-node-env.md).

- [Checklist](docker-image-node-env-checklist.md) — acceptance criteria, work items, gates
- [Decisions](decisions.md) — `D-NN` entries; promoted ones point at the ADR registry
