# SaaS re-audit, 2026-10-03 — Decisions Log

`D-NN` entries scoped to this kit. ADR numbers without four digits (ADR-001, ADR-002, ADR-008)
refer to `docs/internal/audits/saas-readiness/decisions.md`, not the global registry.

---

## D-01 — Method: the 2026-09-29 design again, with the fork run taken through `npm test`

- **Status:** Accepted
- **Date:** 2026-10-03

**Context.** Since the last run at `b12ec62`, eleven PRs (#121 to #131) have merged. Each fixes a
finding of that run, and each is recorded as pending a dated run (ADR-002). 43 files under `src/`
changed, two workflows were added (`fork-smoke.yml`, `image-smoke.yml`) and one script
(`scripts/image-smoke.sh`).
**Decision.** Reuse `saas-gold-reaudit` D-01: `security-reviewer` and `architecture-auditor` in
parallel, a delta pass over every caveat and finding, then a fresh pass over what changed; a full
65-item re-grade; the Appendix B scans. The main thread re-verifies every caveat status, every P0 or
P1 and every grade change before it enters the record. Two changes from last time. The fork dry-run
is taken through the full `npm test` against throwaway Postgres, Redis and RabbitMQ carrying the
fork's own settings, because last time it stopped at the credentials failure. And C3 is graded by
the security agent from the code, with the readiness probe's 503 put to it as an open question,
because this session wrote the C3 phase 2 fix (#131) and should not grade it.
**Options considered.** A delta-only pass: rejected, the fixes themselves are 43 changed files that
no audit has read. Relying on the `Fork Smoke` workflow for C1: rejected as the only proof, an
audit that cites the fix's own check has verified nothing; it is cited as a second proof.
**Consequences.** Findings from agents are claims until re-verified. The run replaces
`node_modules` (`npm ci`) and creates and removes throwaway containers and a scratch clone.

## D-02 — The verdict rule, fixed before the evidence

- **Status:** Accepted
- **Date:** 2026-10-03

**Context.** ADR-008 restates GOLD only when C1 to C6 are closed. `FINAL-AUDIT-SUMMARY.md` § 8
item 7 (corrected 2026-09-29) says an open C3 or C4 cannot ride along as a caveat. Nothing says what
a finding outside C1 to C6 does to the verdict.
**Decision.** ADR-001 is evaluated criterion by criterion on its six commands (the newer CI gates
are reported alongside, `saas-gold-reaudit` D-02). Clean GOLD requires all of C1 to C6
closed-confirmed; one open caveat means GOLD WITH CAVEATS, naming it. A new P0 fails ADR-001. A new
P1 does not change the C1 to C6 test, but gets its own entry here on whether a restated GOLD is
honest with it open, and the verdict says so. P2 and P3 findings are filed and do not gate. If the
R4 flake recurs on the first run after `npm ci`, the test gate is graded on reruns and the audit
states that call.
**Options considered.** Deciding the handling of new findings once they are known: rejected, a rule
written after the result bends to it. Letting any new P1 block GOLD automatically: rejected, ADR-008
names C1 to C6 and amending it is a decision for `saas-readiness/decisions.md`, not for a run.
**Consequences.** The run can end in GOLD with a P1 open, but only with a written reason.

## D-03 — C1 is closed; what the fork still gets wrong is recorded as new findings

- **Status:** Accepted
- **Date:** 2026-10-03

**Context.** The fork dry-run was executed: a fresh `--no-local` clone of `582c1b5`,
`bootstrap-fork.sh --name acme-api`, then the five printed steps against throwaway Postgres, Redis
and RabbitMQ carrying the fork's own settings. All five passed, `npm test` included. Three things
around it do not work. The fork's `npm run docs:openapi:check` exits 128, because bootstrap renames
the spec path inside `package.json` but not the file or the scripts that write it (S2, reproduced).
Bootstrap run after a hand-made `.env` leaves `.env` on `lakira_user` and `.env.test` on the renamed
user (S3, reproduced). And re-running bootstrap under the fork's own name exits before creating
`.env` (S4, reproduced).
**Decision.** C1 is **closed-confirmed**. Its claim is that the fork flow works as printed, and the
printed flow was run end to end. S2, S3 and S4 are new findings with their own severities, not a
reopening.
**Options considered.** Reopening C1 over S2: rejected, the OpenAPI gate is not a printed step and
C1 never claimed the fork's CI. Reopening over S3: rejected, it needs a step the fork tutorial does
not give. Grading C1 closed and saying nothing more: rejected, S2 breaks a fork's pipeline on its
first push and belongs in the verdict (D-05).
**Consequences.** The C1 row can read closed. Forkability's bootstrap item stays Partial.

## D-04 — C4 stays open at P2: two routes around the boundary rule remain

- **Status:** Accepted
- **Date:** 2026-10-03

**Context.** #123 fixed what the last run reopened C4 on: both import spellings are rejected,
`MetricAccessPort` is owned by its consumers, the negative cases are a persisted lint test, and
relative cross-feature imports are caught. The architecture pass found two routes it does not
cover, and the main thread read each. `src/types/domain/metric.domain.ts:9` and
`src/types/dtos/metric.dto.ts:8-13` import other features' domain entities and HTTP DTOs, and
feature code imports those types; the boundary rule covers `src/features/**` only (S5). And the
application layer imports infrastructure with nothing to stop it: HTTP DTOs in two metric-settings
use cases, the queue topology and `amqplib` types in metric-log (S6). The application-layer rule
bans the models barrel alone.
**Decision.** C4 is **open-progressed at P2**. The caveat's words are that cross-feature deep
imports and application-to-infrastructure dependencies pass green, and both still do, by a
different path.
**Options considered.** Closing C4 because the 2026-09-29 residual is fixed: rejected, that grades
the last finding and not the caveat. Reopening at P1: rejected, nothing here misleads a forker or
produces a wrong result.
**Consequences.** Under ADR-008 an open C4 alone blocks the GOLD restatement.

## D-05 — With two P1 findings open, GOLD would not be honest even if C1 to C6 were closed

- **Status:** Accepted
- **Date:** 2026-10-03

**Context.** D-02 requires this entry when a new P1 is found. There are two. S1: the cache
middleware stores any body passed to `res.json`, error bodies included, and replays it with status 200. Reproduced: `GET /metrics/<unknown id>` returned `404`, then `200` twice with
`{"status":"fail","message":"Metric not found"}`, for the 60 s TTL. It predates this run's window
and every earlier run missed it. S2: the fork's OpenAPI gate (D-03).
**Decision.** Both are P1 and both are named in the verdict as blocking a clean GOLD, alongside C4.
ADR-008 calls GOLD "publishable as a forkable base" with nothing an outside reviewer would close
first. A client that retries a failed read and gets an error body under a 200 is a wrong result,
and a fork whose pipeline is red on its first push is the first thing a forker meets.
**Options considered.** Treating S1 as P2 because the key is scoped to one user and organization:
rejected, it is not a leak but it is a wrong status on every cached read route, and a masked 500
would be replayed the same way. Treating S2 as P2 because the printed steps pass: rejected for the
reason above.
**Consequences.** The path to GOLD is S1, S2 and the C4 residual, then another dated run.

## D-06 — Grading calls that differ from the agents' or from the last run

- **Status:** Accepted
- **Date:** 2026-10-03

**Context.** The two agents graded some items below the last run's grade on findings that already
existed then.
**Decision.** C3 is **closed-confirmed**, on the security agent's judgment and not this session's,
which wrote #131: every error path answers through the envelope, and the readiness probe's 503 is a
probe document. S1 is recorded against the envelope item as Partial, because it puts an error body
under a 200, and not against C3, whose claim is the shape. Log redaction goes to Partial: two
limiter log lines carry an email address (S8), against the rule in `.claude/rules/security.md`.
JWT auth, CORS, input validation, E2E, CI secrets, naming and dead code keep the last run's grade:
each rests on a finding that was already known and graded P3 or a judgment item then, and
re-grading them now would make the scorecards incomparable.
**Options considered.** Taking every agent grade as given: rejected, it moves seven items on no new
evidence.
**Consequences.** The scorecard is 49 pass, 12 partial, 4 fail. Each difference from an agent's
grade is listed in the audit's § 7.

## D-07 — S1 fix: the response cache stores a 200 and nothing else

- **Status:** Accepted
- **Date:** 2026-10-04

Micro entry for audit finding S1 (P1), merged in #133 (`50258e4`).

**Context.** `cacheMiddleware` stored whatever reached `res.json`, and `sendError` writes error
bodies through the same `res.json`. A hit is replayed with `res.status(200)`, so a stored 404 or
masked 500 came back as a 200 until its key expired.
**Decision.** The wrapper stores a response only when `res.statusCode === 200`.
**Options considered.** Any 2xx: rejected, a hit is always replayed as 200, so a stored 201 or 204
would come back with a different status than it was sent with. Storing the status beside the body
and replaying it: rejected, it changes the cached value's shape for no route that needs it, and
caching errors is how a transient failure outlives its cause. Having `sendError` bypass the wrapper:
rejected, the cache should not depend on how a handler writes its error.
**Consequences.** Errors are never cached, so a client that hammers a missing id reaches the
handler every time; the rate limiters bound that. Entries poisoned before the fix expire on their
own within the longest TTL, 600 s. The other cache findings of the same audit (S12: unencoded key
segments, keys in log lines) are not touched.
