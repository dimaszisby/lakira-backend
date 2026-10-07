# ADR-0060 — The app takes its name from its package when `APP_NAME` is unset

- **Status:** Accepted
- **Date:** 2026-10-07
- **Related:** caveat C2 and finding U2 (`docs/internal/audits/saas-readiness/audit-2026-10-05-b.md`
  § 6); [ADR-0024](./adr-0024-app-name-centralization.md), whose default this replaces;
  [ADR-0036](./adr-0036-refuse-production-unsafe-env-switches.md), which this deliberately does not
  extend; [ADR-0055](./adr-0055-production-image-built-and-smoked-in-ci.md), the image smoke
- **Origin:** `D-01` and `D-03` in the app-name-from-package kit —
  [`app-name-from-package`](../../internal/initiatives/app-name-from-package/decisions.md)

---

## Context

Everything a deployment calls itself comes from one constant, `APP_NAME` in
`src/config/app-name.ts` (ADR-0024): the `service` on every log line, the refresh cookie's name,
the name email is signed with, the queue names, and the title of the served OpenAPI spec. Until
this record the constant was `process.env.APP_NAME ?? "lakira-backend"`.

`scripts/bootstrap-fork.sh` renames the package and writes `APP_NAME` to `.env`, and nowhere else.
`.dockerignore` keeps `.env` out of the image. So a fork that was deployed without `APP_NAME` set
as a platform variable ran under the template's name on all five surfaces, and nothing said so.
That case was considered and accepted on 2026-09-24. The dated audit of 2026-10-05 put it to an
independent grader, who knew that history and kept caveat C2 open on it.

## Decision

1. **`APP_NAME` is the environment variable when it is set and not blank.** The value is trimmed.
   This is unchanged, and it still wins over everything below.
2. **Otherwise it is the `name` in the app's own `package.json`**, read once when `app-name.ts` is
   first imported, with a leading `@scope/` dropped.
3. **The app's own `package.json` is the nearest one at or above the entry script**
   (`process.argv[1]`): `dist/server.js` and `dist/worker.js` in the image, `src/server.ts` under
   `tsx`. This does not depend on the directory the process is started from. When there is no entry
   script, or it is inside `node_modules` as a test runner's is, the one in the working directory
   is used, which is the rule `src/config/loadEnv.ts` applies to `.env`.
4. **There is no fixed fallback.** With no variable and no usable package name the module throws
   at import, and the message names the file it read or the places it looked. A `package.json`
   that exists and has no name is reported, not skipped.
5. **Nothing else moves.** `bootstrap-fork.sh` still writes `APP_NAME` to `.env`.
   `scripts/openapi-app-name.js` still pins the spec generator to the package name, so the
   committed spec cannot follow a shell variable. `APP_NAME` stays outside the Zod schema, for the
   circular-initialisation reason recorded in `app-name.ts`.

The package is the right source because the image already carries it, the bootstrap script
already renames it, and the committed OpenAPI spec already takes its names from it. Upstream the
package is named `lakira-backend`, which is the literal removed, so the template resolves to the
same name as before.

## Options considered

- **Refuse to start in production when `APP_NAME` is unset.** Rejected on 2026-09-24 and again
  here: it adds a production-required variable, it stretches ADR-0036, whose rule covers switches
  that weaken a security control, and it stops the template's own deployment until the variable is
  set. It reports the mistake; deriving the name removes it.
- **Warn at startup.** Rejected: the fork still ships under the template's name, and one line in a
  log stream is easy to miss.
- **Reaffirm the decision of 2026-09-24.** Rejected: the grader had that decision in front of it
  and kept the caveat open.
- **A neutral literal such as `app`.** Rejected: it changes the template's own cookie, queue and
  service names, and a fork is then misnamed in a different way.
- **Write the name into the build as a generated constant.** Rejected: a second copy to keep in
  step with `package.json`, for a value the image already carries.
- **Locate `package.json` relative to the module, through `import.meta.url`.** Tried first.
  `ts-jest` compiles `src/` with a module setting that does not allow `import.meta` (TS1343), so
  no test could import the module, and changing how every test is compiled for one line was out of
  proportion. A JSON import is not available either: `tsconfig.build.json` sets `rootDir` to `src`.
- **The working directory alone.** Tried second, and rejected in review: a process started from
  another directory failed, and one started beside a different `package.json` silently took that
  package's name.
- **The entry script alone.** Rejected: under Jest the entry script is Jest's.

## Consequences

- **A fork is named after itself with nothing to configure.** On a fork bootstrapped as
  `acme-api`, the production image started with no `APP_NAME` logs `service` as `acme-api`; before
  this record it logged `lakira-backend`.
- **A fork that was deployed under the template's name is renamed on its next deploy.** Its
  refresh cookie's name changes, so its users sign in once more. Its queues are declared under the
  new name, and messages left in the old queues are not consumed.
- **The variable still overrides, and nothing checks it against the package.** A fork that sets
  `APP_NAME=lakira-backend` on its platform, for instance by copying a value, is named after the
  template. A platform value that differs from the package name also makes the served spec differ
  from the committed one.
- **A fork that never ran `bootstrap-fork.sh`** still has a package named `lakira-backend` and is
  still named after the template. It has not been rebranded at all; that case stays accepted.
- **A missing name is now an error at import.** It can only happen with no `APP_NAME`, no
  `package.json` above the entry script, and none in the working directory. The image and
  `npm start` have the file.
- **The name is not validated.** The bootstrap script accepts only
  `^[a-z][a-z0-9]*(-[a-z0-9]+)*$`; a package renamed by hand, or an explicit `APP_NAME`, is used as
  it is, in a cookie name and in queue names. A scoped package name works at runtime and not in
  the spec tooling, which builds a file path from the name with its scope.
- **The proof is the image smoke on a fork.** Check 7 of `scripts/image-smoke.sh` starts the image
  with no `APP_NAME` and expects the image's own package name as `service`. On the template that
  name equals the old literal, so the check only distinguishes the two behaviours on a renamed
  package. It was run on a scratch fork for this record; CI runs it on the template, and a fork's
  own CI runs it on the fork. `__tests__/unit/config/app-name.test.ts` reads the expected name from
  `package.json`, so `Fork Smoke`, which runs the unit tests on a bootstrapped fork, would fail if
  a fixed name came back.
- **Revert-safe.** No migration, no stored data, and for the template no change to any name.
