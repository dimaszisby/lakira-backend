# Workflow & Task Management

## Plan Mode Default

- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

## Task Flow

Every task starts from an issue (ADR-0085). One ordering for non-trivial work; each step leaves a
trace the next step can find.

```
issue #N → plan → size → branch → (2+ days: plan.md → checklist.md) → STOP: approve
        → implement (+ a decision entry at each decision) → gates → review → fix
        → docs → hand over commit → hand over PR (Closes #N)
```

Sizing is the table in `.claude/rules/documentation.md`. **Say which size you picked before
starting.** Work under two days has no kit: the issue body is the plan and the pull request the
record. A single-commit fix that demands a plan, a checklist and an ADR gets bypassed once and then
always, so the light row is the escape hatch, and using it is correct.

If work with no kit turns out to change an interface, a data shape, a dependency, or a security
boundary, stop and re-size rather than carrying on under the lighter rules. An ADR is owed for
those whatever the size.

No issue yet? File one first, from the form that fits (`.github/ISSUE_TEMPLATE/`), with its labels
(`docs/reference/issue-tracker.md`). Creating it is outward-facing, so confirm it with the owner.

## The issue number is the traceability spine

Every artifact of a task carries its issue number, so a line of code can be walked backwards to the
decision that put it there. This repository uses the tracker's ids as the task id (ADR-0085).

```
#123 Rotate refresh tokens
  → branch   feat/123-refresh-token-rotation
  → commits  feat(auth): rotate refresh tokens  …  refs: #123
  → PR       body says "Closes #123" and links every ADR the work added
  → kit      docs/internal/initiatives/refresh-token-rotation/, only for 2+ days,
             with the issue in its README
  → ADR      docs/explanation/decisions/adr-NNNN-<slug>.md, linking back to the issue or the kit
```

A kit's dir, plan filename, checklist filename and branch slug are the same slug, and its README
names the issue. A promoted ADR links back to the kit; the kit's `decisions.md` entry links forward
to the ADR. Without both directions the artifacts exist but cannot find each other, and tracing
back becomes grep-and-hope. ADRs keep their own numbers, `adr-NNNN-<slug>.md`, allocated from
`docs/explanation/decisions/README.md`.

Before 2026-10-29 the kit slug alone was the id, with branches `feat/<slug>` and footers
`refs: <slug>`. Those stay as they are.

**A decision is Accepted in the pull request that makes it.** A `D-NN` entry or an ADR the owner
approved in the plan, or that the PR's review confirms, is written `Accepted` there; merging is
the acceptance, and a merge needs no follow-up commit to flip statuses or add PR numbers.

## Stop after the checklist

Plan plus checklist is the cheapest place to discover the wrong thing is being built; without a
kit, the plan and the issue's acceptance criteria play that part. Present them, wait for approval, then run implementation through to review without further check-ins unless
something forces a re-size.

What makes a plan approvable is the **Definition of Ready** in `.claude/rules/documentation.md`.
Do not present a plan for approval that fails it.

## Branching Convention

- **Always create new branches off `dev`**, never off `main`
- Branch promotion order: `feat/* → dev → staging → main`
- Prefix with the Conventional Commits type the work will carry — `feat/`, `fix/`, `docs/`,
  `chore/`, `ci/` — then the issue number and a slug: `feat/123-refresh-token-rotation`.
- Every subagent prompt for implementation must instruct: `branch off dev`

## Commit & PR Ownership

- **Claude does not commit, push, or open PRs.** Only the user does these — manually.
- This overrides any prior "commit when asked" guidance. If the user says "commit it," surface the suggested message and exact commands instead of running them.
- Branch creation (`git checkout -b`) and read-only git ops (`git status`, `git log`, `git diff`) are permitted.
- At the end of every completed task, **always provide a ready-to-use PR message** — title (Conventional Commits prefix) + body (what/why/how summary), with `Closes #N` for the issue it finishes, so the merge closes it.
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
| image smoke    | `npm run docker:smoke`                                           | `Dockerfile`, `.dockerignore`, or dependencies |

