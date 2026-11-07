# Forkability — Plan

- Timestamp: 2026-05-03T00:00:00Z
- Closes audit gaps: [P1] 11.2, [P1] 11.3, [P1] 11.4, [P2] 11.5 in `docs/internal/audits/saas-readiness/audit-2026-05-01.md`

## Context & Goals

The SaaS-readiness audit found that forking this repo requires manually renaming ~13 files, there is no bootstrap script, no `CONTRIBUTING.md`, and the CachePort contract is duplicated five times across features. This kit makes "fork and rename" a single command and cleans up the remaining swappability leaks.

## Phase A — Centralize APP_NAME

**Goal:** Single source of truth for the application name.

1. **Create `src/config/app-name.ts`** — exports `APP_NAME = process.env.APP_NAME ?? "lakira-backend"`. Follow the same pattern as existing config files under `src/config/`.
2. **Update code & runtime files** to import from `app-name.ts`:
   - `src/server.ts` — log strings referencing "lakira".
   - `src/utils/logger.ts` — `service: APP_NAME`.
   - `src/lib/openapi/openapi-config.ts` — API title.
   - `src/shared/infrastructure/queue/topology.ts` — queue/exchange name prefix.
   - `src/features/shared/auth/infrastructure/email/templates/password-reset.ts` — greeting branding.
3. **Update build & config files** (these can't import TS, so the bootstrap script handles them):
   - `package.json` — `"name"` field.
   - `docker-compose.test.yml` — DB/user/password names.
   - `.github/workflows/backend-ci.yml` — DB name.
4. Verify: `grep -r "lakira" src/ --include='*.ts' | grep -v node_modules | grep -v "app-name.ts"` returns zero matches (all runtime references centralized).

## Phase B — Bootstrap script

**Goal:** One-command fork setup.

1. **Create `scripts/bootstrap-fork.sh`** accepting `--name <new-name>`:
   - Replace `lakira-backend` → `<new-name>` in `package.json`, `package-lock.json`, `docker-compose.test.yml`, CI workflow files, script files.
   - Replace `lakira` → derived short name in queue topology prefix, DB names, CI DB references.
   - Rotate `JWT_SECRET` in `.env.development` (generate a random 64-char hex string).
   - Update OpenAPI title in `src/lib/openapi/openapi-config.ts` (or set `APP_NAME` env in `.env.development`).
   - Drop a `FORKED-FROM.md` at the repo root recording the upstream commit SHA (`git rev-parse HEAD`).
2. **Make idempotent** — running twice with the same name is a no-op (sed skips already-replaced strings).
3. **Document in `README.md`** — add a "Forking" section explaining `./scripts/bootstrap-fork.sh --name my-app`.
4. Verify: run the script in a temp worktree, then `npm run typecheck && npm run lint` pass.

## Phase C — CONTRIBUTING.md

**Goal:** Close the "no contribution guide" gap.

1. **Create `CONTRIBUTING.md`** at the repo root covering:
   - Branch model: `feature → dev → staging → main`.
   - Commit conventions (conventional commits, co-author line for AI-assisted).
   - Code style: link to `.claude/rules/code-style.md`.
   - Testing: link to `docs/explanation/testing-strategy.md`.
   - Note that the project is currently single-developer; external PRs are welcome but response time is best-effort.
2. Verify: file exists at repo root, Prettier passes.

## Phase D — Consolidate CachePort

**Goal:** One generic `CachePort<T>` instead of five duplicates.

1. **Create `src/shared/application/ports/CachePort.ts`** — generic interface:
   ```ts
   export interface CachePort<T> {
     get(key: string): Promise<T | null>;
     set(key: string, value: T, ttlSeconds?: number): Promise<void>;
     delete(key: string): Promise<void>;
   }
   ```
2. **Per-feature ports become re-exports** (or are deleted if identical):
   - `metric/application/ports/CachePort.ts`
   - `metric-log/application/ports/CachePort.ts`
   - `metric-category/application/ports/CachePort.ts`
   - `metric-settings/application/ports/CachePort.ts`
   - `analytics/application/ports/VisualizationCachePort.ts`
3. **Update adapters** — Redis cache adapters implement the shared generic.
4. **Update `buildXFeature()` signatures** — type cache dependency as `CachePort<X>`.
5. Verify: `npm run typecheck` passes; cache-related unit tests green.

## Dependencies & Risks

- Phase A is safe to do independently — purely internal renaming with no behavioral change.
- Phase B is the most complex — the sed-replacement script must not corrupt binary files or break CI. Test in an isolated worktree.
- Phase D touches import paths across all features — run full `npm test` after.
- No gating ADR required — this work is additive and non-controversial.

## References

- `docs/internal/audits/saas-readiness/audit-2026-05-01.md` § 11.2–11.5
- `docs/internal/audits/saas-readiness/iteration-plan.md` — Phase 6
