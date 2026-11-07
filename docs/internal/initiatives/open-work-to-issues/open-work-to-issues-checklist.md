# Open work to issues — Checklist

Built on `origin/dev` at `8f68b0d` (#231). Acceptance criteria are the plan's AC-1 to AC-5.

## Phase 0 — kit and branch

- [x] `chore/open-work-to-issues` cut with `--no-track` from `origin/dev` at `8f68b0d`; HEAD and
      upstream verified
- [x] Kit: README, plan (as approved), this file, `decisions.md` D-01 to D-04, all Accepted (D-03)

## Phase 1 — the issues (step 2)

Bodies written to `.git/issues/`, each batch run by the owner and checked with `gh issue list`
before the next (D-04).

- [x] Batch 1: the four owner questions, `type:decision` issues #232 to #235
- [x] Batch 2: tiers 2 to 4, #236 to #243
- [x] Batch 3: tier 5 security, architecture, API, #244 to #251
- [x] Batch 4: tier 5 forkability, tests, repo, #252 to #261 (B-101 as step 4, #261)
- [x] Batch 5: B-26, #262, after its trigger fired (D-02)
- [x] 31 open issues; each has one `type:`, and each task one `tier:` and one `state:`

## Phase 2 — the records

- [x] `register.md` frozen: `**Frozen:** 2026-10-29`, and "Where each row went" maps all 32 open
      rows and questions; the register README says so; D-12 ranks by labels
- [x] `docs/reference/known-gaps.md` with B-41, in `docs/README.md`
- [x] 19 open todos name their issue in their Status; B-41's is Closed, pointing at
      `known-gaps.md`
- [x] `__tests__/unit/open-work-records.test.ts` replaces `debt-register-todos.test.ts`: red on the
      unfrozen register (three real-file checks), its in-memory cases red where they should be,
      then green

## Phase 3 — the rules (step 3)

- [x] `.claude/rules/workflow.md`: Task Flow from an issue; the issue number as the spine; branches
      `<type>/<N>-<slug>`; `Closes #N`; What's next from the issues query (D-12); decisions
      Accepted in their PR (D-03); no new todos
- [x] `.claude/rules/documentation.md`: kit sizes (no kit under two days), placement, the "Found:"
      line, the decision template's status
- [x] `.claude/agents/doc-writer.md`, `docs/explanation/documentation-standards.md`,
      `docs/how-to/ci-cd/daily-pipeline-playbook.md`, `docs/explanation/decisions/README.md`
- [x] `CLAUDE.md` (what's next, the frozen register, 85 ADRs); `docs/reference/issue-tracker.md`
- [x] ADR-0085 Accepted, index row, ADR-0086 next
- [x] #231's loose end, the last under the old rule: `tracker-as-code` D-05 Accepted

## Discovered

- [x] Found: B-26's trigger had fired (`tsx` 4.23.12 to 4.23.15 declare `esbuild ~0.28.0`) → in
      scope: the owner made it an issue, #262 (D-02)
- [x] Found: B-71 was ready, not waiting on the frontend, which chose its remedy on 2026-10-23 →
      in scope: its issue, #249, is `state:ready` and says so
- [x] Found: B-63's row listed two items already fixed (#206; `error-envelope-residuals` D-10) →
      in scope: its issue, #257, lists the three still open
- [x] Found: the first version of the new test missed a status on a todo's last line → fixed
      before it ran against the real files
- [x] Found: Fork Smoke failed on #263: `open-work-records.test.ts` read the register, which
      bootstrap deletes. The test it replaces had a guard for that, added after it was first
      written, and the new one did not carry it over → in scope: the real-file checks are skipped
      when `docs/internal/` is absent and read their files in `beforeAll`; the in-memory cases
      still run. Run in a bootstrapped fork: five skipped, four passed

## Acceptance

- [x] AC-1 — `gh issue list`: 31 open issues, labels checked; the register maps all 32 rows and
      questions, B-41 to `known-gaps.md`
- [x] AC-2 — `open-work-records.test.ts` › real-file and in-memory cases
- [x] AC-3 — the rules, `CLAUDE.md` and `issue-tracker.md`; the ranked query names #239 first, as
      the rule predicts
- [x] AC-4 — `documentation.md`, `documentation-standards.md`, `workflow.md`
- [ ] AC-5 — the mapping table on the Notion record, written once the owner has seen it

## Gates

Node 24.22.1.

- [x] typecheck, lint, format — clean
- [x] tests — unit with coverage, 161 suites, 1727 tests. Integration not run: no `src/` change
- [x] build — clean
- [x] OpenAPI, image smoke, security delta — not run: no route, image or dependency change
