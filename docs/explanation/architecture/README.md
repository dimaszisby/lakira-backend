# Architecture

Three levels of [C4](https://c4model.com/), each opening a box from the one above.

| Level | Question it answers                   |                                                       |
| ----- | ------------------------------------- | ----------------------------------------------------- |
| 1     | What does the system talk to?         | [System context](./c4-context.md)                     |
| 2     | What runs, and where does state live? | [Containers](./c4-containers.md)                      |
| 3     | How is a slice built inside?          | [Components: the auth slice](./c4-components-auth.md) |

Diagrams are Mermaid in Markdown — they render on GitHub, need no toolchain, and diff as text, so
a wrong arrow shows up in review like any other line.

## The conventions behind the diagrams

- [**Feature-slice DDD**](./feature-slice-ddd.md) — how a slice is laid out and what may import
  what. Read this before adding one.
- [**Persistence and ORM**](./persistence-and-orm.md) — how each feature's Sequelize models are
  registered and associated at boot.
- [**Shared middleware**](./shared-middleware.md) — what lives in `src/shared/middleware/`, and
  the cache-key naming convention.

## In one paragraph

An Express API and a RabbitMQ worker share one TypeScript codebase and one PostgreSQL database.
Product code is organised as vertical feature slices under `src/features/`, split by audience
(`public/` for end-user surfaces, `shared/` for cross-cutting ones like auth). Each slice layers
`domain → application → infrastructure` with dependencies pointing inward, and each is wired by a
hand-written `feature.ts` — no DI container. Requests are validated by Zod schemas that also
generate the OpenAPI spec, so the contract cannot drift from the validation. Redis holds only
recomputable state; PostgreSQL is the sole system of record.

## Where decisions are recorded

Every architectural choice above has an entry in
[`../decisions/`](../decisions/) — 44 records, one per file. When code and diagram disagree, check
the ADR's status first: `Proposed` means written down but **not implemented**, which is exactly
the case for the persistence-layout drift noted at the bottom of the Level 3 page.
