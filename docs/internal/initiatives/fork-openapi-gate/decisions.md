# Fork OpenAPI gate and bootstrap ordering — Decisions Log

`D-NN` entries scoped to this kit.

---

## D-01 — The spec's filename follows the package name, from one place

- **Status:** Accepted
- **Date:** 2026-10-04

**Context.** `bootstrap-fork.sh` rewrites `lakira-backend` in `package.json`, which turns the path
in `docs:openapi:check` into `docs/reference/api/<name>-openapi.json`, and does the same in
`backend-prd-drift-warning.yml`. The file on disk and the three scripts that write, format and
validate it keep the literal `lakira-backend-openapi.json`. On a fork the gate exits 128 (audit S2,
reproduced). lakira-frontend's `scripts/api/sync-openapi-spec.mjs` fetches
`…/lakira-backend/dev/docs/reference/api/lakira-backend-openapi.json`, so the upstream path is a
published one.
**Decision.** `scripts/openapi-spec-path.js` builds the path from `package.json`'s `name`, and
`generate-openapi.ts`, `normalize-openapi.ts` and `validate-openapi.ts` import it. Upstream the
name is `lakira-backend`, so nothing moves. Bootstrap renames the file to match the new name, with
`git mv` when the file is tracked so the drift check has something to compare against, and rewrites
the filename where the docs and the Claude hook mention it.
**Options considered.** Keep `lakira-backend-openapi.json` on a fork: rejected, the sed would have
to skip two lines it rewrites today, and the upstream name stays in the fork's contract file
(audit R12). A neutral `openapi.json` upstream: rejected for this change, it moves the path the
frontend syncs from, which is a cross-repo change with its own ADR. Renaming the literal in the
three scripts with sed: rejected, three more places for the next rename to miss.
**Consequences.** A fork's spec is `<name>-openapi.json`. A fork's frontend, if it has one, points
its sync at that name. The spec's title is still "Lakira API" on a fork (the C2 residual, P3), which
this does not touch. A fork bootstrapped by the old script is not repaired; its owner renames the
file by hand.

**Revised in review (2026-10-04).** Three changes. The module is plain JavaScript, like
`scripts/logger.js`, not TypeScript: the two contract-test runners under
`tests/contract/schemathesis/scripts/` carried the same literal and run under Node without tsx, so
they import it too. Bootstrap refuses, before it rewrites anything, when the new spec path already
exists: failing at the rename would have left `package.json` renamed and the spec not. And one
limit is now known: a fork's gate passes because the generator does not load `.env`, so the
regenerated spec is byte-identical to the renamed file. If the generator ever takes its title from
`APP_NAME` (the C2 residual), bootstrap must regenerate the spec as well as rename it.

## D-02 — An existing `.env` and `.env.test` are renamed like the templates

- **Status:** Accepted
- **Date:** 2026-10-04

**Context.** Bootstrap rewrites `.env.example`, `.env.test.example` and the init SQL, then creates
`.env` and `.env.test` from the templates only when they are absent. A reader who followed
`docs/tutorials/getting-started.md` has already copied both, so `.env` keeps `lakira_user` while the
init SQL creates the renamed test database (audit S3, reproduced with `.env` alone).
**Decision.** The identifier renames also run on `.env` and `.env.test` when they exist.
**Options considered.** Refusing to run when `.env` exists: rejected, it punishes the reader who
followed the other tutorial and leaves them to rename by hand. Overwriting them from the templates:
rejected, it throws away whatever else the reader set.
**Consequences.** Only values carrying the upstream prefix change. A value the reader set to
something else is left alone, and so can still disagree with the templates.

**Revised in review (2026-10-04).** The first version added both files to the template rename
list, which also applies `Lakira` and `lakira.` patterns. Those could rewrite a value the reader
set, such as a mail sender's display name or a host under `lakira.example.com`. Only the
`lakira_` identifier prefix is rewritten in these two files now, and it runs on every run, not
only the first.

## D-03 — "Already renamed" skips the renames, not the env files

- **Status:** Accepted
- **Date:** 2026-10-04

**Context.** The guard exits as soon as `package.json` already carries the new name, before the
steps that create `.env` and `.env.test`. A fork's own `Fork Smoke` run is exactly that: a fresh
checkout of an already renamed tree, with neither file (audit S4, reproduced).
**Decision.** When the tree is already renamed, the rename, prune and `FORKED-FROM.md` steps are
skipped and the env steps still run. `JWT_SECRET` is rotated on the first run, and on a later run
only in a `.env` that run has just created.
**Options considered.** Rotating on every run: rejected, a second run would log every developer out
and break "running it twice changes nothing". Having the workflow copy the templates itself:
rejected, the script's printed steps promise the files exist.
**Consequences.** A re-run with both files present changes nothing. A re-run after deleting `.env`
gives a new secret, which is what a fresh checkout needs.

