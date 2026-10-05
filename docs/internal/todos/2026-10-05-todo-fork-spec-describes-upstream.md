# Todo — a fork's OpenAPI spec describes the upstream

- **Status:** Open (P2)
- **Created:** 2026-10-05
- **Owner:** unassigned
- **Origin:** `docs/internal/audits/saas-readiness/audit-2026-10-05.md` § 6, T2; kit
  [`saas-reaudit-2026-10-05`](../initiatives/saas-reaudit-2026-10-05/decisions.md) D-04

---

## What

After `bootstrap-fork.sh --name acme-api`, the fork's spec file is correctly renamed and its
`docs:openapi:check` passes. Its content is still the upstream's: `"title": "Lakira API"` and a
`lakira_refresh` cookie, while the fork's server sets `acme-api_refresh`.

The cause is import order. `scripts/generate-openapi.ts` imports the logger, which evaluates
`src/config/app-name.ts` before `.env` is loaded, so `APP_NAME` is still the default when the title
(`src/lib/openapi/openapi-config.ts:19-21`) and the cookie name (`openapi-docs.ts:254,259`) are
built. The gate passes for the same reason. With `APP_NAME=acme-api` exported in the shell,
`npm run docs:openapi:check` exits 1 with a diff on the title, the description and the cookie
name. No workflow sets `APP_NAME` today.

`docs/reference/api/README.md:8,18` also keeps the upstream spec name and link after the rename.

## Suggested fix

Decide which the spec should describe, then make it deliberate:

- The fork: load `.env` before `APP_NAME` is read in the generator, and have bootstrap regenerate
  the spec after renaming, so the committed file matches what the gate produces.
- Or neither: stop deriving the title and the cookie name in the spec from `APP_NAME`.

Either way add the case to `Fork Smoke`, which today passes with a spec that names the wrong
cookie. Changing what the spec says is a cross-repo change for lakira-frontend, which syncs it.
Caveat C2's residual is this item; the next dated run should put C2 to a grader.
