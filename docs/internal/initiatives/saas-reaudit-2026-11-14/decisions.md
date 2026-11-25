# SaaS re-audit, dated run of 2026-11-14 — Decisions Log

`D-NN` entries scoped to this kit. ADR numbers without four digits (ADR-001, ADR-002, ADR-008,
ADR-012) refer to `docs/internal/audits/saas-readiness/decisions.md`, not the global registry.
"The last run" is `audit-2026-10-20.md` and its kit, `saas-reaudit-2026-10-20`. Register ids
(`B-NN`) are rows of the frozen `docs/internal/initiatives/backend-debt-register/register.md`.

---

## D-01 — The verdict rule, fixed before the evidence

- **Status:** Accepted (approved by the owner in the plan, 2026-11-14)
- **Date:** 2026-11-14

**Context.** ADR-008 restates GOLD when C1 to C6 are closed; the run of 2026-10-03 added S1 and
S2; ADR-012 names the routes each caveat closes on. The last run confirmed all eight closed and
held GOLD back on two P1 findings, X60 and X62 (its D-03, D-04). Both are recorded fixed in #198
and no run has seen the fix. Written before a gate is run or a grader is started.

**Decision.**

1. **ADR-001** is evaluated criterion by criterion on its six commands, on Node 24 after a clean
   `npm ci`, with the other CI gates reported beside them. A failed criterion means the repository
   is not fork-ready and the verdict says which.
2. **Clean GOLD requires ten conditions, each closed-confirmed:** C1 to C6, S1, S2, X60 and X62.
3. **X60 and X62** are closed-confirmed only when the queue grader, told the claim and not the
   fix, grades them closed **and** the main thread reproduces them closed on a throwaway broker
   and database with the last run's own reproductions:
   - X62: more verification jobs queued at once than the pool holds, at the shipped pool size and
     again with the pool set below the job count, so a larger default cannot pass it. Closed means
     no connection sits `idle in transaction` waiting on a second, and no job fails into retry on
     the acquire timeout.
   - X60: SIGTERM with the prefetch window full. Closed means `rabbitmqctl list_consumers` shows
     no consumer once the worker says it cancelled, and in-flight work finishes.

   Either half missing means open.

4. **C1 to C6, S1 and S2** are regraded as regression reads, C1 by the fork run, each against its
   named routes (ADR-012). One found open on a named route counts as open. A route outside a list
   is a new finding with its own id and severity, and reopens nothing.
