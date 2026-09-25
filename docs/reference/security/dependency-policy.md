# Dependency Management Policy

## Purpose

Establish a predictable, portfolio-grade process for evaluating, triaging, and remediating dependency risks across the Lakira backend. This policy aligns local development, CI, and production expectations so auditors can trace exactly how runtime libraries are kept secure.

## Scope

- **Runtime dependencies** (packages shipped with the service: the Docker image, and today's Render deployment).
- **Dev/test tooling** (lint, jest, schemathesis, etc.) — still tracked, but lower priority unless they compromise CI.
- Direct and transitive packages listed in `package.json` / `package-lock.json`.
- Node.js runtime itself (pinned to `24.x` via `.nvmrc`, `.node-version`, `package.json "engines"` and the Dockerfiles; CI reads `.nvmrc`).

## Roles & Ownership

- **Primary DRI:** Backend maintainer (currently @dimaspramudya).
- **Supporting tooling:** GitHub Dependabot alerts + manual `npm audit`.
- All dependency upgrades must land via PR (no `npm audit fix --force` on main).

## Signals & Tooling

1. **Automated alerts**
   - GitHub Dependabot / Advisory alerts (monitored weekly).
   - CI pipelines (lint/typecheck/test/contract) to detect regressions after upgrades.
2. **Manual sweeps**
   - `npm audit --production` before every release tag or staging deploy.
   - Full `npm audit` (including dev deps) once per sprint or when upgrading entrypoints.
3. **Lockfile discipline**
   - Always commit `package-lock.json`.
   - Re-run `npm install --package-lock-only` when editing versions to avoid surprise sub-dep bumps.

## Severity & Response Targets

| Severity (CVSS / GHSA) | Surface            | Action & Target SLA                                                          |
| ---------------------- | ------------------ | ---------------------------------------------------------------------------- |
| Critical / High        | Runtime dependency | Patch or mitigate ≤ 72h. Hotfix PR allowed.                                  |
| Critical / High        | Dev-only tooling   | Patch in next sprint unless exploit impacts CI secrets.                      |
| Moderate               | Runtime            | Bundle with next planned maintenance window; document rationale if deferred. |
| Moderate / Low         | Dev/Test           | Address during dependency housekeeping tasks; track in checklist/todo.       |

When upstream fixes are unavailable, document compensating controls (feature flags, WAF rules) in `docs/internal/audits/security/` and open backlog issues.

## Workflow

1. **Triage**
   - Classify alert as runtime vs dev.
   - Determine exposed assets (auth, data plane, CI secrets).
   - Decide fix type: version bump, replace package, or remove dependency.
2. **Plan**
   - Create/update a TODO or checklist entry referencing the CVE/GHSA.
   - Note required verification (unit, integration, contract, OpenAPI).
3. **Implement**
   - Update `package.json` / lockfile manually; avoid bulk `--force`.
   - Run `npm run lint`, `npm run typecheck`, `npm run test:integration`, and contract suites if the change touches runtime code.
4. **Review**
   - Include risk summary + links to advisories in PR description.
   - Reference this policy and any tickets/checklists.
5. **Verify**
   - CI must pass (`backend-ci`).
   - `npm run docs:openapi:check` ensures spec stays stable after dependency updates that may alter schema generation.

## Runtime vs Dev/Test Triaging Guidelines

- **Runtime-first:** Prioritize packages such as Express, Sequelize, JSON Web Token utilities, Redis/Postgres clients, and any middleware that processes request payloads.
- **Dev/Test:** Tools like Jest, Prettier, ESLint are patched on a scheduled cadence unless the vulnerability leaks secrets or allows code execution during CI runs.
- Document categorization in the relevant checklist/todo.

## Upgrade Cadence

- **Monthly:** Run `npm audit --production` and capture findings.
- **Quarterly:** Refresh major dev-tooling train (Jest, ESLint) in a dedicated PR with release notes, following the doc kit pattern (plan/checklist/decisions).
- **Ad hoc:** Immediately when GitHub reports Critical/High runtime issues.

## Change Control Expectations

- Never run `npm audit fix --force` on main or release branches.
- Each upgrade PR:
  - references advisories or changelog,
  - links to affected docs/checklists,
  - states test evidence.
- If forced downgrades or patch forks are necessary, log a decision entry in `docs/internal/audits/security/audit-2025-11-21/security-audit-log-baseline-simple.md` (or a dedicated `decisions.md` once the dependency topic expands).

## Transitive Overrides

Some advisories live in a transitive package whose parent pins an outdated version and has no
newer release. `npm audit fix` cannot resolve these, and `npm audit fix --force` "fixes" them by
proposing a **downgrade of the top-level package** — which is destructive (see the warning under
Exceptions).

For these, use an `overrides` block in `package.json` to pin the vulnerable leaf to its patched
version, leaving the parent's version untouched.

Rules for adding an override:

1. **Same major only.** A patch or minor bump within the major the parent already depends on.
   Crossing a major is not an override decision — it is a dependency upgrade, with its own testing.
2. **Verify the consuming code path.** Confirm what the parent actually uses the package for, and
   whether our code reaches it. Record the finding in the PR.
3. **Never pin below the latest safe version.** An exact pin that is lower than what another
   dependency already resolves will _downgrade_ that dependency and can introduce new advisories.
   Check the full advisory range, not just the one you are fixing.
4. **Re-run the full suite.** Overrides force a version past a declared constraint, so
   `npm test` plus `npm run contract:local:gate` are required evidence.
5. **Prefer removal.** If the parent is itself unnecessary, drop it instead of overriding it.

## Exceptions

- When upstream fixes are not available:
  - Add temporary suppression note in `docs/reference/security/dependency-policy.md` (this file) or a companion log.
  - Monitor advisory weekly; create a calendar reminder.
  - Prefer defense-in-depth mitigations (rate limiting, schema validation, feature flags).

## References

- Node 24 pinning: `.nvmrc`, `.node-version`, `package.json "engines"`, `Dockerfile`, `Dockerfile.dev`.
- CI enforcement: `.github/workflows/backend-ci.yml`.
- Security audit artifacts: `docs/internal/audits/security/`.

---

## Superseded Snapshot (2026-01-19)

> Superseded by the 2026-08-23 snapshot below. Retained as a record of what was true then.

### Runtime Findings (Resolved 2026-01-19)

| Package / Path                                               | Version (before) | Severity | Surface                                        | Advisory                                                                 | Status                                                                                                                                                                                 |
| ------------------------------------------------------------ | ---------------- | -------- | ---------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `qs` via `express` / `body-parser`                           | 6.13.0           | High     | **Runtime** (request parsing)                  | [GHSA-6rw7-vpxm-498p](https://github.com/advisories/GHSA-6rw7-vpxm-498p) | **Resolved 2026-01-19:** upgraded `express` → `4.22.1`, added explicit `body-parser` `^1.20.4`, bumped `express-openapi-validator` → `5.6.1`, verified `npm audit --production` clean. |
| `tar` via `@mapbox/node-pre-gyp` (transitive under `bcrypt`) | 6.1.15           | High     | **Runtime install hook** (native module fetch) | [GHSA-8qq5-rm4j-mr97](https://github.com/advisories/GHSA-8qq5-rm4j-mr97) | **Resolved 2026-01-19:** upgraded `bcrypt` → `6.0.0` (drops `@mapbox/node-pre-gyp`), verified tests + audit clean.                                                                     |

- Snapshot derived from `npm audit --production` executed on **2026-01-19** after applying the fixes above.
- Evidence: `npm run lint`, `npm run typecheck`, and `npm audit --production` all pass on the upgraded dependencies.

### Dev/Test Findings (Open 2026-01-19)

| Package / Path                        | Version | Severity | Surface                                         | Advisory                                                                 | Status / Plan                                                                                                                                                                |
| ------------------------------------- | ------- | -------- | ----------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `diff` via `ts-node` (Jest CLI chain) | 4.0.2   | High     | **Dev-only** (ts-node used for tooling/scripts) | [GHSA-73rr-hh4g-fpgx](https://github.com/advisories/GHSA-73rr-hh4g-fpgx) | Await upstream `ts-node` release that bumps to `diff>=5`. Audit fix would downgrade to `ts-node@1.x` (breaking). Monitor npm advisories weekly and upgrade once patch lands. |

- These dev-only alerts do **not** ship to production builds, but we keep them documented with owners so we can react once upstream fixes exist.
- Junior devs should reference this table before running `npm audit`; do **not** run `npm audit fix --force` (per policy) because it would downgrade or break the toolchain.

## Current Audit Snapshot (2026-08-31)

Full `npm audit`: **3 moderate, 0 critical, 0 high, 0 low**.
`npm audit --production`: **2 moderate, 0 high/critical** — the value the CI gate evaluates,
unchanged.

### What changed

`newman` was retired (see `docs/internal/todos/2026-08-31-todo-retire-newman.md`). Its collections
were migrated into the Jest integration suite and Schemathesis, and the devDependency was removed.
That deleted **six of the nine** then-open findings outright — `newman`, `postman-collection`,
`postman-request`, `postman-runtime`, `postman-sandbox`, `serialised-error` were reachable through
no other path.

It also made **eight of the eleven** `overrides` redundant. Three existed only to patch newman's
own subtree (`node-forge`, `ip-address`, `jose`) and are gone with it. The other five were shared
with non-newman consumers, and each of those consumers resolves the same patched version on its
own once newman is not holding the tree down:

| Dropped override | Other consumer                                 | Its range             | Resolves to |
| ---------------- | ---------------------------------------------- | --------------------- | ----------- |
| `handlebars`     | `ts-jest`                                      | `^4.7.8`              | 4.7.9       |
| `lodash`         | `hpp`, `sequelize`, `sequelize-cli`, `wait-on` | `^4.17.x`             | 4.18.1      |
| `underscore`     | `pg-hstore`                                    | `^1.13.1`             | 1.13.8      |
| `flatted`        | `eslint` → `flat-cache`                        | `^3.2.9`              | 3.4.4       |
| `qs`             | `express`, `body-parser`, `superagent`         | `~6.15.1` / `^6.14.1` | 6.15.3      |

Verified empirically, not inferred: the overrides were removed, the tree reinstalled, and
`npm audit` re-run. No finding returned. **`overrides` is now three entries** — `js-yaml`,
`brace-expansion`, `esbuild` — none of which ever had a newman path.

Note `flatted` was previously recorded as newman-exclusive. It is not; `eslint` reaches it via
`file-entry-cache` → `flat-cache`. It is droppable anyway, but for the reason above.

### Remaining 3 (all moderate)

Every remaining finding has a single root: **`uuid` < 11.1.1** (missing buffer bounds check in
`v3`/`v5`/`v6` when `buf` is provided). It surfaces as `uuid`, `sequelize`, and `jest-junit`.

**Deliberately not overridden.** The fix requires `uuid@>=11.1.1`, but `sequelize@6` — a
**production** dependency — resolves `uuid@8.3.2`. Forcing 8 → 11 crosses three majors on the ORM
to fix a bounds check in code paths we do not call (`src/` imports `uuid` nowhere; Sequelize uses
only `uuid.v1`/`uuid.v4`). Per rule 1 under Transitive Overrides this is a dependency upgrade
decision, not an override. Revisit when Sequelize bumps its own constraint.

### Superseded snapshot (2026-08-23)

The prior snapshot recorded **9 moderate** after an override sweep took the tree from 25 findings
(1 critical, 12 high, 11 moderate, 1 low). That sweep pinned eleven transitive leaves to clear a
critical in `handlebars` and eleven highs, all rooted in the newman chain. Retiring newman removed
the cause rather than the symptom, so all but three of those pins are gone. The full rationale
per package is preserved in `docs/internal/todos/2026-08-23-todo-newman-vulnerability-chain.md`.
