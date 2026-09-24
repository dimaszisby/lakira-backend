# Documentation Overhaul — Checklist

- **Status:** Done — landed directly on `dev` (`c896881` … `81f724d`) and in #60 (`638d75b`)
- **Companion:** [PLAN.md](./PLAN.md)
- **Branch:** create off `dev` (per `.claude/rules/workflow.md`)

Every move uses `git mv` so history survives. Each phase ends with a verification gate; do not
start the next phase until the current gate is green.

---

## Phase 0 — Unblock DONE (2026-08-16)

- [x] Read `.gitignore:100`. The bare `docs` pattern (comment: "actionlint docs") is unanchored
      and matches a `docs` directory at any depth.
- [x] Determine what actionlint actually creates. **Finding:** actionlint is not wired into
      `package.json` or any workflow — it is a purely manual local tool, and its release tarball
      extracts `actionlint`, `man/`, **and `docs/`** at the extraction root. The rule was added
      2026-02-05 in `cfee189`. Since the collision is on the directory _name_, no anchored form
      can keep it (`/docs/` would still swallow the new tree), so the rule was **removed** and
      replaced with a NOTE explaining why it must not be re-added. The adjacent `actionlint`,
      `actionlint_*.tar.gz`, `man/actionlint.1` rules are retained.
- [x] Create a throwaway `docs/README.md` and confirm it is trackable.

### Additional finding — the pattern was already causing a latent bug

`docs` also matched the **tracked** file `__tests__/integration/docs/swagger.test.ts`:

```
.gitignore:100:docs	__tests__/integration/docs/swagger.test.ts
```

It survived only because it was committed _before_ the rule was added. Any **new** file added to
`__tests__/integration/docs/` would have been silently ignored. Fixed by the same change — this
was worth doing independently of the docs migration.

**Gate — all passed**

```bash
git check-ignore -v --no-index docs/README.md                          # exit 1 → not ignored PASS
git status --short docs/                                               # "?? docs/" → visible PASS
git check-ignore -v --no-index __tests__/integration/docs/swagger.test.ts  # exit 1 → freed PASS
git status --short                                                     # no unintended unignores PASS
```

> Use `--no-index`: plain `git check-ignore` reports exit 1 for already-tracked files regardless
> of the rules, which masks exactly this class of bug.

---

## Phase 1 — Move executables out of the docs tree DONE (2026-08-16)

> Riskiest phase. Runs first and alone, while `docs/` is otherwise untouched, so any CI
> failure is unambiguously attributable.

### 1a. Move the files

- [x] `git mv docs/internal/initiatives/tests-4-contract-tests/postman-newman/{collections,environments,scripts} tests/contract/postman-newman/`
- [x] `git mv docs/internal/initiatives/tests-4-contract-tests/schemathesis/{scripts,requirements.txt} tests/contract/schemathesis/`
- [x] `git mv tests/contract/hooks/seeded_ids.py tests/contract/hooks/seeded_ids.py`
- [x] Leave all `*.md` prose behind for now — it moves in Phase 3.
- [x] Moved `schemathesis/reports/staging/.gitkeep` to the new location to preserve the
      report-directory placeholder.

### 1b. Re-root the Python package chain

- [x] Create `tests/__init__.py`, `tests/contract/__init__.py`, `tests/contract/hooks/__init__.py`.
- [x] `git rm` the three old `__init__.py` markers.
- [x] `SCHEMATHESIS_HOOKS` default → `tests.contract.hooks.seeded_ids`; `hookFilePath` re-pointed.
- [x] Swept the dotted module path — one extra hit beyond the plan:
      **`docs/how-to/ci-cd/daily-pipeline-playbook.md:155`** carried a copy-pasteable
      `export SCHEMATHESIS_HOOKS=…` with the old module. Updated. (`schemathesis.toml` has no
      path references; no workflow sets the var.)

### 1c. Update every consumer

- [x] `package.json:31,32,33,38` · `backend-ci.yml:309,353,359,432,482` · `.gitignore:93,94`
- [x] `tsconfig.eslint.json` — added `tests/**/*` so ESLint still covers the moved JS.
- [x] Removed the two committed generated Newman reports.
- [x] **Not in the plan:** `.dockerignore` excluded `docs/` and `__tests__/` but not
      `tests/`, so the moved assets would have entered the Docker build context. Added `tests/`.
- [x] **Not in the plan:** internal path math. Both script families compute `repoRoot` by
      counting parent levels, and the depth changed from 5 to 4: - logger import `../../../../../scripts/logger.js` → `../../../../scripts/logger.js` (×4 files) - `run-contract-local.js` `repoRoot`: 4 parents → 3 - schemathesis `repoRoot`: `../../../../..` → `../../../..`; `schemathesisDir` rebuilt - pip-install path in two error messages
      `specPath` still points at `docs/reference/api/` — correct until Phase 3.

