# SaaS re-audit, dated run of 2026-10-12 — Decisions Log

`D-NN` entries scoped to this kit. ADR numbers without four digits (ADR-001, ADR-002, ADR-008,
ADR-012) refer to `docs/internal/audits/saas-readiness/decisions.md`, not the global registry.
"The last run" is `audit-2026-10-10.md` and its kit, `saas-reaudit-2026-10-10`.

---

## D-01 — Method: the last run's, with ADR-012 applied

- **Status:** Accepted
- **Date:** 2026-10-12

**Context.** Since the last run at `41da6a6`, seven commits have merged (`0fc64dc..5bb4e3a`), after that
run itself (#150): the five fixes ADR-012 names (#151 for V1 and V2, #152 for V3, #153 for V4,
#154 for V5), a lint rule for import forms the boundary rules cannot read (#155), and the fixes
for S9 (#156) and S10 (#157). Eleven paths under `src/`, `scripts/` and the root config changed.
The session running this audit wrote every one of them. Written before a gate is run or an agent
is started.
**Decision.** Reuse the last run's D-01. Three agents grade from the tree, told what each finding
claimed and not what its fix does, and told to ignore status notes in the docs. They start after
`npm ci` has finished and run no code. The main thread runs everything empirical and verifies
their evidence. The three rules stand: every caveat and every fix gets an agent's grade; an
agent's grade on a caveat stands unless the main thread refutes it with a reproduction, and a
different reading of the code is not a refutation; a scratch fork is read before it is touched.
One change, from ADR-012: each grader is given a caveat's whole purpose and makes a fresh pass,
then grades the named routes one by one. A route outside the list is reported as a new finding
with a severity, and reopens no caveat.

The assignments. `security-reviewer`: C6 whole, then V1 and V2; C5 whole, then V3; C3 whole, then
V5; S9; the Compose half of S10; ADR-0059 against the code; a fresh pass over the changed files
that log, scrub or probe. `code-reviewer`: the script half of S10; C2 and S2 to S4 as regression
reads, since bootstrap changed; T3; the spec generator and its validator; a fresh pass over the
changed scripts. `architecture-auditor`: C4 whole, then V4; the import-form rule of #155; the ADR
registry; where the new shared modules sit. C1 is graded by the fork run.

Three fixes were made after their own PR's review and were never graded: the second version of
the Sentry scrubber (#152), the `createRequire` selector (#155), and the three bootstrap fixes
made after the review of #157. Each is put to its grader as a claim to test.
**Options considered.** Telling the graders which routes ADR-012 lists and nothing else: rejected,
ADR-012 keeps the wide reading as the standard a grader searches against. Withholding the three
ungraded fixes: rejected, a finding the auditor knows of and keeps from the grader is a
self-graded verdict by omission. Waiting for a session with no part in the fixes: not available,
and the limit is stated in the audit's header.
**Consequences.** The agents are the same model as the author: independence of context, not of
judgment. The run replaces `node_modules` and creates and removes throwaway containers and
scratch clones.

## D-02 — The verdict rule, fixed before the evidence

- **Status:** Accepted
- **Date:** 2026-10-12

**Context.** ADR-008 restates GOLD only when C1 to C6 are closed; the run of 2026-10-05 added S1
and S2; ADR-012 names the routes each open caveat closes on. Written before a gate is run or an
agent is started.
**Decision.** ADR-001 is evaluated criterion by criterion on its six commands, with the newer CI
gates reported alongside. Clean GOLD requires C1 to C6, S1 and S2 all closed-confirmed. For the
four caveats the last run left open that means: C6 on V1 and V2, C5 on V3, C4 on V4, C3 on V5,
each graded closed by its agent **and** reproduced against running code by the main thread. One
listed route graded not fixed means GOLD WITH CAVEATS, naming it. A route a grader finds outside
the lists is a new finding: a P0 fails ADR-001; a P1 gets its own entry here, written when it is
found, on whether a restated GOLD is honest with it open; P2 and P3 findings are filed and named
in the verdict and do not gate. S9 and S10 are not conditions: they are P2 findings whose fixes
are graded and reported. If the unexplained `metric-settings` integration failure seen once on
2026-10-11 recurs, or the parse-error flake (R4), the test gate is graded on reruns and the count
is stated.
**Options considered.** Counting S9 and S10 as conditions now that they are fixed: rejected, the
rule would grow with the work and no run could meet it. Treating an agent's "near closed" as
closed: rejected, the grade is open-progressed or closed-confirmed, and only the second counts.
Letting a reproduction alone close a route its agent kept open: rejected, that is the main thread
grading its own fix.
**Consequences.** The run can end in GOLD with P2 and P3 findings open, and must name them. It can
end without GOLD on one agent grade the main thread cannot refute by reproduction.

## D-03 — C6, C4 and C3 close; C5 stays open on its grader's grade

- **Status:** Accepted
- **Date:** 2026-10-12

**Context.** The three agents reported. The security agent graded V1, V2 and V5 closed-confirmed
and answered "all named routes closed" yes for C6 and C3. The architecture agent graded V4
closed-confirmed. The security agent graded V3 open-progressed and answered no for C5: every field
V3 named is cleaned and all three hooks are wired, but with tracing sampled the root span's
`net.peer.ip` and `net.host.ip` are not on the scrubber's drop list and reach Sentry in a
transaction. It read that from the SDK's source and had not run it.
**Decision.** The grades stand as given. V1, V2, V4 and V5 were each reproduced closed by the main
thread, so C6, C4 and C3 are closed-confirmed under D-02. For V3 the main thread ran the built
server with tracing on against a local listener: the one transaction captured held
`"net.peer.ip":"::ffff:127.0.0.1"` and `"net.host.ip"`. The grader's ground is reproduced, not
refuted, so C5 stays open-progressed at P2 and the verdict is GOLD WITH CAVEATS, naming C5.

V3's text lists five fields and says transactions bypass the hook. The peer address is none of the
five. The grader was told ADR-012's rule and still placed it under V3, as what a transaction
carries, and also listed it as a new finding. The main thread does not re-read that into "a route
outside the list": that would be the author moving its own fix across the line that decides the
verdict. It is recorded as W1, counted under V3.
**Options considered.** Calling the peer address a new finding and closing C5: rejected, as above.
Asking the grader a second time which side of the line it meant: rejected, its report answers the
question it was asked ("all C5 named routes closed: no"), and a second question after the result
is known is pressure. Fixing the drop list on this branch and regrading: rejected, a run does not
fix what it finds, and a fix graded in the run that made it is self-graded.
**Consequences.** One caveat blocks a clean GOLD where four did. The fix is a few names on one
pattern; closing C5 still needs another dated run. The architecture agent's whole-purpose pass on
C4 found the five domain files that import the application layer; that is R11, already on file,
and under ADR-012 it reopens nothing.

## D-04 — New findings are filed, none gates; the scorecard does not move

- **Status:** Accepted
- **Date:** 2026-10-12

**Context.** The graders reported findings outside the named routes. Two were graded P2 and are
new: `JWT_SECRET` accepts any non-empty value, in production too (W2); and bootstrap leaves
`.env.test` on a different login, and says it copied the password, when `DB_USER` in a hand-made
`.env` is not the template's (W3). Both were reproduced. The rest are P3. No agent graded
anything P0 or P1. Two older rows were re-graded upward by an agent: T3 and R11, each called P2.
**Decision.** No finding gets a P1 entry, because none was graded P1; D-02 needs nothing more. W1,
W2 and W3 each get a todo. T3 and R11 keep their ids and are reported with the agent's severity
beside the one on file. The 65-item scorecard keeps every grade: the security item on log
redaction stays Partial, because the grader's whole-purpose pass still found SQL values in the
development log and unscanned message text, both accepted by record and neither a named route;
forkability's bootstrap item stays Partial on T3 and W3.
**Options considered.** Raising the log-redaction item to Pass now that C6 is closed: rejected, the
caveat closes on its named routes (ADR-012) and the scorecard item is graded on the whole purpose.
Treating W2 as a P1 because it is a secret's strength: rejected, the grader gave P2 and the main
thread originates no grade; it is named first among the new findings.
**Consequences.** The verdict names C5 and three P2 findings. The scorecard reads 50 / 11 / 4 for
the fourth run in a row, which is a limit of the scorecard: it has no item that maps onto C3, C4
or C5 alone.
