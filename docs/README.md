# Documentation

Organised by [Diátaxis](https://diataxis.fr/): what you need depends on what you are doing.

| I want to…            | Go to                            | Example                                    |
| --------------------- | -------------------------------- | ------------------------------------------ |
| **learn** by doing    | [`tutorials/`](./tutorials/)     | Get the API running for the first time     |
| **accomplish a task** | [`how-to/`](./how-to/)           | Regenerate the OpenAPI spec                |
| **look something up** | [`reference/`](./reference/)     | Which env vars exist; what the schema is   |
| **understand why**    | [`explanation/`](./explanation/) | Why feature-slice DDD; what an ADR decided |

Two rules keep this tree honest:

1. **A document belongs to exactly one quadrant.** If it teaches _and_ specifies, split it.
2. **Generated files are never hand-edited.** `reference/api/lakira-backend-openapi.json` is
   produced from Zod schemas and drift-gated in CI; edit `src/lib/openapi/**` instead.

---

## Tutorials — learning-oriented

Start here if you are new. Tutorials are followed start to finish and are expected to work
verbatim from a clean clone.

## How-to guides — task-oriented

- [`development/`](./how-to/development/) — regenerate the OpenAPI spec, run Postgres in Docker
- [`testing/`](./how-to/testing/) — run the test suites
- [`ci-cd/`](./how-to/ci-cd/) — the daily pipeline playbook
- [`security/`](./how-to/security/) — run an audit, the release delta SOP, the branch model

## Reference — information-oriented

| Path                                                       | What                                                                       |
| ---------------------------------------------------------- | -------------------------------------------------------------------------- |
| [`api/`](./reference/api/)                                 | Generated OpenAPI 3.1 contract. **Do not hand-edit.**                      |
| [`configuration.md`](./reference/configuration.md)         | Every environment variable, its type and default                           |
| [`commands.md`](./reference/commands.md)                   | Every npm script worth running                                             |
| [`database-schema.md`](./reference/database-schema.md)     | Tables, columns, constraints                                               |
| [`environments.md`](./reference/environments.md)           | Environment/secret matrix                                                  |
| [`ci-pipeline/`](./reference/ci-pipeline/)                 | Pipeline strategy, job model, workflow conventions                         |
| [`security/`](./reference/security/)                       | Control catalogue (ASVS/SSDF), risk model, gate policy, audit-run template |
| [`branch-protection.md`](./reference/branch-protection.md) | Branch ruleset                                                             |
| [`frontend-handoff.md`](./reference/frontend-handoff.md)   | Backend→frontend CI/CD contract                                            |

## Explanation — understanding-oriented

- [`architecture/`](./explanation/architecture/) — feature-slice DDD, persistence, shared middleware
- [`decisions/`](./explanation/decisions/) — **44 architecture decision records**, one per file, Nygard format
- [`testing-strategy.md`](./explanation/testing-strategy.md) — the four-layer pyramid and its gates
- [`product-requirements.md`](./explanation/product-requirements.md) — as-built product scope
- [`documentation-standards.md`](./explanation/documentation-standards.md) — how these docs are organised

---

## `internal/` — not part of the template

[`internal/`](./internal/) holds this project's working material: doc kits, audit runs,
incidents, dev logs, todos, and archive. **`scripts/bootstrap-fork.sh` deletes it on fork**, so a
fresh fork inherits documentation about the template rather than Lakira's history.

> `internal/audits/saas-readiness/` tracks **unresolved** risk, including two open P0s as of
> `audit-2026-06-05.md`. It is current business, not history.

## Where new documentation goes

Pick by the reader's purpose, not by the artifact's shape:

| The document…                                     | Goes to                                     |
| ------------------------------------------------- | ------------------------------------------- |
| teaches a newcomer a skill                        | `tutorials/`                                |
| gets an experienced reader through one task       | `how-to/<area>/`                            |
| is looked up, not read                            | `reference/`                                |
| explains a decision or a concept                  | `explanation/`                              |
| records an architectural decision                 | `explanation/decisions/` (one ADR per file) |
| tracks a piece of work — plan, checklist, tracker | `internal/initiatives/<topic>/`             |
| is a dated one-off note                           | `internal/todos/` or `internal/dev-log/`    |

The full rule, including kit sizing, lives in
[`explanation/documentation-standards.md`](./explanation/documentation-standards.md) and is
mirrored for agents in `.claude/rules/documentation.md`.
