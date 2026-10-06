# SaaS re-audit, second run of 2026-10-05 — Decisions Log

`D-NN` entries scoped to this kit. ADR numbers without four digits (ADR-001, ADR-002, ADR-008)
refer to `docs/internal/audits/saas-readiness/decisions.md`, not the global registry. "The first
run" is `audit-2026-10-05.md` and its kit, `saas-reaudit-2026-10-05`.

---

## D-01 — Method: the first run's, with every caveat put to an agent and three rules tightened

- **Status:** Accepted
- **Date:** 2026-10-05

**Context.** Since the first run at `deb736d`, three PRs have merged (#138 to #140). Two fix that
run's findings: T1, which reopened caveat C6 (#139, ADR-0059), and T2 (#140). Two files under
`src/` changed (`logger.ts`, `error.ts`), with four scripts and `fork-smoke.yml`. The session
running this audit wrote both fixes. The first run also left two things to put right: C2 was put
to no grader, and one of its findings was false, because the auditor reverted a file on the scratch
fork and then read it.
**Decision.** Reuse the first run's D-01: three agents grade from the tree, told what each finding
claimed and not what its fix does; the main thread runs everything empirical and verifies their
evidence. Three changes.

- Every caveat and every fix gets an agent's grade, C2 included. `security-reviewer` takes C6 and
  T1, ADR-0059 against the code, C3, C5, S9, S13 and T7, and a fresh pass over the two changed
  source files. `code-reviewer` takes C2, given its original text and asked whether a fork is
  still branded as the upstream anywhere, with T2, the script half of S10, T3, and a fresh pass
  over the scripts and the workflow. `architecture-auditor` takes C4 as a regression check
  (nothing under `src/features` changed), R7, R11, T6, T8, and ADR-0059 against the registry and
  the code. C1 is graded by the fork run.
- An agent's grade on a caveat stands unless the main thread refutes it with a reproduction. A
  different reading of the code is not a refutation. Where the two disagree, both are recorded.
- A scratch fork is read before it is touched. Bootstrap's output is inspected on an untouched
  clone, and anything that modifies tracked files is done on another.

**Options considered.** Skipping the agents for the caveats nothing touched (C3, C4, C5): rejected,
C6 was "nothing touched" in the first run and was the one that reopened. Letting the main thread
grade C2, as the first run did by keeping its grade: rejected, the first run's own D-04 asked for a
grader, and the main thread wrote the fix that bears on it. Waiting for a session with no part in
the fixes: not available, and the limit is stated in the audit's header.
**Consequences.** The agents are the same model as the author: independence of context, not of
judgment. S1, S2, C1 and C6 are settled by running code. The run replaces `node_modules` and
creates and removes throwaway containers and scratch clones.

## D-02 — The verdict rule, fixed before the evidence

- **Status:** Accepted
- **Date:** 2026-10-05

**Context.** ADR-008 restates GOLD only when C1 to C6 are closed. The first run's D-02 added S1 and
S2, and its D-03 showed the rule deciding against a restatement on one reopened caveat. This entry
is written before the gates are run or an agent is started.
**Decision.** The first run's rule, unchanged. ADR-001 is evaluated criterion by criterion on its
six commands, with the newer CI gates reported alongside. Clean GOLD requires C1 to C6, S1 and S2
all closed-confirmed, with S1, S2 and C6 each reproduced against running code. One of the eight
open means GOLD WITH CAVEATS, naming it. A new P0 fails ADR-001. A new P1 gets its own entry here,
written when it is found, on whether a restated GOLD is honest with it open. P2 and P3 findings are
filed and do not gate; S9 and S10 are known to be open at P2, and a verdict of GOLD names them. If
the parse-error flake (R4) recurs, the test gate is graded on reruns and the count is stated.
**Options considered.** Loosening the rule now that the last blocker has a fix: rejected, that is
the rule bending to the result one run late. Adding T2 as a ninth condition: rejected, T2 is a P2
finding, and what it bears on, C2, is already a condition and is put to a grader.
**Consequences.** The run can end in GOLD with P2 findings open, and must name them. It can end
without GOLD on one agent grade the main thread cannot refute by reproduction.

## D-03 — The file is `audit-2026-10-05-b.md`

- **Status:** Accepted (approved by the owner at checklist approval, 2026-10-05)
- **Date:** 2026-10-05

**Context.** ADR-002 names each run `audit-YYYY-MM-DD.md` and makes prior runs immutable. This is
the second run on 2026-10-05, and `audit-2026-10-05.md` exists.
**Decision.** The evidence is gathered today, so the file carries today's date and the suffix `-b`.
The kit, the branch and the `refs:` footer use the same slug.
**Options considered.** Waiting a day for `audit-2026-10-06.md`: offered to the owner, not taken.
Overwriting or appending to `audit-2026-10-05.md`: rejected, ADR-002. Dating the file tomorrow:
rejected, the date is when the evidence was gathered.
**Consequences.** A suffix has one precedent, `audit-2026-05-24-independent.md`. Anything that
lists the runs in order must sort `-b` after the plain date, which a plain sort does.

## D-04 — C6 stays open: an error nested in metadata still leaks through two routes

- **Status:** Accepted
- **Date:** 2026-10-06

**Context.** The security agent graded C6 open-progressed. It found the reproduction of T1 closed
and the top-level error path fixed, and named three routes ADR-0059 does not cover. It had no
installed dependencies to read and worked from memory of Winston, so every claim needed a run. The
main thread ran them on the scratch fork, with the real logger in its JSON format and a real
Sequelize `DatabaseError` from a failing statement.

- An error inside a metadata object, with a `%j` or `%o` token in the message, or an error inside
  an array with `%j`: the line carried the email address, the password hash and the SQL text.
  `splat()` formats the argument before key redaction runs, and `reduceLoggedErrors` looks only at
  top-level arguments. `%s` and no token did not leak.
- A container five levels deep holding the error: the same three leaked. `redactObject` returns an
  object at depth 5 untouched.
- A plain object carrying `sql` and `parameters` keys is written as it is. That is metadata no
  term matches, not an ORM error, and no ORM payload arrives that way; it is not counted.

T1 itself is closed: twelve concurrent registrations logged eleven `Client error 409` lines with no
address and no hash, and a body beginning `%j` logged neither the address nor the password.
**Decision.** C6 is open-progressed, on finding U1. The agent's grade stands: two of its three
routes reproduce, and under D-01 a grade is overturned only by a reproduction that refutes it.
**Options considered.** Closing C6 because no call site reaches either route (no message in `src/`
contains a format token, and the three calls that pass `{ err }` use constant messages): rejected.
C6 was written as a latent gap, "nothing logs them today", and was a caveat all the same; the first
run reopened it on the ground that its closure was narrower than claimed; and ADR-0059 itself says
that nothing after its format holds an error object, which these runs show to be untrue. Grading
U1 at P2: not taken, it is P3, since nothing reaches it; the caveat is open regardless of the
priority of what keeps it open.
**Consequences.** Under D-02 this run does not restate GOLD. The fix is to reduce errors wherever
they sit in a call's arguments before `splat()` runs, and to stop passing a deep object through
unreduced; ADR-0059's wording has to be corrected with it.

## D-05 — C2 is graded open by the agent, on a case the owner's decision already accepted

- **Status:** Accepted
- **Date:** 2026-10-06

**Context.** C2 was put to the code-review agent with its original text and its history. It found
a fork made by the documented path rebranded in everything it commits and runs locally, T2
included, and graded C2 open-progressed on one thing: `src/config/app-name.ts:4` still defaults to
`lakira-backend`, the image excludes `.env`, and bootstrap writes `APP_NAME` only to `.env`, so a
fork deployed without `APP_NAME` as a platform variable logs, emails, names its cookie and titles
its served spec as Lakira, and nothing fails closed. Reproduced: the fork's built `app-name.js`,
loaded with no `.env` and no `APP_NAME`, gives `lakira-backend`, `lakira`, `Lakira`; with
`APP_NAME=acme-api` it gives the fork's names.
**Decision.** The agent's grade is recorded as it was given: C2 open-progressed, finding U2 (P2).
The reproduction confirms it, so D-01 leaves the main thread no ground to overturn it. Recorded
beside it: this is the case the owner closed C2 on by decision on 2026-09-24 (`saas-audit-closeout`
D-01), which considered "a fork with no `.env` and no platform variable" by name and accepted it,
and `docs/tutorials/fork-and-rebrand.md` tells the forker to set `APP_NAME` in every deployed
environment.
**Options considered.** Keeping C2 closed-confirmed because of that decision: not taken by the main
thread. Whether a decision of the owner's still holds is the owner's to say, not the auditor's, and
least of all an auditor who wrote the last fix bearing on C2. Treating U2 as outside C2: rejected,
it is C2's own first sentence.
**Consequences.** The verdict does not turn on this, because C6 is open. Two ways to settle it,
both the owner's: reaffirm the 2026-09-24 decision for a dated run to cite, or make the missing
variable loud (a startup warning, or a refusal in production, which that decision rejected for
reasons that may no longer apply now that the tutorial states the requirement).

## D-06 — Grading calls that differ from an agent's or from the first run

- **Status:** Accepted
- **Date:** 2026-10-06

**Context.** D-01 requires each difference to be recorded. An item with no new evidence keeps its
grade (the first run's D-05).
**Decision.**

- The scorecard is unchanged at 50 pass, 11 partial, 4 fail. Log redaction stays Partial, now for
  U1 and not T1. Hardcoded names stays Partial, now for U2 with R12. Bootstrap UX stays Partial,
  now for T3 and S10 and not T2; the code-review agent graded "fork bootstrap works as printed"
  Pass and secret rotation Partial, and the item covers both.
- T2 is closed-confirmed, as the agent graded it, and reproduced.
- C4 is closed-confirmed, as the agent graded it. Its "pending a run" is settled: lint and both
  boundary test files passed in the gate run.
- T3 is wider than the first run recorded: on the first run of the script, a name containing
  "lakira" also double-expands the workflow titles ("Lakira X X Backend CI"). Reproduced. It stays
  P3.
- The security agent could not read `node_modules`, because the clean install was running when it
  started. Its statements about Winston were therefore run, not taken: two held and one did not
  count (D-04).
- JWT auth, rate limiting, DDD layering, manual DI and dead code keep their grades; the agents
  graded them Partial on findings already counted.

**Options considered.** Starting the agents after the install, so the security agent could read the
library: the better order, and noted for the next run.
**Consequences.** Every difference from an agent is in the audit's § 7.
