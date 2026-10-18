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

- **Status:** Proposed
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
