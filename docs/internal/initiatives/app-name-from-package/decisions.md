# The app takes its name from the package — Decisions

Kit-local log. Entries are written when the decision is taken.

---

## D-01 — With `APP_NAME` unset, the app's name is the package's name

- **Status:** Accepted (the owner chose this option on 2026-10-06 and approved the plan on
  2026-10-07)
- **Date:** 2026-10-07

Promoted to the architecture decision registry as **[ADR-0060](../../../explanation/decisions/adr-0060-the-app-takes-its-name-from-its-package.md)**.
That file is authoritative; this entry is a pointer.

---

## D-02 — `package.json` is found from the working directory, as `.env` is

- **Status:** Superseded by D-03
- **Date:** 2026-10-07

**Context.** The plan located `package.json` relative to the module, through `import.meta.url`.
The first test run refused it: `ts-jest` compiles `src/` for the unit and integration projects
with a module setting that does not allow `import.meta` (TS1343), which is why no file in `src/`
uses it. The module could not be imported by any test.

**Decision.** `app-name.ts` reads `package.json` from `process.cwd()`. That is the rule
`src/config/loadEnv.ts` already applies to `.env`, so the application has one answer to "where is
the project": the directory it is started from.

**Options considered.**

- _Change the `ts-jest` configuration so `import.meta` compiles._ Rejected: it alters how every
  test in the repository is compiled, for one line, and a test compiler that differs further from
  the build is its own risk.
- _Walk up from `process.argv[1]` to the nearest `package.json`._ Rejected: under Jest the entry
  script is Jest's, and the nearest `package.json` is Jest's own.
- _Read the name through `npm_package_name`._ Rejected: it is set only under `npm run`, and the
  image starts with `node dist/server.js`.

**Consequences.** This replaces the first consequence listed under D-01. A process started from
another directory, with no `APP_NAME`, fails at startup with an error that names the path it
looked at; started from a directory that holds a different `package.json`, it takes that name. The
image sets `WORKDIR /app` and `npm start` runs from the package root, so both find the right file,
and the image smoke checks it.

---

## D-03 — The entry script's own package comes first; the working directory is the fallback

- **Status:** Accepted
- **Date:** 2026-10-07

Promoted to the architecture decision registry as **[ADR-0060](../../../explanation/decisions/adr-0060-the-app-takes-its-name-from-its-package.md)**,
with D-01. That file is authoritative; this entry is a pointer.