**Revised in review (2026-10-04).** "Already renamed" now means the package name is no longer the
template's, not that it equals `--name`. The first version treated a different name as a first run:
on a tree named `acme`, `--name beta` matched none of the template's strings but still set
`APP_NAME`, rotated the secret of a `.env` in use, and pruned again. The script now keeps the tree's
name and says so. Refusing was rejected: a fork's `Fork Smoke` calls the script with the workflow's
fixed `--name my-app` whatever the fork is called, and has to succeed. The package name is also read
from the script's own repository, not the working directory, and asking the template to take its
own name is treated as nothing to rename, so it cannot prune `docs/internal` upstream.

## D-04 — The committed spec describes the package: its title and cookie name follow the package name

- **Status:** Accepted
- **Date:** 2026-10-05
- **Size:** Micro — single commit, logged here because it extends D-01. Audit finding T2 (P2) of
  the dated run of 2026-10-05. Commits carry `refs: fork-spec-describes-upstream`.

**Context.** D-01 made the spec's filename follow the package name. Its content did not. The title,
the description and the refresh cookie's name are built from `APP_NAME` in
`src/config/app-name.ts`, and `scripts/generate-openapi.ts` imports the logger first, which
evaluates that module before any `.env` is loaded. So the generator saw the default name unless
the shell exported one. On a fork bootstrapped as `acme-api` the spec said "Lakira API" and
documented a `lakira_refresh` cookie while the server set `acme-api_refresh`, and the gate passed
only by that import order: with `APP_NAME=acme-api` exported it exited 1 (both reproduced in the
audit).
**Decision.** The committed spec is a build artifact of the package. The generator sets `APP_NAME`
to the package name before anything reads it (`scripts/openapi-app-name.js`, its first import),
whatever the shell or `.env` says. `bootstrap-fork.sh`, which renames the package, rewrites the
three name-derived strings in the spec it has just renamed, because it runs before `npm install`
and cannot run the generator, and the fork's gate compares the generator's output with the staged
file. It derives the names as `app-name.ts` does, stripping only a trailing `-backend`; the
script's own short name also strips `-api` and would write "Acme" where the app says "Acme Api".
The spec the server serves at `/api/v1/docs/openapi.json` is not touched: it is built at runtime
from the runtime `APP_NAME`.
**Options considered.** Load `.env` in the generator, so the spec follows `APP_NAME`: rejected, the
gate would depend on a gitignored file, a developer's local `APP_NAME` would show as drift, and
CI, which has no `.env`, would generate something else. Stop deriving the title and the cookie
name from `APP_NAME`: rejected, the cookie's name is a runtime fact, and fixing it to one string
logs every upstream user out once and changes the spec lakira-frontend syncs. Leave the file and
tell the forker to regenerate and commit: rejected, their first push fails CI, which is S2 again.
Have bootstrap run the generator: not possible, it runs before dependencies are installed.
**Consequences.** Upstream the package is `lakira-backend`, so the spec is byte-identical and
lakira-frontend has nothing to do. The name derivation now exists in two languages; a unit test
compares what bootstrap writes with what `app-name.ts` derives for three names, and `Fork Smoke`
runs the gate on a bootstrapped tree, so a fourth name-derived string added to the spec without
teaching bootstrap about it fails that job. A deployment that sets `APP_NAME` to something other
than the package name serves a correct spec and commits one that describes the package.

**Revised in review (2026-10-05).** The script accepted names with a trailing or doubled hyphen
(`app-`, `a--b`). `app-name.ts` title-cases by splitting on `-`, so an empty part becomes a stray
space in the title ("App API"), which the script's own loop skips; that fork's gate would have
failed. `--name` must now match `^[a-z][a-z0-9]*(-[a-z0-9]+)*$`. Changing the script's loop to
reproduce the stray space was rejected: the name is wrong, not the loop. The first draft of the
`Fork Smoke` step also used a bare `! grep`, which `set -e` does not act on; it is an `if` now.

**A correction to `audit-2026-10-05.md`.** That audit's § 5 ("A stale link") and the second half
of its T8 say a fork's `docs/reference/api/README.md` keeps the upstream spec name. It does not.
On the scratch fork the auditor had run `git checkout -- docs/reference/api` to undo a spec diff,
which also reverted bootstrap's edit to that README, and the reverted file was then read as a
finding. The two scratch forks that were not touched have it renamed. Dated audits are immutable
(ADR-002), so the correction is recorded here and in `FINAL-AUDIT-SUMMARY.md`.
