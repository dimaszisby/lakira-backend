# SaaS audit closeout — Checklist

Lean kit: no plan, so the acceptance criteria are stated here.

## Acceptance criteria

- **AC-1** — The C2 row in `FINAL-AUDIT-SUMMARY.md` § 4 reads Fixed, referencing [D-01](decisions.md). Its
  dated note records why a code change was rejected.
  _Why:_ it is the last open caveat, and closing it is a decision rather than a change.
- **AC-2** — Every Fixed row in § 4 names its delivering commit, as the file's fix-status convention
  requires: C4 → `78a05a1` (#106) + `3ce0c0e` (#107), C5 and C6 → `b28381a` (#104).
  _Why:_ three rows read Fixed with no SHA today.
- **AC-3** — The § 7 findings table shows F2 as closed by `21f12eb` (#105) and F3 as closed by
  `f5f28b9`. Every other open row there has been checked against current code: a row is flipped only
  with a commit as evidence and otherwise left open.
  _Why:_ F2 and F3 are verifiably fixed but still read as open P2s. A stale row has already
  misled one handoff.
- **AC-4** — The file's header status and § 8 agree with ADR-008: all six caveats are closed, and
  the next action is a new dated audit run. § 8 no longer lists finished work as upcoming. See
  [D-02](decisions.md).
- **AC-5** — `SAAS-BASE-CHECKLIST.md` (repo root) shows C1–C6 as closed. It currently shows only
  C1 closed.
- **AC-6** — The unrelated main/dev history is filed as a todo.

## Work items

- [x] `docs/internal/audits/saas-readiness/FINAL-AUDIT-SUMMARY.md` — header status: all six closed,
      GOLD restatement pending the dated audit run
- [x] same file § 4 — C2 Fixed (D-01), plus a dated 2026-09-24 addendum to the C2 note. SHAs added to
      C4, C5 and C6
- [x] same file § 4 — the Status column and the fix-status convention below it use the words
      `Open` / `Partly` / `Fixed` instead of emoji markers, so the rows this kit edits are not
      mixed with emoji ones. The dated historical snapshot tables in § 7 are left as written
- [x] same file § 7 — F2 and F3 closed with SHAs. N4, N6–N11 and F4–F7 each checked against the code
      and flipped only with evidence
- [x] same file § 8 — completed items marked done. The next action is the dated audit run
- [x] `SAAS-BASE-CHECKLIST.md` — caveat list and severity counts brought current
- [x] `docs/internal/todos/2026-09-24-todo-main-dev-unrelated-history.md` — `main` shares no ancestry
      with `dev` (`git merge-base` finds none). Record the consequence for the first release and the
      options, without choosing one

## Out of scope

- The new dated audit run (`audit-YYYY-MM-DD.md`) and the GOLD restatement. That is its own piece
  of work, and ADR-002 governs how it is run.
- Changes to `src/config/app-name.ts` (see D-01).
- The five completed todos that name a branch or nothing, instead of a commit. They are
  under-referenced, not stale.

## Discovered

- [x] Found: old § 8 item 4 asked for more than C4. It also asked for an ADR-011 layout rule and
      an ADR-009 cache-key rule in `architecture.test.ts`. The cache-key rule is there ("cache
      keys are tenant-scoped"). The layout rule is not: ADR-0037 is still Proposed and auth
      persistence is still flat. → **out of scope**, no new todo filed. It is already tracked by
      ADR-0037's Proposed status and the "ADR-003 reopened" row in § 7. § 8 item 4 now says so
      rather than reading as done.
- [x] Found: the F2 fix is dated 2026-09-22 (`21f12eb`), not 2026-09-21. → **in scope**, and the
      row uses the commit's date.
- [x] Found: the root checklist also showed C3 as open, not just C4–C6. → **in scope**, handled
      under AC-5.
- [x] Found: the warning-sign emoji on the audit's `**Status:**` line sat inside the paragraph this kit rewrote.
      → **in scope**, removed under the no-emoji rule. Emojis in untouched sections (the dated § 2
      and § 7 snapshots, and the root checklist's 2026-05-24 scorecard) are left as written.

## Acceptance

- [x] AC-1 — § 4 C2 row reads `Fixed (D-01)`. The note "C2 — closed by decision (2026-09-24)"
      follows the 2026-09-17 note
- [x] AC-2 — § 4 rows: C4 `78a05a1`, `3ce0c0e`; C5 and C6 `b28381a`. Each date was checked against
      `git log -1 --format=%ad`
- [x] AC-3 — § 7 rows F2 (`21f12eb`) and F3 (`f5f28b9`) are closed. N4, N6–N11 and F4–F7 were
      checked against the code and are all still open, so they are unchanged. Evidence:
      `x-request-id` appears nowhere under `src/shared/infrastructure/queue`; one queue per job type
      (`topology.ts:10`); no `@opentelemetry` dependency; no `DB_POOL_*`; one `createClient`;
      `computeStats` is `findAll` plus a JS reduce; the `aggregatedStatsQuery` date range is
      unbounded; `MetricSettingsRepositorySequelize.create()` does not check the org; `CORS_ORIGIN`
      is trimmed but not normalized; the cookie is still `sameSite: "strict"`
- [x] AC-4 — The header now reads "All six caveats are closed", with the verdict of record kept
      until the dated run. § 8 was rewritten and cites D-02
- [x] AC-5 — `SAAS-BASE-CHECKLIST.md`: C2–C6 struck through, marked CLOSED with SHAs and dates,
      and the severity-counts paragraph updated
- [x] AC-6 — `docs/internal/todos/2026-09-24-todo-main-dev-unrelated-history.md`. `main` has no
      merge base with `dev` or with `staging`

## Gates

Commands and conditions live in `.claude/rules/workflow.md` § Gates are named, not asserted.

- [x] typecheck — exit 0
- [x] lint — exit 0
- [x] format — exit 0. The glob covers `**/*.md`, so the changed docs are checked
- [x] tests — exit 0. Unit: 92 suites, 601 tests. Integration: 28 suites passed, 2 skipped;
      196 tests passed, 5 skipped (the Redis-flagged skips already recorded in the audit)
- [x] build — exit 0
- [ ] OpenAPI — skipped: no route, Zod schema, or `src/lib/openapi/**` change
- [ ] security delta — skipped: no dependency change
- [x] link check — 32 relative links across the six changed or new docs, 0 broken. The checker
      reports a deliberately bad path as missing, so it can fail

## Review

- **Outcome:** all six caveats are closed. C2 is closed by decision (D-01) and the other five by
  commit. The verdict of record stays GOLD WITH CAVEATS until the dated audit run restates it, per
  ADR-008 and ADR-002.
- **Self-review caught one over-claim:** the first draft of § 8 struck through item 4 as done.
  Checking `architecture.test.ts` showed that only part of it is done. It is now written as partly
  done.
- **Presentation miss, now corrected:** the checklist was first handed over as a file path, and
  plan mode was skipped. Recorded in `.claude/lessons.md` (2026-09-24).
- **Next:** the dated audit run (§ 8 item 5). The routers refactor is the next code kit.
