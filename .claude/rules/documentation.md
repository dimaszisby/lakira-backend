---
paths:
  - "docs/**"
---

# Documentation Conventions

`docs/` is organised by **what the reader is doing**, not by what the artifact is called.
Four Diátaxis quadrants ship with the template; `internal/` holds this project's working material
and is deleted on fork.

<!-- PLACEMENT-TABLE:START — must stay byte-identical to .claude/agents/doc-writer.md -->

## Where a document goes

Ask what the reader is doing, then place it. Never place by artifact name.

| The document…                                        | Goes to                                          |
| ---------------------------------------------------- | ------------------------------------------------ |
| teaches a newcomer a skill, followed start to finish | `docs/tutorials/`                                |
| gets an experienced reader through one task          | `docs/how-to/<area>/`                            |
| is looked up, not read through                       | `docs/reference/`                                |
| explains a concept, a trade-off, or why something is | `docs/explanation/`                              |
| records an architectural decision                    | `docs/explanation/decisions/adr-NNNN-<slug>.md`  |
| tracks a piece of work — plan, checklist, tracker    | `docs/internal/initiatives/<topic>/`             |
| is a dated one-off note or session TODO              | `docs/internal/todos/`, `docs/internal/dev-log/` |
| is an audit run                                      | `docs/internal/audits/<program>/`                |
| is a postmortem                                      | `docs/internal/incidents/`                       |

Two rules keep the tree honest:

1. **One quadrant per document.** If it both teaches and specifies, split it.
2. **Generated files are never hand-edited.** `docs/reference/api/lakira-backend-openapi.json`
   comes from Zod schemas and is drift-gated in CI — edit `src/lib/openapi/**` instead. It is also
   **validity-gated**: `docs:openapi:validate` resolves every `$ref` and checks operation ids and
   responses. Drift-gating alone was not enough — a spec that is self-consistently wrong passes a
   diff, and one did, breaking a downstream repo's type generation.

If a document does not obviously fit, it is usually working material: put it under
`docs/internal/` rather than inventing a new top-level folder.

<!-- PLACEMENT-TABLE:END -->

## Working material still uses doc kits

Anything under `docs/internal/initiatives/<topic>/` follows the kit pattern. Size it to the work:

| Scope                                             | Kit          | Contents                                                                     |
| ------------------------------------------------- | ------------ | ---------------------------------------------------------------------------- |
| Large initiative (multi-week, affects CI/process) | Full kit     | README + plan + checklist + ticket + decisions + incidents + metrics-tracker |
| Medium effort (2–5 working days)                  | Standard kit | README + plan/ticket (merged) + checklist + decisions                        |
| Small infra change / quick sweep                  | Lean kit     | README + checklist + at least one `decisions.md` entry                       |
| Single-commit fix                                 | Micro entry  | One entry in the nearest `decisions.md` referencing the commit SHA           |

Ephemeral work skips the kit entirely: one file at
`docs/internal/todos/YYYY-MM-DD-todo-<kebab-title>.md`, tracked in git but user-controlled and
deletable without a follow-up PR. Promote it to a kit if it grows into an initiative.

## A kit is the spec, and the checklist is the tickets

Do not invent a `specs/` folder or a parallel ticket file. The kit already is both:

| Workflow step | Kit file              |
| ------------- | --------------------- |
| spec          | `<slug>-plan.md`      |
| tickets       | `<slug>-checklist.md` |
| decision log  | `decisions.md`        |
| entry point   | `README.md`           |

The kit directory slug is the task's identity — it is also the branch name and the `refs:` footer on
every commit. See `.claude/rules/workflow.md` § The kit slug is the traceability spine.

## Architectural decisions

A kit's `decisions.md` is a **working log**. A decision that constrains how the system is
built — and would still matter to someone who never saw the initiative — is promoted to
`docs/explanation/decisions/` as its own numbered record, with a pointer left behind.

Decisions that only coordinate the work (phase order, audit cadence, which sweep to run first)
stay in the kit. See `docs/explanation/decisions/README.md` for the format and the next free
number.

For migrations: log an entry for every schema change, referencing the migration filename.

### Write the decision when it is made, not at the end

A `decisions.md` entry is written **at the moment the decision is taken** — during planning for the
forks already visible, mid-implementation the moment an unplanned one is settled. Never backfilled
at the end of the task.

A record written after the code works is a rationalization. The rejected options and the reason for
rejecting them are exactly what is wanted when someone traces the headache back months later, and
they are exactly what is forgotten first.

The final `docs` step of the task flow is for reference pages, how-to guides, and generated
artifacts. It is **not** the slot for backfilling decisions.

Promotion to `docs/explanation/decisions/` still follows the rule above: promote when the decision
constrains how the system is built. Promote at the end of the task, not at the moment of decision —
by then it is clear whether it survived implementation.

## Before writing anything

1. Does a document already cover this? Update it. Never create a second copy — duplicated
   content drifts, and the drift is silent. (`.claude/rules/commands.md` documented a
   `migrate:dev` script that never existed, for exactly this reason.)
2. Check the placement table above before choosing a folder.
3. If you add a top-level folder under `docs/`, update `docs/README.md` in the same change.

## Reference

- Conventions and templates: `docs/explanation/documentation-standards.md`
- The map readers see: `docs/README.md`
