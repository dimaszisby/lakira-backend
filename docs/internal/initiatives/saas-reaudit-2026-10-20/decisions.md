# SaaS re-audit, dated run of 2026-10-20 — Decisions Log

`D-NN` entries scoped to this kit. ADR numbers without four digits (ADR-001, ADR-002, ADR-008,
ADR-012) refer to `docs/internal/audits/saas-readiness/decisions.md`, not the global registry.
"The last run" is `audit-2026-10-12.md` and its kit, `saas-reaudit-2026-10-12`. Register ids
(`B-NN`) are rows of `docs/internal/initiatives/backend-debt-register/register.md`.

---

## D-01 — Method: the last run's, with four graders and nothing left unread

- **Status:** Proposed
- **Date:** 2026-10-20

**Context.** Since the last run at `5bb4e3a` (its own PR #158, `bf72b58`), 38 PRs have merged,
#159 to #196, to `4a0b21c`: 156 files. They hold a fix for every W finding of the last run and for
many older rows. Sixteen closed register rows say a run is owed: B-01 (C5, W1), B-07 (W2), B-08
(W3), B-09 (T3), B-10 (R11), B-12 (W4), B-16 (W5), B-22 (S13), B-23 (R10), B-27 (W7, part), B-28
(W6), B-30 (R7), B-34 (S15), B-40 (R8), B-45 (T5), B-46 (S12, R13). About thirty more were never
graded by an audit. The session running this audit wrote most of the window. The owner chose, on
2026-10-20, subagent graders as in the runs of 2026-10-05 to 2026-10-12, and a full re-read:
nothing is left "not re-read", the 2026-06-05 rows included (B-61). Written before a gate is run or
a grader is started.

**Decision.** Reuse the last run's D-01 and its three rules: every caveat and every fix gets a
grader's grade; a grader's grade on a caveat stands unless the main thread refutes it with a
reproduction, and a different reading of the code is not a refutation; a scratch fork is read
before it is touched. Graders read the tree and run no code; linting synthetic source on standard
input is allowed, since it writes nothing. They start after `npm ci` has finished. Each is told
what a finding claimed, never what its fix does, and to ignore status notes in the docs, the
register's Closed section and PR bodies. Following ADR-012, each caveat is given with its whole
purpose: a fresh pass, then the named routes one by one. A route outside a list is a new finding
with its own id and severity, and reopens no caveat. The main thread runs every gate and every
reproduction, verifies each grader's cited lines, and originates no grade on a fix or a caveat. A
grade it did not check is marked _(agent)_.

Four graders, in parallel, the window being about three times the last:

- `security-reviewer`: C5 whole, then V3 with W1; C6 whole, as a regression read; the security
  claims of B-07, B-12, B-16, B-22, B-23, B-14, B-18, B-19, B-20, B-21, B-66, B-68, B-06 and B-17;
  a fresh pass over everything that logs, scrubs, limits, parses or authenticates.
- `code-reviewer`, fork and API: C1, C2 and S2 to S4 as regression reads; B-08, B-09, B-27, B-45,
  B-46, B-43, B-44, B-72, B-13, B-24, B-02, B-49; the spec generator and its validator; S12 to S14,
  T4 to T6, U3 and U4; a fresh pass over `scripts/` and the API surface.
- `architecture-auditor`: C4 whole, as a regression read; B-10, B-28, B-29, B-30, B-31, B-32,
  B-34, B-37; R7, R9, R11 to R13 and T8; the ADR registry against the code; the rows of the
  2026-06-05 run (B-61).
- `code-reviewer`, queue, email and process lifecycle: B-39, B-70, B-40, the wiring half of B-23,
  B-38; R8; ADR-0054, 0067, 0069, 0070, 0073 and 0076 against the code; the worker; a fresh pass
  over `src/shared/infrastructure/queue/`, `src/worker.ts`, `src/server.ts` and
  `src/utils/shutdown.ts`.

C1 is graded by the fork run. Every gate runs on Node 24, which the repository pins (`.nvmrc`,
`engines`). This machine has only Node 26 installed, so the run uses the official 24.22.0 build,
checked against nodejs.org's SHA-256 list, from the session scratchpad.

**Options considered.** Three graders, as last time: rejected, one reviewer over 38 PRs of
security, scripts and API would read each at a third of the depth. Leaving rows nothing in the
window touches "not re-read": rejected by the owner. Grading on Node 26: rejected, ADR-001's six
commands have always been graded on the pinned version.

**Consequences.** The graders are the same model as the author: independence of context, not of
judgment, as stated in the audit's header. The run replaces `node_modules`, and creates and removes
throwaway containers and scratch clones. Nothing is written to the owner's Compose stack except
what the checklist's Discovered section records.

## D-02 — The verdict rule, fixed before the evidence

- **Status:** Proposed
- **Date:** 2026-10-20

**Context.** ADR-008 restates GOLD only when C1 to C6 are closed; the run of 2026-10-05 added S1
and S2; ADR-012 names the routes each open caveat closes on. The last run left one open: C5, on
V3, with W1 (the peer address a transaction carries) counted under it by its grader (last run's
D-03). Written before a gate is run or a grader is started.

**Decision.** ADR-001 is evaluated criterion by criterion on its six commands, with the other CI
gates reported beside them. Clean GOLD requires C1 to C6, S1 and S2 all closed-confirmed. For C5
that means V3 with W1, graded closed by its grader **and** reproduced against the built server by
the main thread. The others were confirmed by earlier runs and are regraded here as regression
reads; one found open again counts as open. One condition open means GOLD WITH CAVEATS, naming it.
A route a grader finds outside the lists is a new finding: a P0 fails ADR-001; a P1 gets its own
entry here, written when it is found, on whether a restated GOLD is honest with it open; P2 and P3
findings are filed and named in the verdict and do not gate. The sixteen owed rows and the other
fixes of the window are graded and reported, and are not conditions. If the parse-error flake
(B-11) or the queue test's 401 (B-54) recurs, the test gate is judged on reruns and the count is
stated.

**Options considered.** Making the owed rows conditions: rejected, as for S9 and S10 last time, a
rule that grows with the work cannot be met. Treating a grader's "near closed" as closed: rejected,
only closed-confirmed counts. Letting a reproduction alone close C5 if its grader keeps it open:
rejected, that is the main thread grading its own fix.

**Consequences.** The run can end in GOLD with P2 and P3 findings open, and must name them. It can
end without GOLD on one grader's grade the main thread cannot refute by reproduction.

## D-03 — Two P1 findings from the queue grader, and whether GOLD is honest with them open

- **Status:** Proposed
- **Date:** 2026-10-20

**Context.** Written when the queue grader's report arrived, before either ground was reproduced
and before the other three graders reported. It graded two new findings P1:

- **X60.** `RabbitMQConsumer.cancel()` cancels nothing. The consumer is registered with the raw
  channel's `consume` inside the wrapper's `setup`, so `ChannelWrapper.cancel(tag)` does not find
  the tag and returns without error. On SIGTERM the worker logs "Consumer cancelled", keeps
  taking deliveries through the drain, and closes the channel under handlers still running.
- **X62.** The email handlers hold a transaction's connection and read through the pool with a
  second one (`userRepo.findById` without the transaction, in the verification and reset paths;
  `orgRepo.findById` in the invite path). The pool is Sequelize's default, five, and each of four
  consumers prefetches ten. Five or more concurrent jobs each hold one connection and wait for a
  second, until the acquire timeout fails them all into retry.

D-02 says a new P1 gets its own entry on whether a restated GOLD is honest with it open. The run of
2026-10-03 is the precedent: its two new P1 findings, S1 and S2, were held to block a clean GOLD
although neither was one of C1 to C6.

**Decision.** Follow the precedent. A P1 finding the main thread reproduces, or cannot refute by
reproduction, blocks a restated GOLD, and the verdict names it. A P1 whose ground a reproduction
refutes is recorded with the reproduction and the grader's severity, and does not block. The main
thread does not regrade either severity: P1 is the grader's.

**Options considered.** Holding that only C1 to C6, S1 and S2 can block, since D-02 lists those:
rejected, D-02 itself leaves a P1 to this entry, and the 2026-10-03 precedent treats a new P1 as a
blocker. Lowering X60 or X62 to P2 because neither leaks data: rejected, the main thread
originates no grade.

**Consequences.** If either ground holds, the verdict is GOLD WITH CAVEATS whatever C5's grade is.
Both are reproduced against a throwaway broker and database before the verdict is written.

## D-04 — C5, C4, C6 and C3 close on their named routes; X60 and X62 hold

- **Status:** Proposed
- **Date:** 2026-10-20

**Context.** All four graders reported. The grades that decide the verdict:

- The security grader graded V3 and W1 closed-confirmed and answered "all C5 named routes
  closed: yes", and the same for C6 on V1 and V2.
- The fork and API grader answered yes for C3 on V5.
- The architecture grader graded V4 closed-confirmed and answered yes for C4's named routes. It
  graded C4's whole purpose open-progressed: a domain or application file can still import a
  database connection or an HTTP middleware by relative path (X40, P2), or reach infrastructure
  through another feature's `public.ts` (X41, P2).
- The queue grader graded X60 and X62 P1.

**Decision.** The grades stand as given, and each was reproduced by the main thread:

- V3 and W1: the built server, on Sentry 11.8 with tracing at 1.0, sent six span envelopes and
  one error event to a local listener. None held the peer, host or forwarded address, a token, a
  cookie, an email address or a query string.
- V1: six starts with a rejected URL holding a password printed it on no line. V2: production
  refuses `DB_LOGGING=true`.
- V4: four spellings of the `AppError` import are rejected in a domain file.
- V5: 47 of 47 operations document a 429, and the validator exits 1 on a copy with one removed.
- S1: an unknown metric answered 404 three times and was never stored.

So C5, C6, C4 and C3 are closed-confirmed under ADR-012. X40 and X41 are routes outside C4's named
list: new findings at the grader's P2, and they reopen nothing.

Both P1 grounds were reproduced on a throwaway broker and database:

- **X62:** with twelve verification jobs queued, five connections sat `idle in transaction` for
  the whole wait, the first email arrived after 61 s, and seven jobs failed into retry. That is
  Sequelize's 60 s acquire timeout.
- **X60:** after SIGTERM the worker logged "Consumer cancelled" four times, while the broker
  listed the consumer as attached 1, 2 and 4 s into the drain, until the channel closed.

Neither reproduction refutes its ground, so under D-03 both block a restated GOLD.

**Options considered.** Reading X40 and X41 as listed routes, which would reopen C4: rejected,
ADR-012 names V4 alone for C4, and the grader itself kept them apart. Treating X60 as refuted
because no new send started during the drain: rejected, the prefetch window was full for the
whole drain, so no delivery could start, and the broker shows the consumer was never cancelled.

**Consequences.** For the first time, every caveat of ADR-008 is closed-confirmed on its named
routes, subject to C1 on the fork run and S2. The verdict is still not GOLD: two P1 findings in
the queue worker block it. The main thread's prompt to the architecture grader put T8's claim
beside T7's id. The grader graded T7 from that run's own row, so no grade rests on the error.

## D-05 — Four scorecard items move, each on a grader's grade

- **Status:** Proposed
- **Date:** 2026-10-20

**Context.** The 65-item scorecard read 50 / 11 / 4 for four runs in a row. An item moves only on
new evidence. This run's graders closed the drivers of three Partial items and found a P2 inside a
fourth, all of them reproduced.

**Decision.** Four items change; every other item keeps its grade:

- **2. API, rate limiting per route and user: Partial to Pass.** Its driver, R10 (user limiters
  keyed by IP ahead of auth), was graded closed-confirmed and reproduced. The P3 findings beside it,
  X9 and X26, are tuning, not the item's purpose.
- **4. Security, rate limiting: Partial to Pass**, on R10 as well. **4. Security, HTTPS enforcement
  readiness: Pass to Partial**, on X1: a production database connection may run with TLS
  verification off, and the template ships it off. Category 4 stays at 6 / 2 / 0.
- **10. Architecture, manual DI applied consistently: Partial to Pass.** Its drivers, B-32
  (features reached routers through module state) and S15 (a controller built an unwired feature),
  are closed-confirmed. DDD compliance stays Partial, on X40 and X41 with R7 and R11.
- **11. Forkability, bootstrap UX: Partial to Pass.** Its drivers, T3 and W3, are closed and
  reproduced. Hardcoded names stays Partial on R12.

The total is 53 / 8 / 4.

**Options considered.** Keeping every grade, as the last run did: rejected, three drivers named in
the last run's own table are closed and reproduced. Raising log redaction to Pass now that C6 is
closed: rejected, the grader's whole-purpose pass found X3, a route by which a database value still
reaches the log.

**Consequences.** Category 11 rises to 92%, category 2 to 100% and category 10 to 80%. The
scorecard still has no item that maps onto X60 or X62. Like C3 to C5 before them, they show in
§4 and §8 and not here.
