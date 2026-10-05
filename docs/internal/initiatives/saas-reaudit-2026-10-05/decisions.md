# SaaS re-audit, 2026-10-05 — Decisions Log

`D-NN` entries scoped to this kit. ADR numbers without four digits (ADR-001, ADR-002, ADR-008)
refer to `docs/internal/audits/saas-readiness/decisions.md`, not the global registry.

---

## D-01 — Method: the 2026-10-03 design, with every fix graded by an agent

- **Status:** Accepted
- **Date:** 2026-10-05

**Context.** Since the last run at `582c1b5`, six PRs (#132 to #137) have merged. Five fix findings
of that run (S1; S2 with S3 and S4; the C4 residual, S5 and S6; S7; S8), and each is recorded as
pending a dated run (ADR-002). 25 files under `src/` changed, with one workflow (`fork-smoke.yml`)
and five scripts (`bootstrap-fork.sh` and four OpenAPI scripts). The session running this audit
wrote the S7 and S8 fixes, and the session before it, whose handoff this one works from, wrote the
other three. No fix in the window was written by anyone else.
**Decision.** Reuse `saas-reaudit-2026-10-03` D-01: a delta pass over every caveat and finding, a
fresh pass over what changed, the fork dry-run through the full `npm test`, the Appendix B scans
and a full 65-item re-grade. One change. The main thread does not originate a grade for any fix.
Three agents grade in parallel, from the tree, and are told what each finding claimed, not what the
fix is meant to do: `security-reviewer` (S1, S8, C3, C5, C6, S9 to S13, the fresh security pass),
`architecture-auditor` (C4 with S5 and S6, ADR-0058, R7, R11, S15, the fresh architecture pass)
and `code-reviewer` (S2, S3, S4, S10, S7, S14, the scripts and the workflow). The main thread
verifies each agent's evidence by reading the cited lines or reproducing the behaviour, and runs
everything empirical: the gates, the fork dry-run and the live reproductions. Where the main thread
disagrees with an agent, both positions are recorded with the reason. An item the main thread did
not verify is marked _(agent)_.
**Options considered.** The last run's split, where the main thread grades and agents assist:
rejected, it would have the author's line of sessions grade its own five fixes, which is the
friendly self-audit the independent run of 2026-05-24 was commissioned to correct. Agents only,
with no main-thread verification: rejected, the last two runs both recorded agent claims that did
not survive a read of the cited lines. A fresh session with no handoff: not available to this run,
and the handoff is what carries the queue; the limit is stated in the audit's header.
**Consequences.** The agents are the same model as the author, so this is independence of context
and not of judgment; the audit says so. The empirical evidence does not depend on anyone's
judgment, and the two P1 findings are both settled empirically. The run replaces `node_modules`
(`npm ci`) and creates and removes throwaway containers and two scratch clones.

## D-02 — The verdict rule, fixed before the evidence

- **Status:** Accepted
- **Date:** 2026-10-05

**Context.** ADR-008 restates GOLD only when C1 to C6 are closed. The last kit's D-02 set the rule
for a run and its D-05 then recorded that a restated GOLD would not be honest with S1 or S2 open.
This entry is written before the gates are run or an agent is started.
**Decision.** ADR-001 is evaluated criterion by criterion on its six commands, with the newer CI
gates reported alongside. Clean GOLD requires all of C1 to C6 closed-confirmed, and S1 and S2
closed-confirmed, each of the two reproduced against running code. One of those eight open means
GOLD WITH CAVEATS, naming it. A new P0 fails ADR-001. A new P1 gets its own entry here, written
when it is found, on whether a restated GOLD is honest with it open. P2 and P3 findings are filed
and do not gate. S9 and S10 are known to be open at P2; by this rule they do not block, and a
verdict of GOLD names them so that it does not read as "nothing open". If the parse-error flake
(R4) recurs, the test gate is graded on reruns, and the audit states that call and the count of
runs.
**Options considered.** Deciding once the evidence is in: rejected, a rule written after the result
bends to it. Requiring every P2 closed for GOLD: rejected, ADR-008 names C1 to C6, the last run's
recommendations put the dated run ahead of S7 to S10, and amending ADR-008 is a decision for
`saas-readiness/decisions.md`, not for a run. Dropping S1 and S2 from the rule because they are not
caveats: rejected, D-05 of the last kit made them conditions and nothing since has withdrawn that.
**Consequences.** The run can end in GOLD with P2 findings open, and must name them. It can also
end without GOLD on a single agent grade the main thread cannot overturn by evidence.

## D-03 — C6 is open again at P2: a database error is logged with its bound values

- **Status:** Accepted
- **Date:** 2026-10-05

**Context.** The security agent graded C6 "Partial, open at P2", against the last run's
closed-confirmed. Its reason: `src/shared/middleware/error.ts:105-112` passes the error object to
the logger as metadata; a Sequelize `DatabaseError` carries `sql` and `parameters`; no redaction
term matches either key. The agent could not run it. The main thread did, on the scratch fork with
the real logger in its JSON format and a real failing statement: the line was written with
`parameters: ['not-a-uuid', 'victim@example.com', '$2b$12$…', 'victim']` and the SQL text. A
synthetic `UniqueConstraintError` logged the same way also wrote `fields.email` and
`errors[].value`. The development format prints the message only, which is why this was never
seen. It is reachable from a request. A `UniqueConstraintError` has no `status`, so it takes the
last branch of that `if` and is logged whole before being answered as 409. Twelve concurrent
registrations with one email against the fork's server answered one 201 and eleven 409, and each
409 wrote an `Error Occurred` line holding the address under `fields.email`, `errors[0].value` and
`errors[0].instance.dataValues.email`, and the bcrypt hash of the submitted password among
`original.parameters`. A double-submitted registration form is enough.
**Decision.** C6 is open-regressed at P2, and the finding is T1. The agent's grade stands; the
evidence confirms it.
**Options considered.** A new finding outside C6, the way S8 was handled on 2026-10-03: rejected.
S8 was an address inside message text, which key-based redaction never claimed to cover. This is
metadata, which is exactly what C6 is about, and C6's own text calls its gap "latent: nothing logs
them today". Here something does log them, password hashes included, under keys the pattern
misses. Grading it P1: considered seriously once the race reproduced, and not taken. It writes nothing
a client sees, what is logged is what the same client just submitted, and reading it needs access
to the logs; the agent graded it P2. It is the top item of this run all the same, and since C6 is
open either way the verdict does not turn on the priority. Reading C6 narrowly as the four terms it names, all of
which the pattern now matches: rejected, the 2026-09-29 run reopened C1, C3 and C4 on the ground
that their closures were narrower than claimed, and the same standard applies here in the
direction that does not favour the result.
**Consequences.** Under D-02 one open caveat means GOLD WITH CAVEATS. This run does not restate
GOLD. The fix is small: log the error's name, code and message and not the object, or redact
`sql`, `parameters`, `fields` and `errors`.

## D-04 — S2 is closed; what a fork's spec says about itself is a new P2 finding, and C2 keeps its grade

- **Status:** Accepted
- **Date:** 2026-10-05

**Context.** The code-review agent graded S2 closed-confirmed with a caveat it could not run: the
spec's content depends on `APP_NAME`, and the gate passes on a fork only because the generator
reads the name before `.env` is loaded. Run on the fork: `npm run docs:openapi:check` exits 0, and
the spec file is renamed and staged. The fork's spec is titled "Lakira API" and documents a
`lakira_refresh` cookie, while the fork's running server set `acme-api_refresh`. With `APP_NAME`
exported in the shell the same gate exits 1, with a diff on the title and the cookie name. No
workflow sets `APP_NAME`, and `Fork Smoke` is green.
**Decision.** S2 is closed-confirmed: the finding was that the gate cannot pass, and it passes as
printed and in CI. The content mismatch is T2, P2. C2 keeps the last run's grade, closed by
decision with a residual; the residual is no longer only the title, and T2 carries it.
**Options considered.** Keeping S2 open on the caveat: rejected, it is a different defect with a
different fix, and S2's reproduction now passes. Reopening C2, whose text names OpenAPI among the
things a fork brands as Lakira: not taken, and this is the closest call of the run. The last run
graded the title alone as a P3 residual of a caveat closed by decision, no agent was asked to grade
C2 in this run, and the verdict does not turn on it because C6 is open. It is recorded here so the
next run or the owner can decide it with C2 put to a grader explicitly.
**Consequences.** A fork publishes a spec that names the wrong cookie until T2 is fixed. The next
run should assign C2 to an agent.

## D-05 — Grading calls that differ from an agent's or from the last run

- **Status:** Accepted
- **Date:** 2026-10-05

**Context.** D-01 requires each difference to be recorded. The scorecard keeps the last run's rule
(its D-06): an item with no new evidence keeps its grade, so the cards stay comparable.
**Decision.**

- Error envelope (category 2) moves from Partial to Pass. Its only reason was S1, which is
  reproduced closed; the security agent graded error handling Pass.
- Log redaction (category 4) stays Partial, now for T1 and not S8.
- DDD compliance (category 10) stays Partial. C4 is closed, and the architecture agent kept the
  item Partial on R7 and R11, which are unchanged.
- Bootstrap UX (category 11) stays Partial, now for T2, T3 and S10 and not S2 to S4. The
  code-review agent graded it Partial.
- OpenAPI documentation stays Pass although the code-review agent graded contract documentation
  Fail on S14. S14 was known and graded P3 on 2026-10-03 and nothing about it changed.
- JWT auth, input validation, manual DI, handler logic, dead code and naming keep their grades.
  The agents graded several of them Partial on findings that were already known and already
  counted, or on new P3 items listed in the audit's § 6.
- Testing stays 6 of 6. The parse-error flake (R4) was seen once on 2026-10-05, in a gate run for
  #137 and not in this run; it has never changed this grade, and the test gate here was green on
  the first run.
- T3 is P3 as the agent graded it, though it was reproduced: it needs a fork name containing
  "lakira" and a second run of the script.

**Options considered.** Taking every agent grade as given: rejected, it would move seven items on
findings the last run already weighed, and the scorecards would stop being comparable.
**Consequences.** The scorecard is 50 pass, 11 partial, 4 fail. Every difference from an agent is
in the audit's § 7.