### Deviation — `tsconfig.json`, not `tsconfig.eslint.json`

`tsconfig.json:51` already listed `"tests/**/*"` in `include`, a **no-op while no top-level
`tests/` existed**. The move populated it, and with `checkJs: true` + `strict` the four plain
Node scripts produced 29 type errors — they were never type-checked under `docs/`. Added
`"tests/contract/**/*.js"` to `exclude` to preserve prior behavior rather than annotate the
scripts (out of scope).

**Gate — results**

| Check                                  | Result                                                                      |
| -------------------------------------- | --------------------------------------------------------------------------- |
| `npm run lint`                         | 0 (needed one `lint:fix` pass for Prettier width)                           |
| `npm run typecheck`                    | 0                                                                           |
| `npm run format:check`                 | 0                                                                           |
| `npm run test:unit`                    | **84 suites / 497 tests** — matches the pre-move audit baseline exactly     |
| `npm run test:unit:security-framework` | 1 suite / 8 tests                                                           |
| Stale-path sweep (non-`.md`)           | zero hits for `4-contract-tests` / `contract_hooks`                         |
| Python module resolves                 | `tests.contract.hooks.seeded_ids` **FOUND**; old path `ModuleNotFoundError` |
| JS `repoRoot` + asset paths            | all resolve to repo root; all assets present                                |
| Script smoke-load                      | all 4 load and fail at env validation, not on import/path                   |
| `run-local.js` spec check              | passes `fs.access(specPath)`, reaches the health check                      |

### Full contract gate — run locally against real infra (Colima/Docker)

The CI `contract_local` job was mirrored end to end: `docker compose up db redis` → `build` →
`docs:openapi:generate` → `db:migrate:test` (26 migrations) → `start:test` on :4000 → both suites.

| Check                                      | Result                                                                                                                                                                                     |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `docs:openapi:check` (drift gate)          | 0 — generator still writes where CI diffs                                                                                                                                                  |
| `npm run test:contract:local` (Newman)     | **5/5 collections, 60 assertions, 0 failures**                                                                                                                                             |
| Newman reports written                     | 10 files under `tests/contract/postman-newman/reports/local/`                                                                                                                              |
| `npm run test:contract:schemathesis:local` | 0 — 38/43 operations selected, **32 generated / 32 passed**                                                                                                                                |
| Schemathesis reports written               | JUNIT + HAR under `tests/contract/schemathesis/reports/local/`                                                                                                                             |
| **Hook actually executed**                 | 5 `[schemathesis-hook]` lines from `_debug_case_path` (via `SCHEMATHESIS_HOOK_DEBUG=1`) covering `/auth/register`, `/auth/login`, `/metric-categories`, `/metric-logs`, `/metric-settings` |
| **Negative control**                       | forcing `SCHEMATHESIS_HOOKS=documents.tests.contract_hooks.seeded_ids` → **exit 1, `ModuleNotFoundError`**                                                                                 |

The negative control is the important one: it proves Schemathesis **fails loudly** on a bad hook
module rather than passing vacuously — so the green run above genuinely loaded the relocated hook.
This fully satisfies the "comparable finding count" gate, which was written before we knew a
cleaner check existed.

### Two more issues found only by running it

- **`__pycache__` was never gitignored.** Importing the hook generates it; previously it landed in
  `tests/contract/hooks/__pycache__/`, now in `tests/`. Never committed only by luck.
  Added `__pycache__/` and `*.py[cod]` to `.gitignore`. Pre-existing gap, exposed by this phase.
- **`PORT` mismatch.** `.env.test.example` ships `PORT=8002`, but the contract scripts default to
  `http://localhost:4000` and `backend-ci.yml:250` sets `PORT: 4000` at job level. A developer
  following the example alone gets a server the contract suite cannot reach. Not changed here
  (pre-existing, outside Phase 1) — **logged as a follow-up**.

### Local environment notes (no repo changes)

All gitignored: `.env`, `.env.test` (from the examples; without them every unit suite fails on a
missing `JWT_SECRET`), `.venv-schemathesis` (Python 3.12 — local `python3` is 3.9.6, CI uses 3.11).

`npm run db:migrate:test` **fails on Node 26** — `.sequelizerc` uses `require()` in a
`"type": "module"` repo, which only works on the mandated Node 20 (`.nvmrc`). Worked around
locally with `--options-path /dev/null --migrations-path src/migrations`. CI is unaffected (Node
20), but anyone on newer Node hits this. **Logged as a follow-up.**

**Commit boundary: Phases 0–1.**

---

## Phase 2 — Rename the docs tree to `docs/` DONE (2026-08-16)

