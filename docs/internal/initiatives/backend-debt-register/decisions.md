# Backend debt register — Decisions Log

`D-NN` entries scoped to this kit. ADR numbers without four digits (ADR-008, ADR-012) refer to
`docs/internal/audits/saas-readiness/decisions.md`, not the global registry.

---

## D-01 — The ranking rule, fixed before any row is ranked

- **Status:** Accepted (merged in #159, `3277e5d`)
- **Date:** 2026-10-13

**Context.** Open work is recorded in four places that do not rank against each other: the dated
audit's findings, the todo files, the Notion page shared with lakira-frontend, and notes in the
frontend's own todos. The repo's rules name no priority source, so each "what's next" was ranked
from scratch, by whoever was asked. Written before the register has an order.
**Decision.** Rows are ordered by these tiers, top first.

1. A route that keeps an audit caveat open, because it blocks a clean GOLD (ADR-008, ADR-012).
2. A P1 or P2 owed to the frontend.
3. A P2 security item.
4. Any other P2.
5. P3.

Within a tier the smaller item comes first. A row's severity is the one its source recorded; where
a grader and a todo disagree, the register shows both and ranks by the higher. A row waiting on a
decision keeps its rank and is marked, so the register shows what is blocked and on whom, and
"what's next" names the top row that is ready. A row whose source records no severity ranks in tier 5
and is marked ungraded; the register lists those for the next dated audit to grade.
**Options considered.** Ranking by size alone, smallest first: rejected, it would bury the one
item that blocks GOLD under a dozen P3 tidy-ups. Ranking by age: rejected, the oldest todos are
the ones nobody needed. A numeric score per row: rejected, it invents precision the sources do not
have and nobody would maintain it. Leaving blocked rows in a separate list: rejected, a row parked
out of sight is how the frontend's questions went unanswered for a week.
**Consequences.** The top of the register can be a row that cannot be worked, and the answer to
"what's next" is then that row as a gap plus the first ready row under it. The rule says nothing
about value to a user of the product; an item moves only when its recorded severity does.

## D-02 — How rows group into fix PRs

- **Status:** Accepted (merged in #159, `3277e5d`)
- **Date:** 2026-10-13

**Context.** Sixty-one rows do not mean sixty-one PRs. Some share a root cause or the same few
lines, and some must not share a PR because one of them needs an audit run to count.
**Decision.** A fix PR takes one row, with these named exceptions.

- **B-08 with B-09:** both are the bootstrap script rewriting by pattern
  ([analysis](analysis-w3-t3-fork-bootstrap.md)).
- **B-07 with B-17,** and B-12 if convenient: all add to or correct the production refusals in
  `zodEnv.ts`.
- **B-02 with B-49:** the same column.
- **B-13 with B-47,** if one spec change is wanted where there would be two, so the frontend syncs
  once.
- **B-10 with B-28 and B-29,** if the lint blocks are opened anyway.

**B-01 goes alone.** It is the one route that keeps a caveat open, and the dated run that follows
it should grade one change, not several.
**Options considered.** One sweep PR for all the P3 rows: rejected, a reviewer cannot hold forty
unrelated changes and a revert would take all of them. Strictly one row per PR: rejected, B-08 and
B-09 would then edit the same twenty lines twice.
**Consequences.** A grouped PR closes several rows, and each row names the PR. The grouping is
advice; a fix's own plan can split a group and should say why.

## D-03 — What is listed and not analysed

- **Status:** Accepted (merged in #159, `3277e5d`)
- **Date:** 2026-10-13

**Context.** The appetite is one session. An in-depth analysis of every row would take several,
and most rows are P3 polish whose todo already says what to do.
**Decision.** Eleven analyses cover fourteen rows: everything in tiers 1 to 4 except B-11, and four
tier 5 rows. B-12 and B-14 are analysed because two independent readers found each. B-13 and B-15
are analysed because the frontend is waiting on them. The other forty-seven rows are listed with
their source and nothing more.

B-11, the parse-error flake, is P2 and not analysed: it is unexplained after three sightings, its
todo records what was tried, and an analysis written from the same evidence would repeat it. It
needs a capture of the failing response, which needs it to happen again.
**Options considered.** Analysing by tier only, all of tiers 1 to 4 and none of tier 5: rejected,
it would leave out the rows the frontend is party to. Analysing nothing and ranking only:
rejected, the owner asked for analysis, and writing them changed what some fixes should be: B-07's
found three values in the repo that a plain minimum length would break.
**Consequences.** A tier 5 row picked up later starts from its todo, not from an analysis.
Seventeen rows carry no severity; the next dated audit is asked to grade them, B-24 first, since
two invites racing is a correctness defect and reads as more than polish.

---

## D-04 — A row waiting on a package release has the state `upstream`

- **Status:** Accepted (merged in #183, `cbb7b87`)
- **Date:** 2026-10-18

**Context.** After `jest-junit` 17 (`npm-audit-findings` D-09), row B-25 holds only findings with
no fix: `braces` under `nodemon`, where npm's only offer is a downgrade, and `sprintf-js` under
`js-yaml` 3, which Jest 30 still reaches. Nothing in this repository can close them. Left `ready`,
the row would stay the answer to "what's next" with no work in it; none of the states the register
defines (`ready`, `owner`, `FE`, `unexplained`) says "waiting on someone else's release".
**Decision.** Add the state `upstream`: waiting on a release of a dependency. "What's next" skips
an `upstream` row as it skips an `owner` row, and reports it as a gap only when the release it
waits for has appeared. Whoever writes a dependency-policy snapshot rechecks every `upstream` row
and moves it back to `ready` when a fix exists. D-01's ranking is unchanged; this decides only
which rows it skips.
**Options considered.** Close B-25 and leave the two findings in the dependency policy's "What
remains" alone: rejected, the register is to list every open item. Mark it `kept on purpose`, as
B-26 is: rejected, B-26 is a choice this repository made and these are not.
**Consequences.** B-25 is no longer the top ready row; B-27 is.

---

## D-05 — A P1 that blocks a clean GOLD ranks in tier 1

- **Status:** Accepted (merged in #197, `b3054cb`)
- **Date:** 2026-10-20

**Context.** The dated run of 2026-10-20 (`saas-reaudit-2026-10-20` D-03 and D-04) closed every
caveat and found two P1 findings in the queue worker, X60 and X62, which block a clean GOLD by
that kit's D-03. D-01 has no tier for them. Tier 1 is "a route that keeps an audit caveat open,
because it blocks a clean GOLD", and they keep no caveat open. Tier 2 is for a P1 owed to the
frontend, and they are not. Read literally, they fall to no tier. Read by severity alone, they
would rank under the frontend's P2 rows and above nothing else.
**Decision.** Tier 1 holds any row that blocks a clean GOLD under the verdict rule of the latest
dated run: a route that keeps a caveat open, or a P1 finding that run held to block a restated
GOLD. The other tiers are unchanged.
**Options considered.** Putting them in tier 2 beside the frontend's rows: rejected, nobody is
waiting on them, and tier 2 means someone is. A new tier between 1 and 2: rejected, D-01's tier 1
already names the reason, blocking GOLD, and the fix is to let the reason decide rather than the
example.
**Consequences.** X60 and X62 head the register as B-74 and B-75, the smaller first. The next
dated run that restates GOLD empties tier 1 again.

---

## D-06 — B-74 with B-75 in one fix PR

- **Status:** Accepted (merged in #198, `4bfaf4e`)
- **Date:** 2026-10-21

**Context.** D-02 gives each row its own fix PR, with named exceptions. B-74 and B-75 are the two
P1 findings in the queue worker that block a clean GOLD (D-05), and only one dated run after both
can restate it. The owner chose to fix them together on 2026-10-21.
**Decision.** Add to D-02's exceptions: **B-74 with B-75**, both the worker's P1 findings, confirmed
by one dated run. Kit `worker-cancel-and-one-connection-per-job`.
**Options considered.** Two PRs, as D-02 says: rejected by the owner; the dated run waits for both
either way.
**Consequences.** One PR moves both rows to Closed. D-01's order is unchanged.

---

## D-07 — B-76 with X2 of B-81 in one fix PR

- **Status:** Accepted (merged in #199, `5818042`)
- **Date:** 2026-10-21

**Context.** B-76 (X1) refuses an unsafe database TLS setting in production. X2, one item of the
P3 row B-81, asks for ADR-0036's production refusals to cover staging. Both change the same
refusal block in `src/config/zodEnv.ts` and the same record, ADR-0036. D-02 already pairs rows that
add to the production refusals ("B-07 with B-17, and B-12").
**Decision.** Add to D-02's exceptions: **B-76 with B-81's X2**. Kit
`database-tls-and-staging-refusals`. B-81 keeps its other items.
**Options considered.** Two PRs: the second would reopen the block and the ADR the first just
amended.
**Consequences.** B-76 moves to Closed; B-81 drops X2 from its list and names the branch.

---

## D-08 — B-80 with X42 to X45 of B-83 and B-73 in one fix PR

- **Status:** Accepted (merged in #201, `66eaf20`)
- **Date:** 2026-10-21

**Context.** B-80 (X40, X41) holds the inner layers' relative paths and `public.ts` imports to
ADR-0074's lists. Four P3 findings of the same run name other forms the boundary lint does not
read: X42, X43 and X44 in B-83, X45 in B-73. All change `eslint.config.mjs` and
`feature-boundaries.lint.test.ts`, and all amend ADR-0074. The owner chose to fix them together on
2026-10-21.
**Decision.** Add to D-02's exceptions: **B-80 with B-83's X42, X43 and X44, and B-73's X45.** Kit
`inner-layers-reach-infrastructure`. B-83 keeps its other items and X43's residual (an aliased
`process`); B-73 keeps its build item.
**Options considered.** Separate PRs: each would reopen the same blocks and the same test, and
ADR-0074 would be amended three times.
**Consequences.** B-80 moves to Closed; B-83 and B-73 drop the folded items and name the branch.

---

## D-09 — B-79 with the stats key of B-82's X11/X21 in one fix PR

- **Status:** Accepted (merged in #202, `5a3addb`)
- **Date:** 2026-10-21

**Context.** B-79 (X20) puts `startDate` and `endDate` into `GET /metric-logs/stats`, so its cache
key must change to name them. That key is one of the three X11/X21 (B-82) found built from raw
`req.query`.
**Decision.** Add to D-02's exceptions: **B-79 with the stats key of B-82's X11/X21.** Kit
`metric-log-stats-in-sql`. B-82 keeps the other two keys and its other items.
**Options considered.** Building the new key from raw `req.query` and fixing it under B-82 later:
the same line written twice.
**Consequences.** B-79 moves to Closed; B-82 names the branch for the stats key.

---

## D-10 — B-78 with B-84 in one fix PR

- **Status:** Accepted (merged in #203, `2c1c098`)
- **Date:** 2026-10-21

**Context.** B-78 (X63, P2) leaves a channel setup failure unhandled. B-84 lists the queue and
lifecycle P3s of the same run: X64 (unroutable publishes), X65 (unflushed exits), X66 (Redis left
open), X67 (a crashed worker drains), X68 (a timed-out publish sent twice), N4 (no request id over
the queue). All are in the publisher, the consumer, the email use cases and the two entry points,
and all need the same broker tests. The owner chose to fix them together on 2026-10-21.
**Decision.** Add to D-02's exceptions: **B-78 with B-84.** Kit `queue-failure-paths`.
**Options considered.** Seven PRs, or B-78 alone: each would reopen the publisher and the broker
test harness.
**Consequences.** B-78 and B-84 move to Closed. A dated run follows the merge.

---

## D-11 — A unit test checks the register against the todo folder

- **Status:** Accepted (#228, `e6f7d4b`)
- **Date:** 2026-10-27
- **Size:** Micro — single commit, no separate kit. Commits carry `refs: register-todo-check`.
  Register row B-60; branch `chore/register-todo-check`.

**Context.** The plan's Risks named the register going stale, and `.claude/rules/workflow.md` had
every "what's next" answer list new todos by hand (B-60). On `dev` at `549e411`, 104 todos: 15
open, 12 of them named in an open row; one was the audit prompt; two were stale, their remainder
fixed by later PRs. A row that moves to Closed drops its Source column, so a finished todo is
usually not named, and should not need to be.
**Decision.** `__tests__/unit/debt-register-todos.test.ts` reads each todo's first `**Status:**`
line. A status starting with `Complete`, `Fixed`, `Closed`, `Done`, `Superseded`, `Resolved` or
`Not a todo` is finished, the words already in use; any other is open. The test fails when a todo
has no status line, when an open todo is not named above `## Closed`, and when a todo named there
is finished or does not exist. Three in-memory cases prove each check fails. The two stale todos
are closed, with what fixed them.
**Options considered.** _Check every todo against the register:_ closed rows do not keep the
filename, so 89 finished todos would need rows they no longer have. _Check by date against "As
of":_ misses a todo filed with an older date, and passes one with no row once "As of" moves past
it.
**Consequences.** Filing a todo without a row, or closing one without saying so in its status,
fails the unit suite. The manual scan in `workflow.md` is gone.
