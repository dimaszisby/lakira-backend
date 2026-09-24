# Docs sweep — Checklist

Lean kit: no plan, so the acceptance criteria are stated here. It lands as one PR with two
commits: content (clusters 1–8), then the emoji pass (cluster 9).

## Acceptance criteria

- **AC-1** — No doc in scope asserts an open P0 or HIGH that is closed.
  _Why:_ `docs/internal/README.md` told every session the cache-key P0 was "live". It closed in #64.
- **AC-2** — Every file path, script name, CI job name, port, env-var name and count quoted in the
  swept docs matches the repo. A resolver script over the changed files is the check.
  _Why:_ wrong paths were the single largest class of finding.
- **AC-3** — Auth, CORS and token facts match the code everywhere: HS256; node-redis; a 15-minute
  access token plus an httpOnly refresh cookie (`SameSite=strict`); logout revokes the token
  family; `CORS_ORIGIN` is a comma-separated allowlist; `PATCH` is allowed.
  _Why:_ `frontend-handoff.md` is what the frontend repo builds against.
- **AC-4** — The CI docs name the real jobs and their `needs:`, `postgres:18`, and the workflow
  name `Lakira Backend CI`.
  _Why:_ `workflow-guidelines.md`'s template names the workflow `backend-ci`, which would silently
  break the `promote-dev-to-staging.yml` trigger.
- **AC-5** — Kit, todo and audit statuses match git. Merged work cites its PR and SHA.
  _Why:_ a stale status row has already misled one handoff.
- **AC-6** — ADR statuses and cross-links follow [D-03](decisions.md), and the registry matches the
  ADR files.
- **AC-7** — `docs/explanation/product-requirements.md` describes the system as built, with each
  claim traceable to a router, migration or `zodEnv.ts` line.
  _Why:_ three docs point at it as canonical, and it predates multi-tenancy.
- **AC-8** — The PLACEMENT-TABLE block is byte-identical in `.claude/rules/documentation.md` and
  `.claude/agents/doc-writer.md`, and `2026-09-19-todo-placement-table-drift` is closed.
- **AC-9** — No emoji remains in tracked Markdown except the allow-listed data values
  ([D-04](decisions.md)).

## Work items

- [x] 1. Risk and status warnings — `docs/internal/README.md`, `c4-containers.md`,
     `fork-and-rebrand.md`, the twelve-factor banner, saas-readiness `README.md` and
     `iteration-plan.md`
- [x] 2. Top-level — `CLAUDE.md`, `README.md`, `CONTRIBUTING.md` (co-author section removed, per
     the user), `docs/README.md`
- [x] 3. `.claude/rules/` — security, api-design, database, testing, code-style, environment,
     commands, documentation
- [x] 4. `.claude/agents/` and `.claude/skills/` — feature paths, the CI job chain, test helpers
- [x] 5. `docs/reference/` — configuration, commands, database-schema, environments,
     frontend-handoff, ci-pipeline/\*, api/README, security/
- [x] 6. `docs/explanation/` — the ADR registry and ADR files (D-03), architecture pages, and the
     product-requirements rewrite
- [x] 7. `docs/tutorials/` and `docs/how-to/`
- [x] 8. Kits and todos — statuses, SHAs, Superseded markers (placement table descoped, see Discovered)
- [ ] 9. Emoji pass (commit 2)
- [x] Todos filed (D-05) — `2026-09-24-todo-test-ci-script-defects`,
      `2026-09-24-todo-commands-doc-drift-check`, `2026-09-24-todo-app-name-short-name-mismatch`

## Out of scope

- Any code, CI or config change. The rewriting of ADR-0039 Part 2 and ADR-0040 against the VPS
  (TF-2).
- The content of `docs/internal/audits/security/`. It is schema-validated by
  `security-framework.validation.test.ts`, so it is touched only for emoji.
- The jwt-kit underscore file naming (its own open todo).

## Discovered

- [x] Found: **the plan was wrong about ADR-0018.** Its decision is to ship `requireVerifiedEmail`
      and apply it to no route, which is exactly what the code does, so it is fully implemented.
      → in scope: flipped to Accepted with the others. The planned todo ("applied to no route")
      was dropped, because it would have filed intended behaviour as a defect.
- [x] Found: **an agent false positive.** The sweep reported that only `contract_local` sets
      `DISABLE_RATE_LIMITING`; the workflow sets it in `security_delta`, `tests` and
      `contract_local`. → `environments.md` and `ci-debugger.md` were already right and were left
      as they were.
