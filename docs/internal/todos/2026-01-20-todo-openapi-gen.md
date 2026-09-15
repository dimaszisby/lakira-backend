# Todo — OpenAPI generation vs pre-commit

- **Status:** Resolved (verified 2026-09-15) — `npm run docs:openapi:check` exits 0. The generation
  and pre-commit interaction described below no longer reproduces. Kept as a record; no action
  outstanding.

---

We have CI failure on docs:openapi:check because OpenAPI JSON differs after generation.

Local regen DOES change docs/reference/api/lakira-backend-openapi.json, but git commit fails:

- husky pre-commit runs lint-staged
- lint-staged reverts/unstages changes, causing “Prevented an empty git commit”.

Goal (production-grade):
Make OpenAPI output deterministic and ensure lint-staged and CI agree.

Tasks:

1. Add scripts/normalize-openapi.ts:
   - Read docs/reference/api/lakira-backend-openapi.json
   - JSON.parse then write JSON.stringify(obj, null, 2) + "\n"
   - Ensure stable output each run.

2. Update package.json:
   - docs:openapi:generate should run generator then normalization:
     tsx ./scripts/generate-openapi.ts && tsx ./scripts/normalize-openapi.ts
   - docs:openapi:check remains:
     npm run docs:openapi:generate && git diff --exit-code docs/reference/api/lakira-backend-openapi.json

3. Fix lint-staged config:
   - Either exclude docs/reference/api/\*.json from lint-staged formatting
     (recommended since it’s generated and normalized),
     OR ensure prettier config matches canonical output exactly.

4. Add .gitattributes:
   docs/reference/api/\*.json text eol=lf

5. IMPORTANT CHECK FIRST:
   - Inspect current lint-staged config (package.json or .lintstagedrc)
   - Identify which task runs on docs/reference/api/\*.json and causes reversion.
   - Confirm generator write formatting in scripts/generate-openapi.ts.

Optional quick unblock:

- Use git commit --no-verify to push regenerated file, confirm CI passes, then implement the deterministic fix above.

## Status

- [x] Added `scripts/normalize-openapi.ts` that reuses the repo’s Prettier config to format `docs/reference/api/lakira-backend-openapi.json` (no more husky conflicts).
- [x] `npm run docs:openapi:generate` now chains the generator and normalizer so local runs match CI output.
- [x] `.gitattributes` forces LF endings for `docs/reference/api/*.json` to avoid cross-platform diffs.
- [x] Verified lint-staged config (still runs Prettier on JSON) but normalization now matches its formatting, so commits succeed without no-verify hacks.
