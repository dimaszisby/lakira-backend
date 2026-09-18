# Workflow & Task Management

## Plan Mode Default

- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

## Task Flow

One ordering for non-trivial work. Each step leaves a trace the next step can find.

```
plan → size the kit → branch → plan.md → checklist.md → ⏸ approve
     → implement (+ decisions.md entry at each decision) → gates → review → fix
     → docs → hand over commit → hand over PR
```

Sizing is the kit table in `.claude/rules/documentation.md` — Full / Standard / Lean / Micro /
ephemeral todo. **Say which size you picked before starting.** A single-commit fix that demands a
plan, a checklist, and an ADR gets bypassed once and then always; the Micro and ephemeral rows are
the escape hatch and using them is correct.

If a Lean sweep turns out to change an interface, a data shape, a dependency, or a security
boundary — stop and re-size. Do not carry on under the lighter rules.

## The kit slug is the traceability spine

Every artifact of a task carries the same slug, so a line of code can be walked backwards to the
decision that put it there.

```
refresh-token-rotation
  → kit      docs/internal/initiatives/refresh-token-rotation/
  → plan     …/refresh-token-rotation-plan.md
  → tickets  …/refresh-token-rotation-checklist.md
  → log      …/decisions.md
  → ADR      docs/explanation/decisions/adr-NNNN-<slug>.md, linking back to the kit
  → branch   feat/refresh-token-rotation
  → commits  feat(auth): rotate refresh tokens  …  refs: refresh-token-rotation
  → PR       body links the kit README and every ADR the work promoted
```

Kit dir, plan filename, checklist filename, and branch name use the **same slug**. A promoted ADR
links back to the kit; the kit's `decisions.md` entry links forward to the ADR. Without both
directions the artifacts exist but cannot find each other, and tracing back becomes grep-and-hope.

**Tasks are identified by slug, not by number.** There is no issue tracker here to allocate numbers
from, so a numeric scheme would have no source of truth for the next free one and two parallel
sessions would silently pick the same. A slug derived from the work is unique by construction and
readable in a branch name. ADRs are the one exception — they stay `adr-NNNN-<slug>.md`, allocated
from `docs/explanation/decisions/README.md`.

Ephemeral todos are exempt — the dated filename is their identity.

## Stop after the checklist

Plan plus checklist is the cheapest place to discover the wrong thing is being built. Present both,
wait for approval, then run implementation through to review without further check-ins unless
something forces a re-size.

## Branching Convention

- **Always create new branches off `dev`**, never off `main`
- Branch promotion order: `feat/* → dev → staging → main`
- Prefix with the Conventional Commits type the work will carry — `feat/`, `fix/`, `docs/`,
  `chore/`, `ci/` — then the kit slug: `feat/refresh-token-rotation`. (This file previously said
  `feature/*`; no branch in this repo has ever used it.)
- Every subagent prompt for implementation must instruct: `branch off dev`

## Commit & PR Ownership

- **Claude does not commit, push, or open PRs.** Only the user does these — manually.
- This overrides any prior "commit when asked" guidance. If the user says "commit it," surface the suggested message and exact commands instead of running them.
- Branch creation (`git checkout -b`) and read-only git ops (`git status`, `git log`, `git diff`) are permitted.
- At the end of every completed task/ticket, **always provide a ready-to-use PR message** — title (Conventional Commits prefix) + body (what/why/how summary).
- **Hand over the message as a file, never as a pasted heredoc.** Write it to a path and give the user `git commit -F <path>`. Long `git commit -F- <<'EOF'` blocks look near-identical at the prompt and are recalled wholesale from shell history — that is how three commits on `dev` ended up sharing the subject `chore(dev-env): make local setup work from a fresh clone`, each carrying the wrong body. `squash_merge_commit_title` is `COMMIT_OR_PR_TITLE`, so a wrong subject propagates into the PR title and onto `dev`.
- A `commit-msg` hook runs commitlint against `commitlint.config.mjs`. It catches _malformed_ messages, not _wrong_ ones — every message in that incident was a valid Conventional Commit.

## Subagent Strategy

- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

## Self-Improvement Loop

- After ANY correction from the user: update `.claude/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review `.claude/lessons.md` at session start for relevant project

## Gates are named, not asserted

"Tests pass" is not a status, and neither is "verified". Never mark a task complete without
proving it works: run the gates and report each **by name** with its result. A gate that was
skipped is reported as skipped, not omitted.

| Gate           | Command                                                          | When                                           |
| -------------- | ---------------------------------------------------------------- | ---------------------------------------------- |
| typecheck      | `npm run typecheck`                                              | always                                         |
| lint           | `npm run lint`                                                   | always                                         |
| format         | `npm run format:check`                                           | always                                         |
| tests          | `npm test` (unit then integration — do not combine the projects) | always                                         |
| build          | `npm run build`                                                  | always                                         |
| OpenAPI        | `npm run docs:openapi:check`                                     | any route, Zod schema, or `src/lib/openapi/**` |
| security delta | `npm run security:delta:gate`                                    | any dependency added, upgraded, or removed     |

Use `npm run test:coverage` instead of `npm test` when coverage thresholds are in scope.

`docs:openapi:check` already chains generate → **validate** → diff, so there is no second command to
run. Validity matters as much as drift: a spec that is self-consistently wrong passes the diff, and
one did, breaking a downstream repo's type generation. Run `npm run docs:openapi:validate` alone only
to check the committed spec without regenerating it.

The security gate is "soft" only in that Critical/High findings are what trip it — a tripped gate
exits non-zero and stops the pipeline. See `.claude/rules/security.md`.

Beyond the gates: diff behaviour against `dev` when relevant, check logs, and ask whether a staff
engineer would approve this.

## Review before docs

Review can invalidate an implementation choice, and documentation written before that lands gets
written twice. Order is gates → review → fix → docs.

## Demand Elegance (Balanced)

- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes — don't over-engineer
- Challenge your own work before presenting it

## Autonomous Bug Fixing

- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests — then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

## Tracking Progress

The ordering lives in **Task Flow** above; this is how the artifacts are kept current while the work
runs. Where the plan and checklist live is decided by the kit size — see
`.claude/rules/documentation.md`. Only ephemeral work uses a bare
`docs/internal/todos/YYYY-MM-DD-todo-<kebab-title>.md`; anything with a kit keeps its checklist in
the kit.

1. **Track Progress**: mark checklist items complete as you go, not in a batch at the end
2. **Explain Changes**: high-level summary at each step
3. **Log Decisions**: a `decisions.md` entry the moment a decision is taken — never backfilled
4. **Document Results**: add a review section to the checklist (or the todo file, if ephemeral)
5. **Capture Lessons**: update `.claude/lessons.md` after corrections

## Graphify Usage in Feature Implementation

When generating a prompt or implementing a feature from a plan/doc:

- Always mention **what concepts to query**, not just "use Graphify"
- Run `graphify query` on relevant concepts **before writing any code**
- Typical queries: how the target feature's use cases are structured, how repositories are wired in DI, how similar existing features are organized

**Template:**

```
Implement <feature> following the plan at <path/to/plan.md>.
Before writing any code, query the Graphify graph:
- graphify query "<concept A>"
- graphify query "<concept B>"
```

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Only touch what's necessary. No side effects with new bugs.
