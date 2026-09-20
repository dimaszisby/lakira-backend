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

## What goes inside a kit

> Kits created on or after **2026-09-19** follow the templates below. Earlier kits are left as
> written — records are immutable, and retrofitting them would falsify what happened.

Naming was already consistent across the 20 kits here; what drifted was the inside. Plan headings
varied (`## 1. Context and Goals` vs `## Context & Goals`), and only one in five sampled plans stated
acceptance criteria at all. A spec with no acceptance criteria cannot be verified — the gates then
prove the code compiles, not that it does what was asked.

Which templates apply follows the kit size, not a separate tier:

| Kit size     | Plan | Checklist | Decisions | README | Acceptance criteria live in |
| ------------ | ---- | --------- | --------- | ------ | --------------------------- |
| Full kit     | yes  | yes       | yes       | yes    | the plan                    |
| Standard kit | yes  | yes       | yes       | yes    | the plan                    |
| Lean kit     | no   | yes       | yes       | yes    | **the checklist**           |
| Micro entry  | no   | no        | yes       | no     | — no spec is owed           |
| Ephemeral    | no   | no        | no        | no     | — no spec is owed           |

The Lean row is the one that needs explaining: with no plan there is nowhere to reference `AC-N` ids
from, so the criteria are stated in the checklist itself. Everything else about a Lean checklist is
unchanged.

### Shared with lakira-frontend — four deliberate differences

This kit format is shared with lakira-frontend: same documents, same mandatory sections, same
`D-NN` numbering, same Definition of Ready, and the same `feat/` branch prefix. Three things differ
**on purpose**, each reflecting a genuinely different system:

|                 | Here                             | lakira-frontend                |
| --------------- | -------------------------------- | ------------------------------ |
| gate commands   | this repo's npm scripts          | its own                        |
| promotion style | the entry collapses to a pointer | the body stays, under a banner |
| Accessibility   | no such section                  | a mandatory plan section       |

**Do not unify them.** The promotion styles in particular are opposite by design: every promoted
entry here is a pointer stub, and all 14 in the frontend's `components-overhaul/decisions.md` keep
their full body under a banner reading "That record is the durable copy; this entry is the original
log". Collapsing the body is correct here and would destroy original logs there. A future reader
comparing two near-identical rule files will read these three as drift and helpfully fix them — this
table is what stops that.

### Template — `<slug>-plan.md` (the spec)

```markdown
# <Title> — Plan

- **Status:** Draft | Ready | Approved | In progress | Done
- **Appetite:** <N days> — past that, cut scope rather than extend
- **Date:** YYYY-MM-DD

## Context and goals

Why this exists and what changes when it lands.

## Acceptance criteria

MANDATORY. Observable and checkable. Each gets an ID that threads to the checklist,
the tests, and the PR body, and a one-line `*Why:*` naming where the requirement came
from — without it there is no path from AC-3 back to why anyone wanted AC-3.

- **AC-1** — `POST /auth/refresh` returns 401 for an already-rotated token.
  _Why:_ rotation is unverifiable if a spent token still authenticates.
- **AC-2** — A rotated token's family is revoked; no sibling remains usable.
  _Why:_ stolen-token replay was the open P0 in the SaaS-readiness audit.

## Open questions

MANDATORY heading; an empty list is a valid answer, a missing heading is not.
Use `[NEEDS CLARIFICATION]` inline wherever the ambiguity actually sits, so it greps.

- [ ] **Q-1** — Does rotation apply to service tokens, or user tokens only?

## Out of scope

What this deliberately does not do.

## Decisions expected

Forks already visible. Each becomes a `D-NN` in `decisions.md` when settled — at the
moment it is settled, never backfilled.

- Token storage: DB table vs Redis TTL

## Phases

### Phase 0 — <name>

Enough detail that the checklist writes itself.

## Risks and trade-offs

## Rollback

CONDITIONAL — required when migrations, deploys, or destructive data changes are in scope.
Migrations: `down` verified for <files>.
Code: revert-safe — no data written the previous version cannot read.
Deploy: staging hook re-runs previous build.

## Security and data

CONDITIONAL — required when the change touches a trust boundary, tenancy, secrets, or
personal data. The last of these overlaps the re-size triggers in
`.claude/rules/workflow.md` § Task Flow; the others are narrower and specific to this section.

## Observability

CONDITIONAL — what you would look at when this breaks at 2am.

## Success metrics

OPTIONAL. If you state one, name where it is read. Otherwise it is a wish, not a metric.
If genuinely tracked, it belongs in `metrics-tracker.md` and outlives the kit.

## References
```