Use `npm run test:coverage` instead of `npm test` when coverage thresholds are in scope.

`docs:openapi:check` already chains generate → **validate** → diff, so there is no second command to
run. Validity matters as much as drift: a spec that is self-consistently wrong passes the diff, and
one did, breaking a downstream repo's type generation. Run `npm run docs:openapi:validate` alone only
to check the committed spec without regenerating it.

The image smoke builds the production image and runs it, in about two minutes, and needs Docker
(ADR-0055). CI runs it on every push as `Image Smoke`; run it locally when the change can alter
what the image contains or how it starts and stops.

The security gate is "soft" only in that Critical/High findings are what trip it — a tripped gate
exits non-zero and stops the pipeline. See `.claude/rules/security.md`.

Beyond the gates: diff behaviour against `dev` when relevant, check logs, and ask whether a staff
engineer would approve this.

## Review before docs

Review can invalidate an implementation choice, and documentation written before that lands gets
written twice. Order is gates → review → fix → docs.

## What's next

When the user asks what to do next, with or without a merge to close out, **answer from GitHub
Issues**, ranked by the rule of `backend-debt-register` D-12. Do not rank from memory of the
conversation.

```bash
gh issue list --state open --label state:ready --json number,title,labels
gh issue list --state open --json number,title,labels   # the gaps: what waits, and on whom
```

The rank: `state:ready` only; then the lowest `tier:`; then the lowest `sev:` (none sorts after
P3); then the lower number. The frozen debt register
(`docs/internal/initiatives/backend-debt-register/register.md`) maps each old `B-NN` and `O-NN` to
its issue; an issue that came from a row keeps the id in its body.

- **Recommend the first issue by the rank**, and cite it by number (`#239`). Read the analysis or
  todo its body links, if any, before proposing a size.
- **Report any issue that outranks it but waits on someone** as a gap, with whom it waits on
  (`state:owner`, `state:frontend`, `state:upstream`, `state:unexplained`). The owner's open
  questions are the `type:decision` issues; name the ones that block it.
- **Check the issue is still open and unclaimed** before recommending it: a merged PR that
  references it means it should have closed, and closing it comes first.
- **If `FINAL-AUDIT-SUMMARY.md` § 8 orders things differently, say so** and name both. The audit
  summary records what a dated run asked for; the issues are where that is ranked against
  everything else.
- **A new finding, audit item or Notion record gets an issue**, labelled as the tracker reference
  says, filed with the owner's confirmation in the handover of the PR that found it. A "Found, out
  of scope" line in a kit's checklist names its issue.
- **A fix PR says `Closes #N`.** A finding a dated audit must confirm says so in the issue, which
  stays open until the run does.
- **Re-rank only by the labels.** If the rank gives the wrong answer, change the issue's labels,
  or D-12 with a new decision entry. A new issue's `tier:` follows the register's D-01 tiers.

`__tests__/unit/open-work-records.test.ts` keeps the records honest: the frozen register maps every
open row, each todo that is not finished names its issue, and a todo dated after the freeze fails
the unit gate (ADR-0085).

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
runs. Work of two days or more keeps its checklist in its kit (`.claude/rules/documentation.md`);
smaller work keeps its checkable items in the issue body, and its pull request is the record. Since
2026-10-29 nothing new goes in `docs/internal/todos/` (ADR-0085): the files there are dated records.

1. **Track Progress**: mark checklist items complete as you go, not in a batch at the end
2. **Explain Changes**: high-level summary at each step
3. **Log Decisions**: a `decisions.md` entry (in a kit) or a line in the pull request body, the
   moment a decision is taken — never backfilled
4. **Document Results**: add a review section to the kit's checklist, or to the pull request body
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