- [x] `git mv documents docs` — **272 renames** detected by git (123 pure, 149 rename+edit), so
      history follows every file.
- [x] Rewrote the path prefix in **181 files**; all hardcoded consumers updated
      (`package.json:62`, both OpenAPI scripts, both security scripts, `backend-ci.yml`,
      `backend-prd-drift-warning.yml`, `CODEOWNERS`, `pull_request_template.md`, `.gitignore`,
      `.gitattributes`, `.dockerignore`, `tsconfig.eslint.json`, `protect-files.sh`).
- [x] Prose links updated: `README.md`, `CONTRIBUTING.md`, `SAAS-BASE-CHECKLIST.md`, `CLAUDE.md`,
      `.claude/rules/*`, `.claude/skills/*`, `.claude/agents/doc-writer.md`, agent-memory files.

### A prefix sweep is not enough — four path **segments** had no slash

`grep "documents/"` cannot see a path assembled from quoted segments. These were found by
searching for the bare quoted word and would otherwise have broken silently:

| Location                                             | Form                                             |
| ---------------------------------------------------- | ------------------------------------------------ |
| `tsconfig.build.json:9`                              | `"exclude": [… "documents" …]`                   |
| `tests/contract/schemathesis/scripts/run-local.js`   | `path.join(repoRoot, "documents", "openapi", …)` |
| `tests/contract/schemathesis/scripts/run-staging.js` | same                                             |
| `scripts/generate-documentation.ts:12`               | `path.join(__dirname, "../documents")`           |

### Cleanup of rot introduced by Phase 1

Doc prose still pointed at contract assets that Phase 1 moved. Repointed to `tests/contract/**`
in the **actionable** docs only (runbooks, READMEs, pipeline checklists, the CI/CD guide).
**Historical review evidence was deliberately left untouched** — e.g. the 2025-12-14 consistency
checklist records "runner script missing at `…/run-contract-local.js`" as an observation made at
the time; rewriting it would falsify the record. Same for the superseded
`test-structure-concern.md`, which quotes `package.json` as it then was.

Also removed two dead entries from `docs/README.md`: the "Root Files" table (both rows pointed at
files that no longer exist) and the two remaining `LLM_CONTEXT.md` references — the most visible
broken link in the tree, since the file opened by telling every reader and agent to read it first.

> **Watch for sed self-corruption.** The sweep rewrote this checklist too, turning the Phase 2
> heading into "Rename `docs/` → `docs/`" and its own gate command into a grep for `docs/`.
> Passages that describe the _pre-migration_ state must keep saying `documents/`; restored here
> and in PLAN.md §4.

**Gate — results**

| Check                                         | Result                                                                |
| --------------------------------------------- | --------------------------------------------------------------------- |
| `grep -rn "documents/"` repo-wide             | **0 hits**                                                            |
| `npm run lint` / `typecheck` / `format:check` | 0                                                                     |
| `npm run test:unit`                           | 84 suites / 497 tests                                                 |
| `npm run test:unit:security-framework`        | 1 suite / 8 tests                                                     |
| `npm run docs:openapi:check`                  | 0 — generator writes to `docs/reference/api/`, CI diffs the same path |
| `npm run test:contract:local`                 | 5/5 collections, 60 assertions, 0 failures                            |
| `npm run test:contract:schemathesis:local`    | 38/43 operations, 32/32 passed, 5 hook traces                         |
| Security scripts + Jest schema gate           | all three `docs/security/**` paths resolve                            |

Re-running both contract suites mattered here: `specPath` in the Schemathesis runners now
resolves `docs/reference/api/lakira-backend-openapi.json`, and the runner aborts on `fs.access` if the
spec is missing — so a green run proves the new path resolves.

### Prettier reformatted 8 files under the schema-validated `docs/security/**`

`documents/` → `docs/` is 5 characters shorter, so Prettier re-flowed every markdown table
containing a path. `.claude/lessons.md` forbids restructuring these files (a Jest suite validates
their columns), so the diff was proven safe before accepting it: normalising away the
substitution and table-rule padding left **162 changed lines matching exactly**, and
`test:unit:security-framework` passes. No column, header, or row was lost.

**Commit boundary: Phase 2.**

---

## Phase 3 — Reshape into Diátaxis quadrants DONE (2026-08-16)

Result: **45 shipped files** across the four quadrants, **224 files** fenced under `internal/`.

### 3a. `internal/`

- [x] `initiatives/` ← 13 architecture kits, the feature kits, 4 test-layer kits, `tests-overhaul`,
      and the CI pipeline plan/checklist/backlog.
- [x] `audits/saas-readiness/` and `audits/security/` — **moved, not archived**; saas-readiness
      tracks open P0s.
- [x] `incidents/`, `dev-log/`, `todos/`, and `archive/` (code reviews, product genesis, Jenkins
      notes, superseded test plans, docker runner plan).