### Template — `<slug>-checklist.md` (the tickets)

```markdown
# <Title> — Checklist

## Phase 0 — <name>

Items name the artifact, not the intent. `Migration 20260508000001-…cjs adding
email_verified_at, working down` beats "add migration" — the first is verifiable a year later.

- [ ] `path/to/file.ts` — what it must contain

## Discovered

Work found mid-implementation. Two outcomes only, and naming it forces the choice:

- [ ] Found: <thing> → in scope, added to Phase N
- [ ] Found: <thing> → out of scope, filed as `docs/internal/todos/YYYY-MM-DD-todo-<slug>.md`

If a discovery changes an interface, a data shape, a dependency, or a security boundary,
stop and re-size per `.claude/rules/workflow.md` § Task Flow.

## Acceptance

Reference the plan's AC IDs. Do NOT restate the criteria — "link, never duplicate" applies,
and duplicated criteria drift silently. (Lean kits have no plan: state the criteria here.)

- [ ] AC-1 — verified by `__tests__/auth/refresh.test.ts` › rejects rotated token

## Gates

Prove nothing broke. Acceptance proves the thing was built. Both, separately.
Commands and the conditions each gate fires under live in `.claude/rules/workflow.md`
§ Gates are named, not asserted — that table is the source of truth; do not copy it here.

- [ ] typecheck
- [ ] lint
- [ ] format
- [ ] tests
- [ ] build
- [ ] OpenAPI — if routes, Zod schemas, or `src/lib/openapi/**` were touched
- [ ] security delta — if a dependency was added, upgraded, or removed
```

### Template — `decisions.md` entry

```markdown
## D-01 — <decision in one line>

- **Status:** Proposed | Accepted | Superseded by D-NN
- **Date:** YYYY-MM-DD

**Context.** What forced a choice.
**Decision.** What was chosen.
**Options considered.** What was rejected, and why.
**Consequences.** What this costs.

<!-- once promoted, the body above is replaced by this pointer -->

Promoted to the architecture decision registry as **[ADR-NNNN](../../../explanation/decisions/adr-NNNN-<slug>.md)**.
That file is authoritative; this entry is a pointer.
```

Replacing the body on promotion is not a contradiction of "records are immutable" — the reasoning
is not deleted, it moves to the ADR, which is the record from then on. This is what every promoted
entry in this repo already does. Unpromoted entries keep their full body — the collapse happens at
promotion, not before.

Promotion timing is unchanged and stated below: write the entry when the decision is taken; promote
at the end of the task, when it is clear the decision survived implementation.

### Template — `README.md` (kit entry point)

A pointer, not a summary of the other three files.

```markdown
# <Title>

**Status:** <what phase, what is blocking>
**Slug:** `<slug>` · **Branch:** `feat/<slug>`

- [Plan](<slug>-plan.md) — goals, acceptance criteria, phases
- [Checklist](<slug>-checklist.md) — work items, acceptance, gates
- [Decisions](decisions.md) — `D-NN` entries; promoted ones point at the ADR registry
```

## Definition of Ready

The task flow pauses for approval after the checklist but states no criteria for what makes a plan
approvable. This is that criteria. It lives here once — never copied into a plan.

A plan is ready for approval when:

- [ ] Acceptance criteria are stated, and each is checkable
- [ ] No unresolved `[NEEDS CLARIFICATION]` markers remain
- [ ] Out of scope is stated
- [ ] Appetite is set
- [ ] Decisions expected are listed
- [ ] Rollback is stated, if migrations or deploys are in scope

`grep -r 'NEEDS CLARIFICATION' docs/internal/initiatives/<slug>/` is the mechanical half.

Lean kits have no plan and so have no Definition of Ready; their checklist is the thing approved.

## Architectural decisions

A kit's `decisions.md` is a **working log**. A decision that constrains how the system is
built — and would still matter to someone who never saw the initiative — is promoted to
`docs/explanation/decisions/` as its own numbered record, with a pointer left behind.

Decisions that only coordinate the work (phase order, audit cadence, which sweep to run first)
stay in the kit. See `docs/explanation/decisions/README.md` for the format and the next free
number.

**Kit-local decisions are numbered `D-01`, `D-02`; the registry keeps `ADR-NNNN`.** Both were
written `ADR-00N` until 2026-09-19, so a promoted entry read "ADR-001 promoted to ADR-0017" — two
numbering spaces sharing one prefix. Going forward a promotion reads `D-NN → ADR-NNNN`. Existing
entries are not renumbered.

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
