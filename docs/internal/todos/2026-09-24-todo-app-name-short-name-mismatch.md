# Todo — `bootstrap-fork.sh` and `app-name.ts` derive the short name differently

- **Status:** Open
- **Created:** 2026-09-24
- **Owner:** unassigned
- **Origin:** found by the `docs-sweep` kit while correcting `docs/tutorials/fork-and-rebrand.md`

---

## What

The tutorial claimed the script's name derivation "matches `src/config/app-name.ts`". It does not:

- `scripts/bootstrap-fork.sh` strips a trailing `-backend` **or `-api`** to get the short name it
  writes into queue topology and database names.
- `src/config/app-name.ts` strips only `-backend` when deriving `APP_SHORT_NAME` and
  `APP_DISPLAY_NAME` at runtime.

So a fork named `my-app-api` gets `my-app` in its database and CI names, but `my-app-api` /
`My App Api` in queue names, logs, the OpenAPI title and emails.

## Suggested fix

Make them agree. Either `app-name.ts` also strips `-api`, with a test case added to
`__tests__/unit/config/app-name.test.ts`, or the script stops stripping it. The tutorial now
describes the current behaviour and should be updated with the fix.
