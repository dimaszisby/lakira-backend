# SaaS re-audit, dated run of 2026-11-14 — Checklist

Checked against `origin/dev` at `6a0eb2a` (#298). The evidence and the logs this checklist names are
kept outside the repository, in the owner's `.git/audit-2026-11-14/`.

## Phase 0 — issue, branch, kit

- [x] Issue #299 filed by the owner from `.git/ISSUE_BODY-reaudit`
- [x] `docs/299-saas-reaudit-2026-11-14` cut with `--no-track` from `origin/dev` at `6a0eb2a`; HEAD
      and upstream verified in the same call
- [x] This kit: `README.md`, `saas-reaudit-2026-11-14-plan.md`, this checklist, `decisions.md` with
      D-01 (verdict rule), D-02 (method) and D-03 (records), written before any evidence

## Phase 1 — evidence

- [x] Throwaway containers up (`postgres:18`, `redis:7-alpine`, `rabbitmq:3.13-management-alpine`
      on loopback ports); `npm run db:migrate:test`
- [x] `npm ci` on Node 24.22.1, then the six ADR-001 commands, each exit code and version recorded
      (audit § 2)
- [x] The gates CI runs beyond them: build, `docs:openapi:check`, `security:delta:gate`,
      `test:unit:security-framework`, unit and integration coverage, `docker:smoke`,
      `contract:local:gate` (exit 1, Y22); CI green on `6a0eb2a` (audit § 2)
- [x] Four grader prompts, written from claims only, kept as files; rebuilt from the graders'
      transcripts after the scratchpad was lost (D-07)
- [x] Four graders started after the install, on this session's model, the architecture lane on
      Opus 5.5 (D-07); four reports
- [x] Each grader's cited lines verified by the main thread: the verdict's and every P2's
- [x] Reproductions deciding the verdict: X62, X60; C5, C6 (V1, V2), C4 (V4), C3 (V5), S1 (audit
      § 4.1)
- [x] Reproductions of the six P2 fixes: X1, X61, X63, X20, X40, X41 (audit § 4.2)
- [x] Reproductions of the graders' new grounds: Y6, Y7, Y8, Y10, Y12, Y20, Y22, Y61 (audit § 6)
- [x] Fork run on four clones (A, B, C, D), B run twice (audit § 5)
- [x] Appendix B scans (audit § 6)
- [x] A `D-NN` entry at each grading call, when it is taken: D-04 to D-10

## Phase 2 — the record

- [x] `docs/internal/audits/saas-readiness/audit-2026-11-14.md`
- [x] `docs/internal/audits/saas-readiness/FINAL-AUDIT-SUMMARY.md`: status paragraph, § 4 note,
      § 6 row, § 8 item 14, § 9, "As of"
- [x] `docs/internal/audits/saas-readiness/README.md` lists the run
- [x] `SAAS-BASE-CHECKLIST.md`: date, link, verdict, criteria, scorecard, commands, top gaps
- [x] `CLAUDE.md` audit paragraph; `docs/tutorials/fork-and-rebrand.md` § 5, which states the verdict
- [x] `.git/ISSUE_BODY-reaudit-<id>` for each new finding, with labels by the register's D-01 and
      D-12; filed by the owner on 2026-11-23 as #308 to #320; the numbers written into the audit
      (§ 6, § 9), `FINAL-AUDIT-SUMMARY.md` § 8 item 14 and `SAAS-BASE-CHECKLIST.md`
- [ ] Notion: a record only if a finding needs the frontend to decide or act, confirmed with the
      owner before it is written. None written; open for the owner on Y20 (#314), whose field the
      frontend may read

## Discovered

- [x] Found: #298 merged between the plan and the branch → in scope: the window is 51 commits and
      the evidence commit is `6a0eb2a`, not `2059273`; it changes two Markdown files
- [x] Found: `npm test` failed three runs of three on the macOS host, a request reaching another
      process through a port collision → in scope: D-04, judged on Linux runs; fixed after the
      window by #303
- [x] Found: `.env.test` points the queue integration tests at `127.0.0.1:5672`, the owner's
      Compose RabbitMQ, so the host runs declared test queues there → in scope: recorded in audit
      § 3, nothing deleted; the branch gates ran against the throwaway broker instead
- [x] Found: macOS emptied the session scratchpad between 2026-11-16 and 2026-11-22 → in scope:
      D-07; evidence rebuilt from the transcripts, fork B run again, the evidence now kept under
      `.git/`
- [x] Found: the first fork B `npm test` lost a Jest worker to the memory limit, and its leftover
      fixture under `tmp/` then failed lint → in scope: run again green; recorded as Y24, filed in
      #318
- [x] Found: the architecture lane could not finish on the first model → in scope: D-07, regraded
      on Opus 5.5
- [x] Found: `dev` moved to `13b024e` (#300, #302, #303, #305) during the run → in scope: the branch
      was fast-forwarded before the record was finished; none of those commits touches a file this
      run changes, and the evidence commit stays `6a0eb2a`
- [x] Found: the filing script ran three times, so #321 to #346 duplicate #308 to #320 → out of
      scope for the record: the owner closes them as duplicates of the first set

## Acceptance

- [x] AC-1 — `git status` names only the files of this run; no other `audit-*.md`, the frozen
      register or `docs/internal/todos/` changed
- [x] AC-2 — audit header: window, evidence commit, grader table with models and lanes, runtime,
      the independence paragraph
- [x] AC-3 — D-01 dated 2026-11-14 and approved in the plan before the first gate; audit § 3 item 1
- [x] AC-4 — audit § 4.1, rows C1 to C6, S1, S2, each with its grader, `path:line` and reproduction
- [x] AC-5 — audit § 4.1, X60 and X62, with the observed numbers; D-05, D-06
- [x] AC-6 — audit § 4.2
- [x] AC-7 — audit § 4.3; B-25, B-91, B-92 and B-93 listed as not graded, with the reason
- [x] AC-8 — audit § 2, every gate with its exit code on Node 24.22.1 after `npm ci`
- [x] AC-9 — audit § 7 and § 8; D-08, D-09
- [x] AC-10 — the live documents of Phase 2, and #308 to #320; #308, #309 and #310 say a dated run
      must confirm the fix

## Gates

On the branch at `13b024e` plus this run's Markdown, after the docs. The evidence gates, on
`6a0eb2a`, are the audit's § 2.

Run on 2026-11-23, Node 24.22.1, npm 11.19.1, on the macOS host against the throwaway database,
Redis and broker, after `npm run db:migrate:test` (exit 0).

- [x] typecheck — exit 0
- [x] lint — exit 0, no warnings
- [x] format — exit 0
- [x] tests — exit 0: unit 1793 passed; integration 328 passed, 7 skipped. The host runs pass now
      that #303 is on the branch (D-04)
- [x] build — exit 0
- [x] OpenAPI — exit 0: 49 operations, 447 `$ref`s, 50 schemas, valid, no drift
- [x] security delta — exit 0, `passed=true blocking=0`
- [ ] image smoke — skipped on the branch: it changes Markdown only. Run on `6a0eb2a`, exit 0 (audit
      § 2)