- [x] `archive/frontend/` ← the frontend CI/CD tree and both frontend PRDs — they document a
      separate Next.js repository.
- [x] `internal/README.md` written: states the fork prune, points at the quadrants, and warns that
      saas-readiness is live risk rather than history.

### 3b–3d. The four quadrants

- [x] `reference/` — `api/` (generated spec), `security/` (framework + `audit-run-template/`),
      `database-schema.md`, `environments.md`, `ci-pipeline/`, `branch-protection.md`,
      `frontend-handoff.md`.
- [x] `how-to/` — `development/`, `testing/`, `ci-cd/`, `security/`.
- [x] `explanation/` — `architecture/` (3 durable references lifted out of the migration kit),
      `testing-strategy.md`, `product-requirements.md`, `documentation-standards.md`.
- [x] `tutorials/README.md` placeholder — git cannot track an empty directory, so the quadrant
      would not exist for anyone else until Phase 7 fills it.

### Deviations from the plan

- **`reference/ci-pipeline/` is a directory, not a single `ci-pipeline.md`.** The plan called for
  merging `CI_CD_STRATEGY` + `backend/README` + `PIPELINE_PLAN` + `WORKFLOW_GUIDELINES` into one
  file — roughly 1,260 lines. Kept as `strategy.md`, `pipeline-overview.md`, and
  `workflow-guidelines.md`; the plan document went to `internal/initiatives/ci-pipeline/`.
- **`branch-protection.md` went to `reference/`, not `internal/`.** It is a durable ruleset
  reference, not a record of past work.
- **Phase 4 pruning was pulled forward** (the plan already groups 3–4 in one commit) so no legacy
  `documentation/`, `development/`, `ci-cd/`, `tests/`, `docker/` directories were left standing.

### The move breaks every cross-reference — a 47-rule remap was required

Relocating the tree beneath its own documents invalidated their internal links. Rebuilt with an
ordered, most-specific-first `sed` script applied to 168 files. The failure that surfaced it:

`security-framework.validation.test.ts` failed on _"audit index links valid run folders"_ —
`docs/internal/audits/security/index.md` stores **repo-root-relative** folder paths in a table
column, and the test resolves them with `path.join(ROOT, folderPath)`. A structural doc move
therefore breaks a **test**, not just a link. Green again after the remap.

Two classes the remap could not see, fixed separately:

- **Relative kit-internal links** (`../references/shared-middleware.md`) — invisible to an
  absolute-path regex. Rewritten to repo-root-relative form, per the convention in
  `explanation/documentation-standards.md`.
- **`CODEOWNERS` guarded `docs/security/**`\*\*, which no longer exists. Security content is now
  split three ways by purpose, so all three paths are listed explicitly — otherwise the security
  tree would have silently lost its required reviewer.

---

## Phase 4 — Prune DONE (2026-08-16)

- [x] `lakira-backend-types.md` (2,065 lines of copy-pasted `src/types/`) — deleted.
- [x] `lakira-backend-routes.md` (390 lines, zero organization routes) — deleted; superseded by
      the generated, CI-gated spec.
- [x] `metric-feature-codes-ARCHIVED` + `metric-category-feature-codes-ARCHIVED` (2,881 lines of
      raw source dump) — deleted.
- [x] `scripts/generate-documentation.ts` and `scripts/generate-export-reference.ts` — deleted;
      no npm script or workflow referenced either.
- [x] `.gitignore` rule for `code-for-export-reference/` removed with the script that wrote it.

**5,815 deletions** across 273 files.

**Gate — results**

| Check                                 | Result                                                         |
| ------------------------------------- | -------------------------------------------------------------- |
| `lint` / `typecheck` / `format:check` | 0                                                              |
| `test:unit`                           | 84 suites / 497 tests                                          |
| `test:unit:security-framework`        | 8 tests — passes against relocated audit + template roots      |
| `docs:openapi:check`                  | 0 — generator and CI diff both follow to `docs/reference/api/` |
| `test:contract:local`                 | 5/5 collections, 60 assertions, 0 failures                     |
| `test:contract:schemathesis:local`    | 38/43 operations, 32/32 passed, 5 hook traces                  |

Contract suites were re-run because `specPath` moved again, to
`docs/reference/api/lakira-backend-openapi.json`.

**Commit boundary: Phases 3–4.**

---

## Phase 5 — Rewrite the reference layer DONE (2026-08-16)

- [x] `reference/database-schema.md` — rewritten from a **freshly migrated live database**, not
      from reading migration files. 13 tables, all FK on-delete behaviour, unique/partial indexes,
      enums, and the tenancy model.
- [x] `reference/configuration.md` — all **65** environment variables, extracted by parsing the
      Zod schema in `src/config/zodEnv.ts` rather than transcribed by hand.
