# Todo — `scripts/test-ci.sh` drops its arguments and may migrate nothing

- **Status:** Open
- **Created:** 2026-09-24
- **Owner:** unassigned
- **Origin:** found by the `docs-sweep` kit while correcting `run-postgres-in-docker.md`; see its
  checklist § Discovered and [D-05](../initiatives/docs-sweep/decisions.md)

---

## What

`npm run test:ci` runs `scripts/test-ci.sh`. It has two problems, one confirmed and one likely.

1. **It ignores forwarded arguments (confirmed by reading the script).** Nothing in the script
   uses `$@`, so `npm run test:ci -- --coverage` silently drops `--coverage`. The how-to guide used
   to recommend exactly that command. The guide has been corrected; the script still ignores
   arguments.
2. **Its migration step may run no migrations (likely, not verified).** Inside the `app` container
   it runs `npx sequelize-cli db:migrate --config src/config/config.cjs` with no
   `--migrations-path`. The repo has no `.sequelizerc`, so the CLI looks for `./migrations`, which
   does not exist; every `migrate:*` script in `package.json` passes
   `--migrations-path src/migrations` explicitly. Not verified by running it, because the script
   starts and ends with `docker compose down -v`, which deletes the local Compose volumes.

## Why it matters

`test:ci` exists for "full-stack parity (CI, pre-release validation)". If its migration step does
nothing, integration tests run against an empty schema, or against a volume a previous run left
behind, and the result depends on history. The argument drop means anyone following the old
guide believed they had coverage when they did not.

## Suggested fix

- Add `--migrations-path src/migrations` to the migrate line, or call `npm run db:migrate:test`,
  which is what CI's `tests` job uses.
- Either forward `"$@"` to the Jest invocations or state in the script's header that it takes no
  arguments.
- Verify on a machine where losing the Compose volumes does not matter.