5. **A new finding:** a P0 fails ADR-001. A P1 that the main thread reproduces, or cannot refute
   by reproduction, blocks a restated GOLD and is named in the verdict; a P1 whose ground a
   reproduction refutes is recorded with the reproduction and the grader's severity, and does not
   block (the precedent of S1 and S2, and of the last run's D-03). P2 and P3 findings are filed
   and named in the verdict, and do not gate.
6. **The six P2 findings of the last run** (X1, X20, X40, X41, X61, X63) and every other owed row
   are graded and reported, and are not conditions. One found not fixed is reported open at its
   severity, with an issue.
7. **Who grades.** A grader's grade stands unless the main thread refutes it with a reproduction;
   a different reading of the code is not a refutation. The main thread originates no grade on a
   fix or a caveat, and regrades no severity. Only closed-confirmed counts: "near closed" is open.
8. **The test gate.** Green on the first run is green. If the first run fails only in a test an
   open flake issue names (#243, #252, #253), the gate is judged on two reruns and the count is
   stated; a failure seen twice is a failure.
9. **The scorecard.** An item moves only on new evidence: a grader's grade on its driver, or a
   new finding, reproduced where it can be run.

**Outcomes.** All ten conditions closed-confirmed, ADR-001 passing, no unrefuted P1: **GOLD**,
restated, naming every open P2 and P3. Otherwise **GOLD WITH CAVEATS**, naming what blocks.

**Options considered.** Making the six P2 fixes conditions: rejected, ADR-012 lets GOLD stand with
P2 findings open and named, and a rule that grows with the work cannot be met. Letting the
reproduction alone close X60 or X62: rejected, the last run refused the same for C5. Writing the
P1 rule only when a P1 arrives, as last time: rejected, the precedent is now set twice, and
fixing it first leaves nothing to decide in sight of the result.

**Consequences.** The run can restate GOLD with P2 and P3 findings open. It can end without GOLD
on one grader's grade the main thread cannot refute.

## D-02 — Method: the last run's, with the graders on this session's model

- **Status:** Accepted (approved by the owner in the plan, 2026-11-14)
- **Date:** 2026-11-14

**Context.** The window is `b3054cb..6a0eb2a`: 51 commits, #198 to #298, 531 files, 152 under
`src/`. The frozen register marks thirteen closed rows "a run is owed", five "partly" or "not
confirmed", and fourteen "not graded by an audit"; fifteen issues closed after the freeze were
never graded either. The session running this audit wrote none of the window. Written before a
gate is run or a grader is started.

**Decision.** Reuse the last run's D-01 and its rules. Every caveat and every fix gets a grader's
grade. Graders read the tree and run no code; linting synthetic source on standard input is
allowed, since it writes nothing. They start after `npm ci` has finished. Each is told what a
finding claimed, never what its fix does, and to ignore status notes in the docs, the register's
Closed section, kit decision logs, PR and issue bodies, git history and its own agent memory. An
ADR is read as a claim, after the findings are graded from the code. Following ADR-012, each
caveat is given with its whole purpose: a fresh pass, then the named routes one by one. A scratch
fork is read before it is touched. The main thread runs every gate and every reproduction,
verifies each grader's cited lines, and originates no grade on a fix or a caveat. A grade it did
not check is marked _(agent)_.

The graders run on this session's model: the agent files default to another, and the call
overrides it. The prompts are files, so what each grader was told can be read afterwards. New
finding ids are `Y`: Y1 to Y19 security, Y20 to Y39 fork and API, Y40 to Y59 architecture, Y60 to
Y79 queue and lifecycle.

Four graders, in parallel:

- `security-reviewer`: C5 with V3 and W1, C6 with V1 and V2, S1; X1 with X2, X61, X3 to X6, X12 to
  X14, X26; B-64, B-63, B-98, B-99, #290; the open rows X7 to X10, B-17's rest, S10 and #238;
  ADR-0036, 0082, 0088, 0089, 0091, 0096 and the security side of 0083; categories 1 and 4; a
  fresh pass over everything that logs, scrubs, limits, parses or authenticates.
- `code-reviewer`, fork and API: C1 by reading, C2, C3 with V5, S2 to S4; X20, S14, B-65, X22 to
  X25, X27, X28, X11 and X21, W7's rest, B-90, B-50, B-51, B-52, B-53, B-56, B-69, B-100, B-71,
  R13's rest, #250; ADR-0079, 0083, 0093; categories 2, 6, 7 and 11; a fresh pass over `scripts/`,
  the API surface and the spec generator and validator.
- `architecture-auditor`: C4 with V4; X40 to X45, B-73, X46 to X52, R11's rest, B-88, T6, R7, R9,
  N11, F5, ADR-0037; the registry, 0001 to 0096; ADR-0078, 0084, 0085 and 0092; the rules files
  against the code; categories 3, 9 and 10; a fresh pass over all of `src/`.
- `code-reviewer`, queue, email, lifecycle, CI and deployment: X60 and X62 first; X63 to X68, N4,
  B-38's worker half, V6, U3, N8, N9, B-85, B-89, B-86, #272, B-67, #286; the open rows N6, N7 and
  the flakes #243, #252, #253; ADR-0076 decision 3, 0077, 0080, 0081, 0086, 0087, 0090, 0093's
  queue side, 0094, 0095; categories 5 and 8; a fresh pass over the queue, both entry points,
  shutdown, the workflows and the image.

C1 is graded by the fork run. Every gate runs on Node 24.22.1, the official build kept in
`.git/tools/`, since this machine's own Node is 26.

**Options considered.** Three graders: rejected, as last time. Leaving the "not graded" rows out,
since the handoff names only the owed ones: rejected, the last run recorded B-50, B-52 and B-69 as
unassigned, and a row nobody grades stays unknown. Giving CI and deployment to the fork and API
grader: rejected, its lane already holds four scorecard categories.

**Consequences.** Independence is of session and of context. The graders share a model with this
session, and nothing here measures whether that matters. The run replaces `node_modules`, and
creates and removes throwaway containers and scratch clones.

## D-03 — A confirmation is recorded in the audit, not in the frozen register

- **Status:** Accepted (approved by the owner in the plan, 2026-11-14)
- **Date:** 2026-11-14

**Context.** The last run wrote "Yes, A1020" into the register's "Confirmed by an audit" column
and closed the todos it settled. The register was frozen on 2026-10-29, and ADR-0085 makes it and
the dated todos records: rows are as they stood, and nothing new is written to either.
`open-work-records.test.ts` holds that in the unit gate.

**Decision.** This run edits neither. A fix confirmed or refuted is recorded in the dated audit's
§ 4, by register id and issue number. A fix found not to hold, and every new finding, becomes a
GitHub issue, labelled by the register's D-01 tiers and D-12, filed by the owner. The live
documents that carry the verdict are updated as before: `FINAL-AUDIT-SUMMARY.md`, the audit
folder's `README.md`, `SAAS-BASE-CHECKLIST.md` and the `CLAUDE.md` audit paragraph.

**Options considered.** Filling the register's last column once more: rejected, a frozen record
that keeps changing is not frozen, and the next reader cannot tell which cells are as they stood.
A new "confirmed" table beside the register: rejected, it would be a second copy of the audit's
§ 4.

**Consequences.** The register's "Not yet; a run is owed" cells stay as written, and are true of
the day it was frozen. Whoever asks whether a row was confirmed reads the latest dated audit.

## D-04 — The test gate failed three times on this machine, and the cause is the audit's own setup

- **Status:** Accepted (the owner's reading, 2026-11-22; see the Decision)
- **Date:** 2026-11-16, decided 2026-11-22

**Context.** Written when the third `npm test` run came back, before any grader's report was
complete and before a reproduction of X60 or X62 was run. On Node 24.22.1 after the clean install,
`npm test` exited 1 three times out of three. The unit suite passed each time (1786 tests). The
integration suite failed one test each time, a different one, with 327 passing and 7 skipped:

| Run | Test                                                                | Error                                   |
| --- | ------------------------------------------------------------------- | --------------------------------------- |
| 1   | `metric-log-stats.test.ts`, "counts only the caller's own logs"     | `socket hang up`                        |
| 2   | `organization-membership.test.ts`, "lists the single personal …"    | `POST /auth/register` answered `404 {}` |
| 3   | `PasswordResetEmailQueue.integration.test.ts`, "retries a failed …" | `POST /auth/register` answered `404 {}` |

The first run shared the machine with this run's scratch install and build. The other two ran
with nothing else running. No access-log line for a 404 on register exists in runs 2 and 3: the
application did not answer those requests.

The cause was then reproduced. The integration tests call `request(app)` from supertest, which
starts a server on port 0, on every interface, for each request, and sends the request to
`127.0.0.1`. On macOS a wildcard listen can be given a port that a loopback-only listener already
holds, and a request to `127.0.0.1` then reaches the other process:

- A wildcard listen on 55432, 56379 and 55672, the throwaway Postgres, Redis and RabbitMQ of this
  run, succeeded. A request to `127.0.0.1` on each failed with `socket hang up`, `socket hang up`
  and `Parse Error: Expected HTTP/, RTSP/ or ICE/`: the two errors issue #243 names.
- Of 60,000 port-0 wildcard listens, 36 were given one of the ten ports a loopback-only listener
  held at the time: the four this run's containers publish (55432, 55672, 55673, 56379) and six
  held by other programs on the machine, some of which answer HTTP. That is about one listen in
  1,700, and a full integration run makes that many requests or more.

The ports the handoff named for the throwaway containers sit inside the range macOS assigns from
(49152 to 65535), so the audit's own services are four of the ten. CI runs on Linux, which does
not hand out a port this way, and is green on `6a0eb2a` in every workflow.

D-01 item 8 says a first-run failure in a test an open flake issue names is judged on two reruns,
and "a failure seen twice is a failure". Read by its letter, the gate failed: `404 {}` on register
was seen twice. Read by its purpose, the gate was never measured: each failure is a request that
reached another process.

**Decision.** The main thread took no decision: it does not reinterpret a rule the owner approved
in sight of the result. It recorded the three local runs as they were, measured `npm test` three
more times in a Linux container laid out like CI's integration job, with no other listener in its
network namespace, and put the reading to the owner with both sets of numbers. In the container,
on Node 24.22.3, `npm test` exited 0 three times out of three: unit 1786 passed, integration 328
passed and 7 skipped, each time.

The owner chose on 2026-11-22: **ADR-001 criterion 2 is judged on the three container runs and on
CI**, which is green on `6a0eb2a` in every workflow. The three host runs are recorded with their
cause. This is a reading made after the result, and the audit says so. By then the owner had
merged #303 (`21a7390`), which makes the tests listen on loopback, and closed #243, #252 and #253
on 2026-11-20. Both are after the evidence commit and outside the window.

**Options considered.**

- _The letter: criterion 2 of ADR-001 fails, and the repository is not fork-ready on this run._
  It is what the rule says. It would record a defect of the audit's environment as a defect of
  the repository, on a commit CI passes.
- _The purpose: judge criterion 2 on the container runs and CI, and record the three local runs
  with their cause._ It measures what ADR-001 asks. It is a reading made after the result.
- _Rerun on the host until one run passes._ Rejected: with ten such ports held, a clean run is
  luck, as it was on 2026-10-20.

**Consequences.** Whatever the reading, the mechanism is a new sighting for #243, with a
reproduction, and it likely explains #252 and #253 as well: a foreign HTTP server's answer would
read as a 401 or a 404. The severity and the grade of that are the queue grader's and the
owner's, not the main thread's. The next audit's throwaway containers should publish below 49152.

## D-05 — The queue grader kept X62 open at P3, and what that means under D-01

- **Status:** Accepted (it applies D-01 as approved; the main thread decides nothing new)
- **Date:** 2026-11-16

**Context.** Written when the queue grader's report arrived, before either queue reproduction was
run and before the other three graders reported. It graded **X60 closed-confirmed** and **X62
open-progressed, with what is open at P3**:

- No longer holds: the second connection. Every read inside the idempotency wrapper passes the
  job's transaction, in all four handlers and in the fallbacks that run a job in the API process.
  The deadlock the last run reproduced, and graded P1, is gone.
- Still holds, as the finding was worded ("and send the email inside it"): the email is sent
  inside the job's transaction, so the connection is held for the send, now bounded at 10 s. With
  more jobs running at once than the pool serves inside the 60 s acquire timeout, a slow provider
  still fails waiting jobs into retry. Its numbers: at the defaults the email queues alone stay
  just under the timeout; a prefetch of 12 or more, a smaller pool, or a busy fourth queue passes
  it. Nothing relates the pool, the prefetch and the two timeouts. Written out as Y60 (P3), the
  same defect, counted once.

The grader first wrote the X62 grade as conditional on the main thread's reading of that clause.
The main thread, which originates no grade, asked for one unconditional grade and said nothing on
which. The grade above is the answer.

**Decision.** D-01 item 2 makes X62 one of ten conditions, item 3 requires the queue grader to
grade it closed, and item 7 says only closed-confirmed counts. So X62 is **not closed-confirmed**,
and a clean GOLD is not restated on this run unless the main thread refutes the ground by
reproduction (item 7). The main thread runs both: D-01's own reproduction of the stall, and the
grader's open ground, a slow sender with more jobs running at once than the pool clears in 60 s.
It does not regrade the severity.

**Options considered.** Reading the grader's first wording, "closed-confirmed for the stall", as
the grade, with Y60 a separate P3 that does not gate: rejected, the grader was asked for one grade
and gave open-progressed, and choosing the other is the main thread grading. Treating P3 as too
small to block: rejected, D-01 counts the grade, not the severity, for its ten conditions; that
was the rule approved before the evidence.

**Consequences.** If the ground stands, the verdict is GOLD WITH CAVEATS with the P1 mechanism
gone and a P3 residue of X62 named as what blocks. Whether a P3 residue should block a restated
GOLD is then a question for the owner and a new entry in the audit folder's `decisions.md`, as
ADR-012 was for the caveats. It is not this run's to answer.

## D-06 — X60 is closed-confirmed; X62's open ground stands

- **Status:** Accepted (it applies D-01 as approved)
- **Date:** 2026-11-16

**Context.** D-05 left two reproductions to run. Both ran on the built evidence commit against a
throwaway broker and database, with a stand-in mail sender that answers after a fixed delay.
Written before the other three graders reported.

**Decision.** The grades stand as the queue grader gave them.

- **X60: closed-confirmed.** With 30 verification jobs queued and a sender taking 8 s, the worker
  held ten deliveries when it was sent SIGTERM. It logged "Consumer cancelled" four times within
  6 ms. `rabbitmqctl list_consumers` showed no consumer 1.1 s, 4.7 s and 9.6 s later; the last
  run found one still attached at 4 s. The queue's ready count stayed at 20 throughout, so nothing
  new was delivered. The ten jobs in flight finished: unacknowledged went 10, 5, 0, and ten emails
  were answered. The worker exited 0 after 12.3 s.
- **X62, the stall: gone.** Twelve verification jobs at once, a 3 s sender. At the shipped pool of
  five: twelve emails answered, the first at 3.9 s and the last at 9.9 s, no retry; the last run
  saw the first at 61 s and seven jobs in retry. With `DB_POOL_MAX=2`: twelve answered, the last
  at 19.0 s, no retry. No connection waited on a second: the longest `idle in transaction` seen
  was 2.5 s, the length of a send.
- **X62, the grader's open ground: it stands.** With `DB_POOL_MAX=1` and a 9 s sender, twelve
  jobs: three handlers failed together 61 s after the worker started and were scheduled for
  retry. Six sends had finished and one was in flight, so three of the ten jobs the worker held
  had waited past the 60 s acquire timeout. All twelve emails were answered in the end, the last
  at 109 s. The development log format prints no error name on the retry line, so the cause is
  read from the timing, not from a logged name.

So X62 is not refuted and is not closed-confirmed. Under D-01 a clean GOLD is not restated.

**Options considered.** Calling the slow-sender run outside D-01 item 3, which describes the
stall: rejected, item 3's second leg is "the pool set below the job count" and "no job fails into
retry on the acquire timeout", and with a slow sender one does. Running the ground only at the
defaults, where the grader itself says the email queues stay just under the timeout: rejected, a
ground is reproduced where it is claimed to show.

**Consequences.** What blocks GOLD is narrower than what blocked it on 2026-10-20, and graded P3
where that was P1. The rest is in D-05's consequences.

## D-07 — The scratchpad was lost; the architecture lane is graded on another model

- **Status:** Accepted (the model choice is the owner's, 2026-11-22)
- **Date:** 2026-11-22

**Context.** Two things changed after D-02, both forced from outside the method.

- Between 2026-11-16 and 2026-11-22 macOS emptied the session scratchpad under `/private/tmp`,
  which deletes files untouched for three days. Lost: the five grader prompt files, the three
  grader reports then written, every gate log and reproduction script, the Sentry captures and
  fork B's first logs. The directories survived; no file did.
- The graders' usage limit on Fable 5.2 stopped them more than a dozen times, and this session's
  model is now Opus 5.5. The architecture grader had barely started when it stopped.

**Decision.**

- **Recovery, not re-derivation.** The prompt files were rebuilt from the graders' own Read
  results in their transcripts (`~/.claude/projects/…/subagents/*.jsonl`, which are not cleaned),
  the security report by replaying its Write and Edit calls, and the queue and fork-and-API
  reports by replaying the shell commands that wrote them, after a check that each did nothing but
  write its report. Line counts match the graders' hand-backs. Every gate and reproduction result
  was copied from what it printed into the session at the time, into
  `.git/audit-2026-11-14/out/evidence-record.md`. Nothing was re-derived. Fork B, whose first logs
  were never read, was run again. From here every file of the run lives under
  `.git/audit-2026-11-14/`, which is not cleaned and is never committed.
- **The architecture lane is graded on Opus 5.5**, by a fresh `architecture-auditor` told the same
  rules and lane as the first one, with its report path moved. The owner chose it over waiting for
  Fable's limit. The other three lanes were graded on Fable 5.2.

**Options considered.** Rerunning every gate and reproduction so each result has a log: rejected,
the results were printed in full at the time and the cause of the loss was the disk, not the runs;
a rerun on a later day measures a later machine. Resuming the first architecture grader on Fable:
the owner chose not to, for time.

**Consequences.** The audit's header names two models. For the gates and reproductions before
2026-11-22, the record of a result is what it printed into the session, not a log file. The
lesson is kept in the owner's memory: a run longer than a day keeps its evidence under `.git/`.

## D-08 — Category 1 falls below 80%, and D-01 answers it two ways

- **Status:** Accepted (the owner's choice, 2026-11-22)
- **Date:** 2026-11-22

**Context.** Written when the security grader's scorecard was read, before the architecture
grader reported. The grader moved two items of category 1 from Pass to Partial, each on a new
finding it graded P2, and the main thread reproduced both:

- **Password reset (email flow), Pass to Partial, on Y6.** A password changed leaves every session
  alive. Reproduced on the profile path: after `PUT /auth/profile` with a new password, the refresh
  cookie issued before the change still answered 200. The reset path is the same code by reading
  (`ResetPassword.ts:48-52`), and was not run.
- **Email verification, Pass to Partial, on Y7.** The address changes on a bearer token alone and
  stays verified, and `requireVerifiedEmail` is mounted on no route. Reproduced: after
  `PUT /auth/profile` with a new email, the row held the new address with `email_verified_at` still
  set.

Category 1 is then 3 Pass, 2 Partial, 1 Fail (OAuth, absent by design): (3 + 1) / 6 = 67%.
ADR-001 criterion 3 requires 80% for categories 1, 4, 6, 7, 8 and 11. The other five stand at 88%
or more.

D-01, which the owner approved before the evidence, answers this twice:

- item 1: "A failed criterion means the repository is not fork-ready and the verdict says which";
- its Outcomes: "Otherwise **GOLD WITH CAVEATS**, naming what blocks".

ADR-008 defines GOLD WITH CAVEATS as a verdict on a repository that passes ADR-001, so the two
cannot both hold. The run of 2026-06-05 is the nearest precedent: it kept the label and added
"DOWNGRADED PENDING" when new findings were serious, with ADR-001 still passing.

**Decision.** The main thread, which wrote both sentences, did not choose between them in sight of
the result. It put the question to the owner once every grader had reported: C4 closed-confirmed,
nine of the ten conditions closed-confirmed, X62 open at P3, no other category below 80%.

The owner chose on 2026-11-22: **item 1 and ADR-001 as written. The verdict is NOT FORK-READY:
ADR-001 criterion 3 fails on category 1, at 67%.** The run does not reconfirm GOLD WITH CAVEATS.
It names Y6, Y7 and X62 as the path back.

**Options considered.**

- _Item 1: not fork-ready, ADR-001 criterion 3 failing on category 1._ The more specific sentence,
  and what ADR-001 says. The first verdict below GOLD WITH CAVEATS since 2026-05-24, on two P2
  findings no earlier run raised. Chosen.
- _GOLD WITH CAVEATS, "downgraded pending Y6 and Y7", as on 2026-06-05._ Rejected by the owner: a
  label ADR-008 defines for a passing ADR-001.
- _Outcomes: GOLD WITH CAVEATS, naming category 1 below 80% among what blocks._ Keeps the label
  ADR-008 defines for a passing ADR-001, on a run where ADR-001 does not pass.
- _Keep the two items at Pass because Y6 and Y7 are P2:_ rejected, the main thread regrades nothing,
  and the last run moved an item on a P2 (X1).

**Consequences.** Either way, fixing Y6 and Y7 returns category 1 to 83%, its score on
2026-10-20, since OAuth stays absent by design. Their issues say so.

## D-09 — Six scorecard items move, each on a grader's grade

- **Status:** Accepted (it applies D-01 item 9 as approved)
- **Date:** 2026-11-22

**Context.** The 65-item scorecard read 53 / 8 / 4 on 2026-10-20. D-01 item 9: an item moves only
on new evidence, a grader's grade on its driver or a new finding, reproduced where it can be run.

**Decision.** Six items change; every other keeps its grade, each grader having found no new
evidence for it.

- **1. Password reset: Pass to Partial**, on Y6 (security grader; reproduced on the profile path).
- **1. Email verification: Pass to Partial**, on Y7 (security grader; reproduced).
- **4. Input sanitization: Pass to Partial.** The last grade rested on `xss-clean`, removed by
  #206 (X14 closed-confirmed). What replaces it is validation, with the gaps Y10 (reproduced) and
  Y11. **4. HTTPS enforcement readiness: Partial to Pass**, its driver X1 closed-confirmed and
  reproduced. Category 4 stays at 6 / 2 / 0.
- **5. External error monitoring readiness: Pass to Partial**, on Y62: the worker reports to no
  monitor (queue grader; the cited lines checked).
- **8. Environment promotion strategy: Pass to Partial**, on Y64: the production gate cannot be
  passed by a pull-request merge (queue grader, by reading). It cannot be run: `main` holds only
  its initial commit and has never run the workflow.

Two items keep their grade with a new driver: **11. Hardcoded names** stays Partial on
`.github/labels.json:70`, R12 being closed; **10. DDD compliance** stays Partial on R7's rest, Y44,
Y45, Y46 and ADR-0037, X40, X41 and R11 being closed.

The total is 49 / 12 / 4.

**Options considered.** Holding Y64's move until it can be run: rejected, item 9 asks for a
reproduction "where it can be run", and the main thread checked the lines it rests on. Raising
dead code or soft delete: rejected, their graders found the gap no smaller (soft delete larger:
memberships and invites hard-delete as well).

**Consequences.** Category 1 is at 67%, below ADR-001's 80% (D-08). Category 5 falls to 75% and
category 8 to 92%; only category 1 of the six gated falls below the line.

## D-10 — The security findings are published like the rest

- **Status:** Accepted (the owner's choice, 2026-11-23)
- **Date:** 2026-11-23

**Context.** The repository is public. Y6, Y7 and Y11 are security problems, and `SECURITY.md`
says not to open a public issue for one. It also says the repository publishes its own readiness
assessment, every dated audit has described its findings in full, and the last run's security P3s
are a public issue (#244). Production is not deployed: `main` has never run the workflow, and #237
has no production URL.

**Decision.** The owner chose to publish: Y6, Y7 and Y11 are ordinary issues, and the audit keeps
its full detail. `SECURITY.md`'s rule is read as one for outside reporters, whose findings the
owner has not yet seen.

**Options considered.** Private security advisories first, with the audit naming the three by id
only until they are fixed: rejected by the owner, nothing is deployed to attack, and a fork is
better warned in the open. Public issues with the reproduction steps cut: rejected for the same
reason.

**Consequences.** Anyone reading the repository can see how to keep a stolen session alive on a
deployment of it until Y6 and Y7 are fixed, which is the reason they rank first.