- [x] `reference/commands.md` — every npm script worth running, each verified to exist.
- [x] `reference/api/README.md` — spec pointer, the do-not-hand-edit rule, coverage, known gaps.
- [x] `/api/v1/admin/_ping` recorded as an OpenAPI gap (served, guarded, never registered).
- [x] Dead references cleaned out of the shipped tree.

### The README's quick start was broken

`npm run migrate:dev` — **step 4 of the repository README** — does not exist:

```
$ npm run migrate:dev
npm error Missing script: "migrate:dev"
```

The real names are `migrate:development` and `migrate:development:undo`. The wrong ones were
also in `.claude/rules/commands.md` and `.claude/skills/new-migration/SKILL.md`, so both humans
and agents were being handed a command that fails. Fixed in all four places.

**Root cause is duplication.** `.claude/rules/commands.md` held a second hand-maintained copy of
the command list, and copies drift. It is now a pointer to `docs/reference/commands.md` plus the
four gate commands, with a note not to reintroduce a copy. A parser now checks every
`npm run …` in the reference docs against `package.json`.

> Renaming needs care: `migrate:dev` is a **prefix** of `migrate:development`, so a second `sed`
> pass rewrote its own output into `migrate:developmentelopment:undo`. Order substitutions
> longest-first, or verify after.

### Findings from introspecting the live schema

Neither breaks anything today; both are logged as follow-ups.

1. **Duplicate foreign keys.** `metrics`, `metric_logs`, `metric_settings`, and
   `metric_categories` each carry _two_ identical `organization_id` constraints
   (`…_fkey` and `…_fkey1`) — almost certainly `20260510000005` and `20260510000006` both adding
   one. Doubles FK-check work on every write.
2. **Orphaned enum types.** `enum_users_role` survives though its column was dropped in
   `20260516000001`; `enum_metric_log_type` lingers beside the live `enum_metric_logs_type`.

### `APP_NAME` is not in the Zod schema

`src/config/app-name.ts` reads `process.env.APP_NAME` directly because `logger.ts` imports it
before `envManager` initialises, and routing it through the validated env would deadlock the
bootstrap. Deliberate, commented at the source, and now documented — it is the one variable that
escapes validation.

**Gate — results**

| Check                                  | Result                                                                                |
| -------------------------------------- | ------------------------------------------------------------------------------------- |
| `lint` / `typecheck` / `format:check`  | 0                                                                                     |
| `test:unit`                            | 84 suites / 497 tests                                                                 |
| `docs:openapi:check`                   | 0                                                                                     |
| Every `npm run` in the new docs exists | verified against `package.json`                                                       |
| Broken links **in the shipped tree**   | **0** (3 remaining are template placeholders and the `/api/v1/docs/openapi.json` URL) |

Schema and config content were verified against the running system: the tables, columns,
constraints, and indexes were read out of a live migrated database, and the variable table was
generated from the schema that validates it.

**Commit boundary: Phase 5.**

---

## Phase 6 — Build the ADR registry DONE (2026-08-16)

**52 entries triaged → 37 promoted** to `docs/explanation/decisions/`, one per file, globally
numbered and ordered by decision date. 22 Accepted, 15 Proposed.

- [x] Triaged all 52 across 19 kit-local logs into _architecture_ (promote) vs
      _project-management_ (leave in the kit).
- [x] Split, renumbered `adr-0001`…`adr-0037`, converted bold-label bodies to Nygard headings
      (`## Context` / `## Decision` / `## Options considered` / `## Consequences` / `## Links`).
- [x] Statuses preserved. ADR-0035/0036/0037 (the 2026-06-05 findings) remain **Proposed** —
      they are not implemented, and ADR-0035's cache-key P0 is still live in the code.
- [x] Every promoted entry leaves a resolving stub at its original location, so existing
      cross-references still land somewhere useful.
- [x] `decisions/README.md` — index table plus how to read a record and how to add one.
- [x] `ADR-SEC-*` (6 entries) left with their audit runs — they are scoped to a run, not to the
      architecture.

### What "architecture decision" was taken to mean

Promoted if it constrains how the system is built and would still matter to someone who never
saw the initiative: token hashing, FK cascade behaviour, port boundaries, queue topology, module
layout, cache-key scoping.

Left in the kit if it only coordinates the work: audit cadence, phase ordering, which cheap sweep
to run first, whether to accept a "gold with caveats" verdict, formatting-tool choice. Fifteen
entries, all still readable in place — they are not lost, just not architecture.

### Corrections made along the way

