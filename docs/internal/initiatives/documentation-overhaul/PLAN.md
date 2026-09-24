# Documentation Overhaul — Plan

- **Status:** Done — landed directly on `dev` (`c896881` … `81f724d`) and in #60 (`638d75b`)
- **Owner:** @dimaszisby
- **Created:** 2026-08-16
- **Companion:** [CHECKLIST.md](./CHECKLIST.md)

---

## 1. Context & Goals

`docs/` holds **289 files / 26,265 lines**, organized by _artifact type_ (plans,
checklists, tickets, audits, reviews) rather than by _reader purpose_. A newcomer cannot tell
which document answers their question, and correct documents sit beside months-stale ones with
no signal distinguishing them.

### Evidence gathered during the audit

| Finding                                                                                                                                                                            | Verified how                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| **~22% link rot** — 30 of 138 unique internal doc-path references point at files that do not exist                                                                                 | Swept every `docs/…` reference in the tree and tested each target     |
| The first file `docs/README.md` tells readers _and agents_ to open — `docs/LLM_CONTEXT.md` — has never existed                                                                     | Absent from the working tree and from git history                     |
| **The reference layer is actively wrong.** `lakira-backend-db-schema.md` documents 5 tables and `enum_users_role`; the real schema has 12+ tables and `users.role` was **dropped** | `src/migrations/20260516000001-drop-users-role-column.cjs`            |
| `lakira-backend-routes.md` documents **zero** organization routes; the API serves six                                                                                              | `src/features/shared/auth/infrastructure/http/organization.router.ts` |
| The **generated** OpenAPI spec, by contrast, is accurate — 43 documented operations vs 44 route registrations — and CI-gated against drift                                         | `npm run docs:openapi:check`, `backend-ci.yml:60`                     |
| **52 ADRs across 19 files, all numbered from `ADR-001` per kit** — `ADR-001` collides ~12 times                                                                                    | Heading sweep across every `decisions.md`                             |
| **Docs that lie about shipped work:** `feature-audience-restructure` reads "Planning — awaiting approval", 0/99 boxes checked, ADR dates left as literal `YYYY-MM-DD`              | `src/features/public/` and `src/features/shared/` are live            |
| **Essentially no diagrams** — one mermaid block in the whole tree, in an archived 2025 code-review file                                                                            | Content sweep for ` ```mermaid ` and C4 terminology                   |
| **Executable code lives under the docs tree** — 4 Node scripts wired to npm, 5 Postman collections, a pip `requirements.txt`, and a 819-line Python hook module                    | `package.json:31-38`, `backend-ci.yml:309`                            |
| Two generated Newman reports are **committed** despite `.gitignore` covering that directory                                                                                        | `git ls-files` (once tracked, `.gitignore` no longer applies)         |

### Root cause of the two architecture trees

This is not accidental drift. Two live agent instructions contradict each other:

- `.claude/rules/documentation.md` → architecture docs belong in `docs/internal/initiatives/`
- `.claude/agents/doc-writer.md` → architecture docs belong in `docs/documentation/architecture/`

Both were followed. **Restructuring without fixing this guarantees the split reappears.**

### Goals

1. Organize by reader purpose (Diátaxis), so the question determines the folder.
2. Make the shipped tree portable — a fork gets documentation about _the template_, not about
   Lakira's history.
3. Prefer generated over hand-written wherever a generator already exists and is CI-gated.
4. Give ADRs one global namespace in the standard Nygard form.
5. Take link rot from 30 broken references to zero, and keep it there.

### Non-goals

- Fixing the open P0s described in §7. This is a documentation change.
- Rewriting content that is already accurate and current (`TESTING_STRATEGY.md`,
  `security/framework/**`, `CI_CD_DEVELOPER_SIMPLIFIED_GUIDE.md` all verified current).
- Introducing a docs site generator, search, or CI link-checking beyond a one-off sweep.

---

## 2. Target structure

```
docs/
├── README.md                        Diátaxis map — the one "start here"
│
├── tutorials/                                        [learning-oriented]
│   ├── getting-started.md              NEW   clone → running API → first authed request
│   ├── your-first-feature-slice.md     NEW   domain → application → infrastructure → test
│   └── fork-and-rebrand.md             NEW   from README §Forking + forkability kit
│
├── how-to/                                           [task-oriented]
│   ├── development/
│   │   ├── add-an-endpoint.md          NEW   from .claude/rules/api-design.md
│   │   ├── add-a-migration.md          NEW   from .claude/rules/database.md
│   │   ├── regenerate-the-openapi-spec.md    ← documentation/openapi-zod-guide.md
│   │   └── run-postgres-in-docker.md         ← docker/postgres-docker-guide.md
│   ├── testing/
│   │   ├── run-the-test-suites.md            ← tests/README.md + layer READMEs
│   │   └── contract-testing.md               ← 4-contract-tests prose (7 files merged)
│   ├── ci-cd/
│   │   ├── daily-pipeline-playbook.md        ← CI_CD_DEVELOPER_SIMPLIFIED_GUIDE.md
│   │   └── promote-and-deploy.md             ← ci-cd/backend/README.md deploy sections
│   └── security/
│       ├── run-a-security-audit.md           ← security/guides/{README,junior,scripts}
│       ├── release-delta-sop.md              ← security/guides/…-release-delta-sop.md
│       └── audit-branch-model.md             ← security/guides/…-workflow-branch-model.md
│
├── reference/                                        [information-oriented]
│   ├── api/
│   │   ├── README.md                   NEW   pointer: Swagger UI, spec, regeneration
│   │   └── lakira-backend-openapi.json       ← openapi/  ⚠ GENERATED, code-path
│   ├── database-schema.md              REWRITE from src/migrations (12+ tables)
│   ├── configuration.md                NEW   from .env.example + src/config/envManager.ts
│   ├── commands.md                     NEW   single source; .claude/rules/commands.md points here
│   ├── environments.md                       ← ci-cd/backend/ENVIRONMENTS_MATRIX.md
│   ├── ci-pipeline.md                        ← CI_CD_STRATEGY + backend/{README,PLAN,GUIDELINES}
│   └── security/
│       ├── control-catalog-asvs-ssdf.md      ← security/framework/
│       ├── risk-scoring-model.md             ← security/framework/
│       ├── evidence-standard.md              ← security/framework/
│       ├── security-exceptions-policy.md     ← security/framework/
│       ├── audit-master-checklist.md         ← security/framework/
│       ├── dependency-policy.md              ← DEPENDENCY_POLICY.md (snapshot split out)
│       ├── ci-gate-policy.json               ← security/framework/  ⚠ code-path
│       └── audit-run-template/               ← security/templates/audit-run/  ⚠ code-path
│
├── explanation/                                      [understanding-oriented]
│   ├── architecture/
│   │   ├── README.md                   NEW
│   │   ├── c4-context.md               NEW   L1 mermaid
│   │   ├── c4-containers.md            NEW   L2 mermaid — api, worker, postgres, redis, rabbitmq
│   │   ├── c4-components-auth.md       NEW   L3 mermaid — auth + multi-tenancy slice
│   │   ├── feature-slice-ddd.md              ← fvsm/references/feature-boundary-rules.md
│   │   ├── persistence-and-orm.md            ← fvsm/references/orm-bootstrap.md
│   │   ├── shared-middleware.md              ← fvsm/references/shared-middleware.md
│   │   ├── multi-tenancy.md                  ← multi-tenancy/README.md (durable half)
│   │   ├── auth-and-tokens.md                ← jwt + email-verification + password-reset READMEs
│   │   ├── async-messaging.md                ← rabbitmq/README.md
│   │   └── observability.md                  ← observability/README.md
│   ├── decisions/                      ADR REGISTRY — Nygard, flat, globally numbered
│   │   ├── README.md                   NEW   index: № · title · status · date · supersedes
│   │   └── adr-0001-….md … adr-00NN-….md     ~30 promoted from 52 kit-local entries
│   ├── testing-strategy.md                   ← tests/TESTING_STRATEGY.md (already current)
│   ├── product-requirements.md               ← documentation/product/lakira-backend-prd.md
│   └── documentation-standards.md            ← dev-documentation-guidelines.md, rewritten
│
└── internal/                           NOT shipped — bootstrap-fork.sh deletes this
    ├── README.md                       NEW   states plainly: removed on fork
    ├── initiatives/                          ← the 19 doc kits, moved verbatim
    ├── audits/
    │   ├── security/                         ← security/audit/* (3 dated runs)
    │   └── saas-readiness/                   ← saas-readiness/* (4 audits + FINAL summary)
    ├── incidents/                            ← incidents/
    ├── dev-log/                              ← development/dev-log/
    ├── todos/                                ← todos/
    └── archive/                              ← code reviews, frontend docs, superseded plans
```

Executable assets leave the docs tree entirely:

```
tests/contract/
├── postman-newman/{collections,environments,scripts}/
├── schemathesis/{scripts,requirements.txt}
└── hooks/seeded_ids.py                 + the __init__.py chain
```

---

## 3. Rationale

### Diátaxis needs a fifth bucket

Diátaxis classifies documentation by what the reader is doing. It deliberately says nothing
about **project working material** — plans, checklists, tickets, progress trackers, audit runs.
That material is roughly **200 of the 289 files** here. Forcing it into a quadrant would corrupt
the taxonomy; deleting it would destroy real evidence, including the currently-open security
findings.

So `internal/` sits _beside_ the four quadrants, not inside them, and the existing
`scripts/bootstrap-fork.sh` deletes it during a fork. The four quadrants are the template;
`internal/` is Lakira's history.

### Generated beats hand-written

The OpenAPI spec is accurate and drift-gated. The hand-written route and type docs describing
the same surface are months stale. Where a CI-gated generator already exists, the hand-written
twin is a liability:

- `lakira-backend-routes.md` → **deleted**, replaced by `reference/api/README.md` pointing at
  the spec and Swagger UI.
- `lakira-backend-types.md` (2,065 lines of copy-pasted `src/types/` source) → **deleted**.
  It can only ever drift from the code it duplicates.
- `lakira-backend-db-schema.md` → **rewritten** from `src/migrations/`. No generator exists for
  it, so it stays hand-written, but with an explicit "as of migration `<id>`" stamp so staleness
  is visible rather than silent.

### The security program ships; its audit runs don't

`security/framework/` + `security/templates/audit-run/` + `security/guides/` form a complete,
ASVS/SSDF-mapped, CI-enforced audit program with **zero Lakira-specific content** — the single
most portable asset in the repo. It belongs in the shipped tree. The three dated run instances
are Lakira's evidence and go to `internal/audits/security/`.

`DEPENDENCY_POLICY.md` is split accordingly: the policy is reference, and the
"Current Audit Snapshot (2026-01-19)" table appended to its end moves to `internal/audits/`.

### ADR triage, not bulk conversion

The 52 entries already carry Nygard's fields (Context / Decision / Status / Options considered /
Consequences / Links), so the work is splitting and renumbering, not rewriting. But not all 52
are architecture decisions — entries like _"Phase order and kit scaffolding for SaaS-readiness
remediation"_ are project-management decisions. Those stay in their kit under `internal/`.

- **~30 promoted** to `docs/explanation/decisions/adr-NNNN-<slug>.md`, one file each,
  globally numbered, chronologically ordered, statuses carried over **verbatim**.
- **`ADR-SEC-*` entries stay** with their audit runs — they are scoped to a run, not to the
  architecture.
- Each promoted ADR leaves a one-line stub in its original kit pointing at the new number, so
  existing cross-references keep resolving.

Numbers are assigned by original decision date, so the registry reads as a timeline.

### Frontend documentation leaves the shipped tree

`ci-cd/frontend/` (788 lines), `lakira-frontend-prd.md`, `lakira-frontend-prd-development-plan.md`,
`analytics-frontend-overhaul-*`, and `visualization-frontend-analysis.md` all document a
**separate Next.js repository**. They move to `internal/archive/frontend/` rather than into the
shipped tree of a backend template. `BACKEND_HANDOFF_FOR_FE_CICD.md` is the exception — it is a
genuine backend→frontend contract and becomes `docs/reference/frontend-handoff.md`.

### What gets deleted outright

| Path                                                                     | Lines | Why                                                          |
| ------------------------------------------------------------------------ | ----- | ------------------------------------------------------------ |
| `documentation/architecture/lakira-backend-types.md`                     | 2,065 | Copy-pasted `src/types/` source                              |
| `code-review/archive/metric-feature-codes-ARCHIVED-20251208.md`          | 1,206 | Raw source-tree dump for an LLM paste                        |
| `code-review/archive/metric-category-feature-codes-ARCHIVED-20251208.md` | 1,675 | Same                                                         |
| `documentation/architecture/lakira-backend-routes.md`                    | 390   | Superseded by the generated spec                             |
| `tests/…/postman-newman/reports/staging/*.{html,xml}`                    | —     | Committed generated artifacts                                |
| `documents/__init__.py`, `documents/tests/__init__.py`                   | —     | Python package markers; move with the hooks                  |
| `scripts/generate-documentation.ts`                                      | —     | Writes a file that doesn't exist; no npm script calls it     |
| `scripts/generate-export-reference.ts`                                   | —     | ~22 hardcoded paths targeting a gitignored, absent directory |

That is **5,336 lines removed** before any reorganization.

---

## 4. Consequences that require code changes, not path renames

These are the parts that genuinely break. Each needs a real fix.

**1. `.gitignore:100` contains a bare `docs` pattern.** Added for actionlint, it is unanchored,
so it matches a `docs` directory at any depth. The entire new tree would be silently untracked.
This must be anchored **before anything moves**, verified by `git check-ignore -v docs/README.md`
producing no output.

**2. The Schemathesis hook is a Python module path, not a file path.**
`SCHEMATHESIS_HOOKS=documents.tests.contract_hooks.seeded_ids` resolved through
`documents/__init__.py` → `documents/tests/__init__.py` → `contract_hooks/__init__.py`. This is
deliberate infrastructure, not an accident — both `__init__.py` files carry docstrings saying so.
Moving contract tests requires re-rooting the module to `tests.contract.hooks.seeded_ids`,
creating the new `__init__.py` chain, deleting the old, and updating the default in
`run-local.js:26` plus the CI/CD guide §7.

**3. A pruned fork must stay green.**
`__tests__/unit/security/security-framework.validation.test.ts:7-8` walks `AUDIT_ROOT` and
`TEMPLATE_ROOT`. Once `bootstrap-fork.sh` deletes `docs/internal/`, the audit root is gone and
this suite fails. **The test must treat "zero audit runs" as a pass** while still validating the
template. Without this, the fork script produces a repo whose test suite is red on first run —
the exact opposite of what a template should do.

**4. `scripts/security/init-audit-doc-kit.mjs`** reads the template from the shipped tree and
writes into `internal/`. It needs both new paths and must create the audit directory when a
pruned fork lacks it.

**5. The rule contradiction must be resolved in the same change.**
`.claude/rules/documentation.md` (frontmatter `paths: ["docs/**"]`) and
`.claude/agents/doc-writer.md` need one shared placement table keyed on Diátaxis. Otherwise
agents recreate the split.

---

## 5. Files touched outside `docs/`

**Hardcoded paths — mechanical, but each verified individually:**

| File                                              | Lines                        | What                                                   |
| ------------------------------------------------- | ---------------------------- | ------------------------------------------------------ |
| `package.json`                                    | 31, 32, 33, 38               | Contract-test script paths                             |
| `package.json`                                    | 62                           | OpenAPI drift-check diff target                        |
| `scripts/generate-openapi.ts`                     | 13                           | Hardcoded output directory                             |
| `scripts/normalize-openapi.ts`                    | 11                           | Hardcoded spec path                                    |
| `scripts/security/evaluate-gate.mjs`              | 10                           | Gate policy default                                    |
| `scripts/security/init-audit-doc-kit.mjs`         | 7, 8, 113                    | Template + audit roots                                 |
| `.github/workflows/backend-ci.yml`                | 101, 309, 353, 359, 432, 482 | Gate policy, pip requirements, 4 artifact paths        |
| `.github/workflows/backend-prd-drift-warning.yml` | 70, 75, 96                   | PRD + OpenAPI drift paths                              |
| `.github/CODEOWNERS`                              | 3                            | `docs/security/**` ownership                           |
| `.github/pull_request_template.md`                | 23, 24                       | Audit + SOP links every PR author sees                 |
| `.gitignore`                                      | 93, 94, 97, 100              | Report paths, export-reference, **the `docs` pattern** |
| `.gitattributes`                                  | 1                            | `docs/reference/api/*.json text eol=lf`                |
| `.dockerignore`                                   | 9                            | `docs/` build-context exclusion                        |
| `tsconfig.eslint.json`                            | 12                           | `docs/**/*` include (for the JS scripts within)        |
| `.claude/hooks/protect-files.sh`                  | 62                           | Write-guard on the generated spec                      |

**Prose and rules rewritten:** `CLAUDE.md` (Documentation §) · `README.md` · `CONTRIBUTING.md:48` ·
`SAAS-BASE-CHECKLIST.md` (7 links) · `.claude/rules/documentation.md` ·
`.claude/agents/doc-writer.md` · `.claude/rules/{commands,security,validation,workflow}.md` ·
`.claude/skills/{security-audit,gen-openapi}/SKILL.md` · `__tests__/unit/features/analytics/README.md`

**Behavioral changes:** `scripts/bootstrap-fork.sh` (prune step) ·
`__tests__/unit/security/security-framework.validation.test.ts` (tolerate an empty audit root)

---

## 6. Phasing

Ordered so the repository is never left broken between phases. See
[CHECKLIST.md](./CHECKLIST.md) for the executable steps.

| Phase | What                                                            | Revertable alone |
| ----- | --------------------------------------------------------------- | ---------------- |
| 0     | Unblock: anchor `.gitignore` `docs` pattern                     | yes              |
| 1     | Move executables to `tests/contract/`, re-root Python hooks     | yes              |
| 2     | `git mv documents docs`, sweep all path references              | yes              |
| 3     | Reshape into Diátaxis quadrants + `internal/`                   | yes              |
| 4     | Prune: delete source dumps, artifacts, dead scripts             | yes              |
| 5     | Rewrite reference: schema, API pointer, configuration, commands | yes              |
| 6     | Build the ADR registry (triage → split → renumber → index)      | yes              |
| 7     | Author new content: C4 diagrams, tutorials                      | yes              |
| 8     | Realign `CLAUDE.md`, `.claude/rules/*`, `doc-writer.md`         | yes              |
| 9     | Fork-proof: prune step + security-test tolerance                | yes              |

**Phase 1 is the riskiest and runs first, alone,** while the docs tree is still untouched — so a
contract-test or CI failure is unambiguously attributable.

Suggested commit boundaries: 0–1 · 2 · 3–4 · 5–6 · 7 · 8–9.

---

## 7. Risks

| Risk                                                                   | Mitigation                                                                                                                                           |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| A missed hardcoded path fails only in CI, not locally                  | Phase 2 ends with a repo-wide grep for `docs/` returning zero hits outside `internal/archive/`; push a branch and watch `backend-ci.yml`             |
| Python hook re-root silently no-ops, and Schemathesis passes vacuously | Assert the hook actually loads — compare finding counts before and after; a vacuous run reports suspiciously fast                                    |
| `git mv` history loss on the rename                                    | Use `git mv` throughout, never delete-and-recreate; verify with `git log --follow` on a sample file                                                  |
| The fork prune leaves a red test suite                                 | Phase 9 includes a real fork dry-run into a temp directory, ending in `npm test`                                                                     |
| ADR renumbering breaks ~20 existing cross-references                   | Every promoted ADR leaves a stub at its old location pointing to the new number                                                                      |
| The open P0s get buried by the reorganization                          | `internal/audits/saas-readiness/` keeps its `FINAL-AUDIT-SUMMARY.md` at the top of the kit, and its ADRs enter the registry as **Proposed** — see §8 |

---

## 8. Open security findings this overhaul must not bury

`saas-readiness/audit-2026-06-05.md` records **two unfixed P0s and one unfixed HIGH**. I
verified the primary P0 is still real, not historical:

`src/features/public/analytics/infrastructure/cache/VisualizationCacheRedis.ts` builds cache
keys as `viz:${userId}:${metricId}:…` and `vizdash:${userId}:…` — **no `organizationId`
component**. ADR-009 (tenant scoping required on every cache key) is genuinely open.

Consequences for this plan:

- The saas-readiness material **moves; it is not archived**.
- ADR-009, ADR-010, ADR-011 enter the registry with status **Proposed**, not Accepted.
- `SAAS-BASE-CHECKLIST.md` keeps pointing at the live audit, with links updated to the new paths.

Fixing these is out of scope here and should be tracked as separate work.

---

## 9. Success criteria

- Broken internal doc references: **30 → 0**.
- Every file under `docs/` sits in a quadrant matching its reader's purpose, or in `internal/`.
- `ADR-001` is unambiguous: exactly one document holds each ADR number.
- `scripts/bootstrap-fork.sh --name tmp-app` yields a repo with no `internal/` tree **and a green
  `npm test`**.
- `backend-ci.yml` passes end to end, including the artifact-upload steps referencing moved paths.
- `.claude/rules/documentation.md` and `.claude/agents/doc-writer.md` state the _same_ placement
  rule, so the next doc an agent writes lands in the right quadrant.
