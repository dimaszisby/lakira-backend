# Todo — what the review of the `APP_NAME` default left open

- **Status:** Open (all P3)
- **Created:** 2026-10-07
- **Owner:** unassigned
- **Origin:** the code review of the C2 fix; kit
  [`app-name-from-package`](../initiatives/app-name-from-package/README.md),
  [ADR-0060](../../explanation/decisions/adr-0060-the-app-takes-its-name-from-its-package.md)

---

## What

None of these is reached by a fork that runs `bootstrap-fork.sh` and deploys the image.

- **CI never runs the image smoke on a fork.** Check 7 of `scripts/image-smoke.sh` proves the
  default only on a renamed package; on the template the package name equals the old literal.
  `Fork Smoke` runs the unit tests on a bootstrapped fork, which would catch a fixed name coming
  back, but not a `package.json` missing from the image. Adding the image smoke to
  `.github/workflows/fork-smoke.yml` would close it. That file is hook-protected, so the change
  is drafted to `.git/` and copied in by the owner.
- **The name is not validated.** `bootstrap-fork.sh` accepts only `^[a-z][a-z0-9]*(-[a-z0-9]+)*$`,
  but a package renamed by hand, or an explicit `APP_NAME`, is used as it is. `Acme Corp` gives a
  cookie name with a space, and a dot in the name acts as a routing-key separator in the queue
  names. Applying the same pattern in `src/config/app-name.ts` would refuse both at startup; it
  would also refuse a name that works today, so it is a decision, not a fix.
- **A scoped package name is half supported.** The app drops `@scope/`; `scripts/openapi-app-name.js`
  pins the generator to the name with its scope, and `scripts/openapi-spec-path.js` builds a file
  path from it. Hand-renaming the package to `@acme/shop-backend` gives a committed spec that
  disagrees with the served one, and a spec path with a directory in it.
- **A platform `APP_NAME` that differs from the package name is not reported.** The variable wins
  by design, so `APP_NAME=lakira-backend` copied onto a fork's platform names it after the
  template, and any other value makes the served spec differ from the committed one.
- **`scripts/seed-contract-tests.ts:130,143,207`** seed accounts with `@lakira.dev` addresses, and
  bootstrap does not rewrite them. Test data only.
- **Two comments say `app-name.ts` loads before `envManager`** (`src/config/app-name.ts`,
  `src/config/zodEnv.ts:87`). The reviewer read `server.ts` and `worker.ts` as importing
  `envManager` first, so a local `.env` value does take effect. Not checked by the session that
  wrote the fix; the comments were left as they are.