- **`feature-audience-restructure` had five ADRs dated literally `YYYY-MM-DD`** and marked
  Proposed. Git shows the kit and the implementing PR (#33) both landed **2026-05-01**. Dates
  backfilled, status corrected to Accepted, and each record carries a note saying so.
- **That kit's README claimed "Planning — awaiting approval"** while `src/features/public/` and
  `src/features/shared/` had been live for months and three later kits cited them as fact.
  Rewritten to state it shipped, with a pointer that the code, not the unticked checklist, is the
  record. Also notes that ADR-0013's `admin/` bucket is still unused.
- **Two status vocabularies.** The observability kit used `Implemented`, which is not one of
  Nygard's states. Normalised to `Accepted` with the original wording preserved in a note.
- **Two body formats.** The static-checks kit wrote `- **Context:**` as list items rather than
  block labels, so the first pass left three records without headings. Caught by the structural
  gate, not by eye.

**Gate — results**

| Check                                               | Result                                                      |
| --------------------------------------------------- | ----------------------------------------------------------- |
| No ADR number appears twice                         | 37 files, 0 duplicates                                      |
| Every promoted entry has a resolving stub           | 37 stubs, 0 broken                                          |
| Every record has Status + Date + Origin             | Yes                                                         |
| Every record has Context/Decision/Consequences      | Yes                                                         |
| No leftover bold labels that should be headings     | Yes                                                         |
| Relative links in `explanation/` resolve            | 0 broken (excluding template placeholders in fenced blocks) |
| `lint` / `typecheck` / `format:check` / `test:unit` | 0 · 497 tests                                               |

Phase 3 fallout also cleaned up here: `feature-slice-ddd.md` and `shared-middleware.md` still
carried relative links into the kit they were lifted out of.

**Commit boundary: Phase 6.**

---

## Phase 7 — Author new content DONE (2026-08-16)

- [x] `explanation/architecture/c4-context.md` — L1: users, the API, six external systems.
- [x] `explanation/architecture/c4-containers.md` — L2: API server + job worker, plus a
      middleware-order diagram for the request path.
- [x] `explanation/architecture/c4-components-auth.md` — L3: the auth slice's four layers and the
      port/adapter seams.
- [x] `explanation/architecture/README.md` — ties the three levels together.
- [x] `tutorials/getting-started.md` — clone → running API → authenticated request with data.
- [x] `tutorials/your-first-feature-slice.md` — read `metric-category` end to end, then add an
      endpoint.
- [x] `tutorials/fork-and-rebrand.md` — what `bootstrap-fork.sh` changes and what it cannot.
- [x] `tutorials/README.md` — ordered index.

### The tutorial was executed, not drafted

Every request in `getting-started.md` was run against a live server, which is the only reason it
is correct. Two payloads I would have written from the route signature are wrong:

- `POST /auth/register` **requires `passwordConfirmation`**. Without it:
  `{"status":"fail","errors":[{"field":"passwordConfirmation","message":"Required"}]}`
- `POST /metric-logs` **requires `type`** (`manual` | `automatic`). Without it:
  `{"field":"body.type","message":"Invalid log type"}`

Both failures are now shown in the tutorial rather than hidden, because they are exactly what a
reader will hit.

Also corrected from the source: `.env.example` ships `JWT_SECRET=replace-with-a-long-random-secret`,
not an empty value — so the app _does_ boot without editing it. The tutorial says so, and says why
that is not good enough beyond the tutorial.

Registering was confirmed to auto-create a personal organization and return a token whose payload
carries `organizationId` — the multi-tenancy model, visible in the very first response.

### Diagrams were rendered, not eyeballed

All four Mermaid blocks were extracted and compiled with `@mermaid-js/mermaid-cli`; each produced
a real SVG (24–38 KB). A balanced-bracket check is not evidence that a diagram parses.

The L3 diagram shows the _intended_ persistence grouping, and says so: `shared/auth` is still flat
while `metric-category` is nested, which is precisely the drift
[ADR-0037](../../../explanation/decisions/adr-0037-resolve-canonical-ddd-layout-disagreement.md)
proposes to fix. Verified in the tree, not assumed.

**Gate — results**

| Check                                 | Result                            |
| ------------------------------------- | --------------------------------- |
| Every `getting-started.md` request    | executed against a live server    |
| Mermaid diagrams                      | 4/4 render to SVG via mermaid-cli |
| Relative links in the shipped tree    | **0 broken** of 170               |
| `lint` / `typecheck` / `format:check` | 0                                 |
| `test:unit`                           | 84 suites / 497 tests             |

Fixed one straggler from Phase 3 while checking: the CI/CD playbook still linked
`../security/DEPENDENCY_POLICY.md`.

**Commit boundary: Phase 7.**

---

## Phase 8 — Realign the rules DONE (2026-08-16)

The restructure only holds if the instructions agents follow describe the new tree. Both files
that route new documentation were stale, and — more importantly — they contradicted each other.

- [x] `.claude/rules/documentation.md` rewritten: Diátaxis-keyed placement table, kit pattern
      scoped to `internal/initiatives/` only, ADR promotion rule.
- [x] `.claude/agents/doc-writer.md` rewritten to carry **the same table, byte-identical**,
      fenced by `<!-- PLACEMENT-TABLE:START/END -->` markers so drift is detectable.
- [x] `CLAUDE.md` § Documentation replaced with a quadrant table and a pointer to the rules file.
- [x] `docs/explanation/documentation-standards.md` reframed: Diátaxis first, doc kits second,
      plus the ADR-promotion rule and the new record template.
- [x] `.claude/rules/security.md` split into framework (`reference/security/`) vs runs
      (`internal/audits/security/`).
- [x] `.claude/rules/commands.md` was already made a pointer in Phase 5.

### The root cause, fixed

`.claude/rules/documentation.md` sent architecture docs to `docs/development/architecture/`;
`.claude/agents/doc-writer.md` sent them to `docs/documentation/architecture/`. Both were live
agent instructions, both were obeyed, and the result was the two parallel architecture trees this
overhaul existed to merge. Restructuring without reconciling them would have rebuilt the split
within a few features.

The shared block is now delimited by HTML comments in both files, and the gate compares them
byte-for-byte. Editing one without the other is a detectable error rather than a silent one.

Both files also still routed to `docs/tests/<topic>/`, `docs/ci-cd/<topic>/`,
`docs/documentation/product/`, and `docs/security/<topic>/` — four folders that no longer exist.

### Lessons folded into the guidance

The rules now carry the specific failures this overhaul uncovered, as rules rather than anecdotes:

- **Never keep a second copy of content** — `.claude/rules/commands.md` held a duplicate command
  list and drifted into documenting a `migrate:dev` script that never existed.
- **Keep checklists honest** — the audience-restructure kit read 0/99 with `YYYY-MM-DD`
  placeholders while the code had shipped months earlier.
- **Cross-link repo-root-relative** — relative links break the moment a file is lifted out of its
  kit, which is exactly how the architecture references broke in Phase 3.
- **Never reformat `internal/audits/security/**`\*\* — schema-validated by a Jest suite.
- **Render Mermaid before committing** — a bracket count is not a parse.

**Gate — results**

| Check                                                        | Result                                                |
| ------------------------------------------------------------ | ----------------------------------------------------- |
| Placement tables byte-identical                              | 1,824 chars, exact match                              |
| Concrete `docs/` paths in `.claude/**` + `CLAUDE.md` resolve | 50 checked, 0 missing (2 prose placeholders excluded) |
| `lint` / `typecheck` / `format:check`                        | 0                                                     |
| `test:unit`                                                  | 84 suites / 497 tests                                 |
| `docs:openapi:check`                                         | 0                                                     |

**Commit boundary: Phase 8 (or fold into 8–9).**

---

## Phase 9 — Fork-proofing DONE (2026-08-16)

- [x] `scripts/bootstrap-fork.sh` removes `docs/internal/` by default, with `--keep-internal` to
      opt out. Reports the file count and warns that the upstream SaaS-readiness audit went with it.
- [x] `security-framework.validation.test.ts` survives a pruned tree.
- [x] `README.md` § Forking documents the prune and links the full tutorial.
- [x] `scripts/security/init-audit-doc-kit.mjs` — **no change needed**; it already used
      `fs.mkdir(..., { recursive: true })`, which creates the audit root from nothing. Verified in
      the dry-run rather than assumed.
- [x] Fixed: the fork script's own closing instructions said `npm run migrate:dev` — the script
      that never existed. Third place this had propagated.

### The test fix is a split, not a skip

Guarding the whole suite would have cost a fork its **template** validation, which ships and is
exactly what a forker depends on. `schema conformance` asserted on both the shipped templates and
this project's `audit-2026-02-18` run in one test, so it was split:

| Test                                             | In a fork |
| ------------------------------------------------ | --------- |
| init script creates every required artifact      | runs      |
| shipped templates have required sections/columns | runs      |
| 3 × gate-policy evaluation                       | runs      |
| current audit run matches template columns       | skipped   |
| finding traceability                             | skipped   |
| audit index continuity                           | skipped   |
| portfolio sanitization                           | skipped   |

Only assertions about _this project's history_ skip. The framework is still proven.

### Fork dry-run — the gate that matters

Ran against a clean copy with the Phase 8–9 changes applied:

```
docs/internal before          224 files
./scripts/bootstrap-fork.sh --name tmp-app
  → Renaming 'lakira-backend' → 'tmp-app' (short: lakira → tmp-app)
  → Removed docs/internal (224 files of upstream working material)
docs/internal after           GONE
shipped docs                  94 files
```

| Check in the fork                      | Result                                                                                |
| -------------------------------------- | ------------------------------------------------------------------------------------- |
| `npm ci`                               | 0                                                                                     |
| `npm run test:unit`                    | **494 passed, 4 skipped, 0 failed**                                                   |
| `npm run test:unit:security-framework` | 5 passed, 4 skipped                                                                   |
| `lint` / `typecheck` / `format:check`  | 0                                                                                     |
| Branding applied                       | `"name": "tmp-app"`, zero `lakira` hits in `package.json` / `docker-compose.test.yml` |
| `FORKED-FROM.md`                       | written                                                                               |

**A fresh fork's test suite is green on first run.** Before this phase it would have been red —
the security suite walked an audit root the prune deletes.

Two notes from the dry-run:

- The security test leaves empty `docs/internal/audits/security/` directories behind after
  running `init` (its `afterAll` removes the sample audit dir, not the parents). Zero files, and
  git does not track empty directories, so it is invisible in a repo.
- My first attempt failed for a reason that was **my** fault, not the fork's: an rsync
  `--exclude '.env.*'` also matched the tracked `.env.example` and `.env.test.example`. Worth
  recording because the failure looked exactly like a fork bug — 84 suites red on missing env.

**Commit boundary: Phases 8–9.**

## Final verification

- [ ] `npm run lint && npm run typecheck && npm run format:check` — clean.
- [ ] `npm test` — run as the project defines it (`test:unit` then `test:integration`). A combined
      `--selectProjects unit integration` run under `SKIP_DB_LIFECYCLE=true` produces **false**
      failures; do not use it.
- [ ] `npm run docs:openapi:check` — exit 0.
- [ ] `npm run test:contract:local` and `npm run test:contract:schemathesis:local` — pass.
- [ ] `npm run security:delta:gate` and `npm run test:unit:security-framework` — pass.
- [ ] **Link sweep: broken internal references 30 → 0.**

```bash
grep -rhoE '(docs)/[A-Za-z0-9._/-]+\.(md|json|ts|js|mjs|py|yml)' docs *.md .claude \
  | sort -u | while read p; do [ -e "$p" ] || echo "BROKEN: $p"; done
```

- [ ] Push the branch; `backend-ci.yml` green end to end, including the artifact-upload steps that
      reference the moved report paths.
- [ ] Fork dry-run green (Phase 9 gate).

---

## Follow-ups (explicitly out of scope)

Surfaced during the audit; each deserves its own ticket:

- [x] **Open P0s** — ADR-009/010 fixed in #64 (`f5f28b9`): cache keys carry `organizationId` and
      `DISABLE_RATE_LIMITING` is refused in production. (Updated 2026-09-24.)
- [ ] ADR-011 (registry ADR-0037, the persistence-layout migration) is still Proposed.
- [ ] `security/audit/audit-2026-05-18/` is still marked "Planned" — three months past its scheduled
      execution date, with the next quarterly cycle now due.
- [x] ~~`express-openapi-validator` is a declared dependency with zero imports~~ — removed, along
      with the now-obsolete `multer` override it existed to patch.
- [x] ~~`/api/v1/admin/_ping` is served but unregistered~~ — registered under a new `Admin` tag,
      deliberately outside the contract-test tag set.
- [ ] `docs/internal/todos/2026-06-04-*.md` carries an unchecked "2026-07-02 review" item, now ~6 weeks
      overdue.

Surfaced while running the Phase 1 gate on real infrastructure:

- [x] ~~**`.sequelizerc` breaks on Node > 20.**~~ — deleted. sequelize-cli only reads the exact
      filename `.sequelizerc` (a `.cjs` rename is ignored), so the 18 npm scripts and
      `scripts/db-migrate-test.mjs` now pass `--migrations-path src/migrations` explicitly.
      Verified: `npm run db:migrate:test` exits 0 on Node 26.
- [x] ~~**Duplicate `organization_id` foreign keys**~~ — dropped by migration
      `20260816000001`. Verified against a live database: 4 duplicates removed, all 8 legitimate
      org FKs intact, rollback restores the prior state exactly.
- [x] ~~**Orphaned enum types**~~ — dropped in the same migration (2 removed).
- [x] ~~**`DISABLE_RATE_LIMITING` missing from the example env**~~ — found while running the
      integration suite for this PR. `backend-ci.yml` sets it at job level in all three jobs, but
      `.env.test.example` never had it, so a developer following the example got 3 password-reset
      tests failing on 429s that were an artefact of the limiter. Added, with the reason inline.
- [x] ~~**`PORT` mismatch**~~ — `.env.test.example` now ships `PORT=4000`, matching the contract
      scripts and `backend-ci.yml`. The CI/CD playbook's inverted escape-hatch note was corrected.
