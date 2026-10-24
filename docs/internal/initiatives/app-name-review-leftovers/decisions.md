# Decisions — app-name-review-leftovers

## D-01 — The app refuses a name bootstrap would refuse

- **Status:** Proposed
- **Date:** 2026-10-25

**Context.** `bootstrap-fork.sh` accepts only `^[a-z][a-z0-9]*(-[a-z0-9]+)*$`, but a package renamed
by hand, or an explicit `APP_NAME`, was used as it was. The name becomes the refresh cookie's name
(`<short>_refresh`), the queue names (`<short>.jobs`) and the log's `service`. Checked on
2026-10-25: Express 4's `res.cookie` throws "argument name is invalid" for `Acme Corp_refresh`, so
with a space every login fails, while it sets `my.app_refresh` and `My_App_refresh`. A dot adds a
segment to every routing key. The todo left checking the name at startup as a decision, since it
would refuse a name that starts today.
**Decision.** Owner's choice, 2026-10-25: `src/config/app-name.ts` exports `APP_NAME_PATTERN`,
bootstrap's rule, and `resolveAppName` throws when the resolved name fails it, whether it came from
`APP_NAME` or from the package (after the scope is dropped, D-02). The message names the source,
the rule, and what the name is used for. A unit test reads the pattern out of `bootstrap-fork.sh`
and fails if the two differ. Staging's `APP_NAME` is unset or `lakira-backend` (owner), so the
deploy is safe.
**Options considered.** _Refuse only what breaks_ (a character a cookie name cannot hold): a second
rule bootstrap does not share, and `my.app` or `My_App` would keep working in one place and not the
other. _Document it and change nothing:_ a bad name keeps surfacing as a failed login, not at
startup.
**Consequences.** A name with a capital, an underscore, a dot or a space now stops the app at
startup, where before some of those started and failed later. The template's name passes.

---

## D-02 — A scoped package name loses its scope everywhere

- **Status:** Proposed
- **Date:** 2026-10-25

**Context.** The app dropped `@scope/` from the package name; `scripts/openapi-app-name.js` gave the
generator the name with its scope, and `scripts/openapi-spec-path.js` built the spec's file name
from it. With `@acme/shop-backend`, the committed spec named a different app from the served one,
and its path held a directory.
**Decision.** Owner's choice, 2026-10-25: `openapi-spec-path.js` exports `appNameFromPackage`, which
drops the scope as `resolveAppName` does, and both the spec path and the generator's name use it. A
test requires the two to agree on a set of names.
**Options considered.** _Refuse a scoped name:_ simpler, but a fork published under an npm scope
could not keep it.
**Consequences.** `@acme/shop-backend` is `shop-backend` in the app, the spec's title and cookie,
and `docs/reference/api/shop-backend-openapi.json`. This repo's spec does not change.

---

## D-03 — A platform `APP_NAME` that differs from the package is a warning

- **Status:** Proposed
- **Date:** 2026-10-25

**Context.** `APP_NAME` wins over the package name by design (ADR-0060). Copied from the template's
platform onto a fork, `APP_NAME=lakira-backend` names the fork after the template, silently.
**Decision.** `appNameMismatch()` returns both names when `APP_NAME` is set and differs from the
package's name without its scope; it never throws, and with no package to read there is nothing to
compare. `server.ts` and `worker.ts` log it once at `warn` after startup: the worker's queue names
follow the name too.
**Options considered.** _Refuse it:_ a set value would no longer win, against ADR-0060. _Log it from
`app-name.ts`:_ the logger imports that module, so it cannot log from it.
**Consequences.** A template or fork whose `APP_NAME` equals its package name logs nothing new.

---

## D-04 — The contract-test seed uses `example.com`

- **Status:** Proposed
- **Date:** 2026-10-25

**Context.** `scripts/seed-contract-tests.ts` seeded `contract-*@lakira.dev`, which bootstrap does
not rewrite. Nothing else refers to these addresses.
**Decision.** `@example.com`, a domain reserved for examples (RFC 2606), so a fork has nothing to
rename.
**Options considered.** _Add the file to bootstrap's renames:_ one more rename for test data that
need not name anyone.
**Consequences.** None outside the seeded rows.

---

## D-05 — Fork Smoke runs the image smoke

- **Status:** Proposed
- **Date:** 2026-10-25

**Context.** Check 7 of `scripts/image-smoke.sh` proves that an image with no `APP_NAME` is named
after its package. On the template, the package name equals the old literal, so it cannot tell the
default from a fixed name coming back, and Fork Smoke ran the tests but never the image.
**Decision.** Fork Smoke runs `npm run docker:smoke` after `npm ci`, on the bootstrapped `my-app`.
Its "spec describes the fork" step reads the package name without its scope (D-02). The workflow is
protected, so the file is handed over to be copied in.
**Options considered.** _A fork-only assertion inside `image-smoke.sh`:_ the script would have to
know it runs on a fork; check 7 already compares against the image's own package.
**Consequences.** Fork Smoke takes about two minutes longer.
