# 2026-06-04 — SaaS audit + workflow experiment follow-ups

- **Status:** Needs triage (2026-09-15) — predates the SaaS-readiness and twelve-factor campaigns,
  and its items were not re-verified during this sweep. Check each against
  `docs/internal/audits/saas-readiness/FINAL-AUDIT-SUMMARY.md` before acting on it.

Captures pending work after the workflow-conventions PR (`chore/claude-md-task-defaults`, merged). Items span multiple Claude Code sessions.

---

## Immediate (this session)

- [x] ~~Fix broken `[[operations]]` wiki-link~~ — **false alarm**: TOML syntax inside a code fence matched my audit regex, not an actual wiki-link. Retracted.
- [x] Remove `node_type: memory` frontmatter drift from three Format B memory files — done, but **session-local only**: the post-edit formatter re-injects the field on any future Write/Edit. See `project_memory_frontmatter_drift` memory.
- [x] Capture deferred Option C (normalize all memory frontmatter) as a memory note with trigger conditions — saved to `project-memory-frontmatter-drift`.

## Next session (fresh Claude Code instance, separate from this one)

- [ ] **SaaS-readiness re-audit** of `docs/internal/audits/saas-readiness/` against current source code
  - **Model:** Opus
  - **Effort:** high (per `feedback-effort-model-matrix`)
  - **Plan mode:** yes
  - **Subagents:** `architecture-auditor` + `security-reviewer` (parallel)
  - **Baseline:** `FINAL-AUDIT-SUMMARY.md`
  - **Outputs:**
    - New `docs/internal/audits/saas-readiness/audit-2026-06-04.md`
    - Update `FINAL-AUDIT-SUMMARY.md` with consolidated state
    - Add newly-discovered gaps to `iteration-plan.md`

## After audit (separate session, separate PR)

- [ ] **Update `.claude/lessons.md`** with consolidated corrections from:
  - 2026-06-04 workflow-conventions session (effort/model matrix philosophy, commit/PR ownership rule, delegation experiment framing)
  - SaaS audit session (whatever new corrections surface)
- [ ] Open separate PR: `docs(lessons): capture 2026-06-04 corrections`

## Scheduled review

- [ ] **2026-07-02** — review experimental effort+model matrix and subagent-delegation pattern
  - **Sources:** friction notes accumulated in `feedback_effort_model_matrix.md`, session retros, observed delegation misfires
  - **Outcome:** keep / refine / revert
  - **If keep:** remove "EXPERIMENTAL" warning from `feedback_effort_model_matrix.md`
  - **If refine:** narrow the matrix rows that delegate; document which task types stay on Opus
  - **If revert:** delete `## Task Defaults` from `CLAUDE.md`; either remove delegation section from matrix file or drop the whole memory

---

## Active conventions (FYI, not action items)

- **Commit & PR ownership:** Claude does not run `git commit`, `git push`, or `gh pr create`. Only the user does these — manually. Source: `.claude/rules/workflow.md` § Commit & PR Ownership.
- **Effort + model matrix:** before any non-trivial task, consult `feedback-effort-model-matrix` (user memory). Source: `CLAUDE.md` § Task Defaults.
- **Branch promotion:** `feature/* → dev → staging → main`. Always branch off `dev`.
