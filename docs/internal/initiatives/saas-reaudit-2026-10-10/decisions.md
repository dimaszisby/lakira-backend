# SaaS re-audit, dated run of 2026-10-10 — Decisions Log

`D-NN` entries scoped to this kit. ADR numbers without four digits (ADR-001, ADR-002, ADR-008)
refer to `docs/internal/audits/saas-readiness/decisions.md`, not the global registry. "The last
run" is `audit-2026-10-05-b.md` and its kit, `saas-reaudit-2026-10-05-b`.

---

## D-01 — Method: the last run's, with the agents started after the install

- **Status:** Accepted
- **Date:** 2026-10-10

**Context.** Since the last run at `747d4b3`, nine commits have merged (`8c1948c..41da6a6`). Three
fix what that run's graders kept open: U1 under caveat C6 (#142), U2 under caveat C2 (#144), and
the cache key the U1 grader then kept C6 open on (#146). The rest are a dependency bump (#143),
three analytics fixes (#145, #147, #149) and one empty merge (#148). Twenty paths under `src/`,
`scripts/` and the lockfile changed. The session running this audit wrote every one of them.
**Decision.** Reuse the last run's D-01. Three agents grade from the tree, told what each finding
claimed and not what its fix does, and told to ignore status notes in the docs. The main thread
runs everything empirical and verifies their evidence. The three rules stand: every caveat and
every fix gets an agent's grade; an agent's grade on a caveat stands unless the main thread refutes
it with a reproduction, and a different reading of the code is not a refutation; a scratch fork is
read before it is touched. Two changes.

- The agents start after `npm ci` has finished, so they can read the installed libraries. The last
  run's security agent started during the install and could not (its D-06).
- The analytics fixes sit outside every caveat, so they get a regression read from the code-review
  agent and not a caveat grade.

The assignments. `security-reviewer`: C6 in full, ADR-0059 against the code, C3, C5, S9, S13, T7,
a fresh pass over the changed source files that log or cache, and one claim put to it as a claim,
the todo that a rejected connection URL is printed at startup. `code-reviewer`: C2 with its
original text, ADR-0060 against the code, T3, the script half of S10, and a fresh pass over
`app-name.ts`, the changed scripts and the analytics fixes. `architecture-auditor`: C4 as a
regression check, the ADR registry, R7, R11, T6, T8, S15, and where the new shared modules sit. C1
is graded by the fork run.
**Options considered.** Skipping the agents for the caveats nothing touched: rejected, as in the
last run, C6 was "nothing touched" once and was the one that reopened. Keeping the startup-URL todo
from the security agent, since this session filed it: rejected, a finding the auditor knows of and
withholds from the grader is a self-graded verdict by omission. Waiting for a session with no part
in the fixes: not available, and the limit is stated in the audit's header.
**Consequences.** The agents are the same model as the author: independence of context, not of
judgment. S1, S2, C1, C2 and C6 are settled by running code. The run replaces `node_modules` and
creates and removes throwaway containers and scratch clones.

## D-02 — The verdict rule, fixed before the evidence

- **Status:** Accepted
- **Date:** 2026-10-10

**Context.** ADR-008 restates GOLD only when C1 to C6 are closed. The run of 2026-10-05 added S1
and S2, and the last two runs each showed the rule deciding against a restatement on one caveat a
grader kept open. This entry is written before a gate is run or an agent is started.
**Decision.** The last run's rule, unchanged. ADR-001 is evaluated criterion by criterion on its
six commands, with the newer CI gates reported alongside. Clean GOLD requires C1 to C6, S1 and S2
all closed-confirmed, with S1, S2 and C6 each reproduced against running code. One of the eight
open means GOLD WITH CAVEATS, naming it. A new P0 fails ADR-001. A new P1 gets its own entry here,
written when it is found, on whether a restated GOLD is honest with it open. P2 and P3 findings are
filed and do not gate; S9 and S10 are known to be open at P2, and a verdict of GOLD names them. If
the parse-error flake (R4) recurs, the test gate is graded on reruns and the count is stated.

C2 is also reproduced against running code this time, on the fork's production image, because its
fix is graded for the first time. That is evidence for the grader's grade, not a ninth condition:
C2 is already one of the eight.
**Options considered.** Loosening the rule now that every open caveat has a fix: rejected, that is
the rule bending to the result. Treating an agent's "near closed" as closed: rejected, the grade is
open-progressed or it is closed-confirmed, and only the second counts.
**Consequences.** The run can end in GOLD with P2 findings open, and must name them. It can end
without GOLD on one agent grade the main thread cannot refute by reproduction.

## D-03 — Four caveats stay open on their graders' grades; C2 is closed

- **Status:** Accepted
- **Date:** 2026-10-10

**Context.** The three agents reported. C2 came back closed-confirmed. C6, C5, C3 and C4 each came
back open-progressed, two of them (C5 and C3) on caveats the last three runs carried as closed.
D-01 lets the main thread overturn a caveat grade only with a reproduction that refutes it, so
each ground was run.

- **C6.** The security agent found the four named routes closed (a database error, U1, the cache
  key, and rows, bodies and validation messages) and kept the caveat open on routes nobody had
  named. Two reproduce. A rejected `REDIS_URL`, `RABBITMQ_URL` or environment database URL is
  printed whole at startup, password included, twice, in development and in production (V1). With
  `DB_LOGGING=true` and `LOG_LEVEL=debug`, a login wrote the SQL statement with the email address
  inlined (V2); production does not refuse that pair.
- **C5.** `scrubSentryEvent`, given an event with an address in `request.url`, `query_string`,
  `user`, a breadcrumb and an exception value, returned all five unchanged; it masked the headers
  and the body (V3). This is finding T7 of 2026-10-05, which earlier runs carried beside a closed
  C5. The agent read it as C5's own text, "strip secrets before egress", and graded the caveat.
- **C3.** The envelope is one shape everywhere. The committed spec documents a 429 on 7 of 47
  operations, while the app-wide limiter can answer 429 on any of them (V5). Counted.
- **C4.** The rule that keeps `AppError` out of the domain layer rejects `@/utils/AppError.js` and
  a relative path, and lets `@utils/AppError.js` through; it has no negative case in either test
  file, and `src/shared/domain` does not carry it (V4). Linted the way the repo's own test drives
  ESLint: lines 1, 2 and 5 of five spellings rejected, 3 and 4 not.

**Decision.** All four grades are recorded as given. Each reproduction confirms its grade, so
there is nothing to overturn. C2 is recorded closed-confirmed, as graded, and reproduced: the
fork's production image, started with no `APP_NAME`, logs `service` as `acme-api`.
**Options considered.** Holding C5 and C3 at closed because earlier runs graded them so on the
same code: rejected, that is the main thread overruling a grader by a different reading, which
D-01 names as not a refutation. Treating V1 as outside C6 because it is `console.error` and not
the logger: rejected, the agent was asked and answered that it bears on C6, and a password on
stderr reaches the same collector. Marking V2 down because it needs two settings: recorded in its
severity, not in the grade.
**Consequences.** Under D-02 the verdict is GOLD WITH CAVEATS, naming C6, C5, C4 and C3. The
caveat list widened in this run although every fix in the window did what it was written to do.
That is the fourth run in a row in which a grader given a caveat's whole purpose found a route
its last fix did not reach.

## D-04 — Grading calls that differ from an agent's or from the last run

- **Status:** Accepted
- **Date:** 2026-10-10

**Context.** D-01 requires each difference to be recorded. An item with no new evidence keeps its
grade.
**Decision.**

- The scorecard is unchanged at 50 pass, 11 partial, 4 fail. Log redaction stays Partial, now for
  V1 and V2 and not U1. Hardcoded names stays Partial for R12 alone, U2 being closed. No item
  maps one to one onto C3, C4 or C5, and the items they touch were already Partial or rest on
  more than the reopened part.
- U1 and U2 are closed-confirmed, as graded, and reproduced.
- V1 was known to this session before the run: it filed the todo on 2026-10-08. It was put to the
  security agent as a claim, and the agent confirmed it and tied it to C6. The audit says so.
- The security agent graded S13 and C3 at P3 and C5 at P2. Those severities are recorded as given.
- The architecture agent's three "violations of rule intent" (two analytics queries reading
  config, one domain file taking a type from another feature's `public.ts`) are not counted
  against C4: the agent itself says no enforced rule is broken. They are in V6.
- ADR-0022 is recorded as stale `Proposed`, on the agent's reading; not re-read here.
- The integration count rose from 220 to 226 passed and the unit count from 805 to 885; the
  contract gate generated 1442 cases against 1441, with the same seed.

**Options considered.** Raising Sentry or the architecture test to a scorecard change: rejected,
the scorecard has no item for either alone.
**Consequences.** Every difference from an agent is in the audit's § 7.