- [x] Found: `2026-09-19-todo-placement-table-drift` asks explicitly not to be batched into an
      unrelated PR ("the point is that the block is auditable on its own"). → **AC-8 descoped**;
      the todo stays Open for its own one-paragraph PR.
- [x] Found: `scripts/test-ci.sh` also migrates without `--migrations-path` (and there is no
      `.sequelizerc`), and it runs `docker compose down -v`, which deletes local volumes. → out of
      scope (code), filed in `2026-09-24-todo-test-ci-script-defects`. The how-to now warns.
- [x] Found: `bootstrap-fork.sh` strips `-api` from the short name; `app-name.ts` does not. → out of
      scope (code), filed in `2026-09-24-todo-app-name-short-name-mismatch`; the tutorial now
      describes the real behaviour.
- [x] Found: ADR-0019 and ADR-0020 were implemented with differences (cookie `SameSite=Strict`, not
      `Lax`; `InvalidTokenError` now extends `DomainError`). → in scope: recorded in each status
      note rather than hidden behind a plain Accepted.
- [x] Found: `saas-audit-closeout` (#108) also still said "awaiting PR", which the sweep missed. →
      in scope, fixed with the others.
- [x] Found: `database-schema.md` claims to be introspection-verified. → re-introspected the live
      database (27 migrations) rather than editing from migration files; every table and column
      checked.
- [x] Found: one full `npm test` run failed a single queue integration test (register returned 401
      with an empty body); not reproduced in 5 isolated runs or a full rerun. → out of scope,
      filed as `2026-09-24-todo-queue-test-intermittent-401`.
- [x] Found: dated `## Review` sections in two todos said "not committed". → outcome appended with
      the PR, rather than rewriting the dated record.

## Acceptance

- [x] AC-1 — `docs/internal/README.md`, `c4-containers.md`, `fork-and-rebrand.md`, `CLAUDE.md` and
      the twelve-factor banner now state no open P0/HIGH, citing `f5f28b9`
- [x] AC-2 — a resolver over every line this change adds: 269 links, paths and `npm run` names;
      the only unresolved hit is the branch name `docs/docs-sweep`. Proven able to fail: its first,
      whole-file run flagged real broken links in `iteration-plan.md`, now fixed. `commands.md`
      now lists every `package.json` script
- [x] AC-3 — `frontend-handoff.md`, `environments.md`, `README.md`, `security.md`, the PRD: HS256,
      node-redis, 900 s access token, `<app>_refresh` cookie (`Strict`, path-scoped), family
      revocation on logout, CORS allowlist and `PATCH` — each read from `JwtTokenProvider.ts`,
      `controller.ts`, `zodEnv.ts`, `server.ts`
- [x] AC-4 — `pipeline-overview.md`, `strategy.md`, `workflow-guidelines.md`, `ci-debugger.md`,
      `daily-pipeline-playbook.md`: job list and `needs:` extracted from `backend-ci.yml`;
      workflow name `Lakira Backend CI` in both template copies
- [x] AC-5 — 13 kit statuses and 15 Complete todos cite PR + SHA, each mapped through
      `gh pr list --state merged` and spot-checked by PR title (#70 by branch, since its subject is
      the duplicated one)
- [x] AC-6 — ADR-0012, 0017–0021, 0024 Accepted with dated evidence notes; 0016 Superseded by 0030;
      back-links added. A script compares all 44 ADR status lines with the registry: 0 mismatches
- [x] AC-7 — `product-requirements.md` rewritten: route table from the committed spec (46
      operations), tables and indexes from database introspection, role rules from
      `organization.controller.ts` and the use cases
- [ ] AC-8 — **descoped**: the todo asks for its own PR (see Discovered)
- [ ] AC-9 —

## Gates

Commands and conditions live in `.claude/rules/workflow.md` § Gates are named, not asserted.

Commit 1 (content):

- [x] typecheck — exit 0
- [x] lint — exit 0
- [x] format — exit 0 (covers `**/*.md`)
- [x] tests — first run exit 1 (one intermittent queue-test failure, see Discovered); rerun exit
      0: unit 92 suites / 601 tests; integration 28 passed, 2 skipped / 196 passed, 5 skipped.
      `security-framework.validation.test.ts` PASS
- [x] build — exit 0
- [ ] OpenAPI — skipped: no route, Zod schema, or `src/lib/openapi/**` change
- [ ] security delta — skipped: no dependency change
- [ ] link check and path/script resolver — each run with a negative control

## Review

_(after gates)_
