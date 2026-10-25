# Decisions — fork-residue

## D-01 — Bootstrap gives the Compose names the fork's prefix

- **Status:** Accepted (#224, `36c324b`)
- **Date:** 2026-10-25

**Context.** `docker-compose.yml` fixes six container names (`postgres_db`, `redis_cache`,
`rabbitmq_queue`, `mailpit`, `node_app`, `node_worker`), the network (`backend_network`) and three
volumes (`db_data_volume`, `redis_data_volume`, `rabbitmq_data_volume`), and bootstrap renamed none
of them. A fork on the machine that runs the template took the template's database volume, and the
`docker compose down -v` bootstrap's closing message suggests would have deleted it (R12).
**Decision.** Owner's choice, 2026-10-25: bootstrap rewrites each of the ten names in a fork's
`docker-compose.yml` to the fork's database slug plus the old name (`my_app_postgres_db`,
`my_app_db_data_volume`). The patterns match only those values, so a second run changes nothing.
The template's own file is unchanged. Fork Smoke fails if a template name survives.
**Options considered.** _Compose project names_ (drop the fixed names, add a top-level `name:` that
bootstrap renames): the Compose idiom, but the template's own next `up` would create new empty
volumes beside the owner's data, and its containers would change names.
**Consequences.** Services still reach each other by service name (`db`, `redis`), which does not
change. A fork's containers are `<slug>_postgres_db` and so on; docs that need a container use the
service name through `docker compose` (D-03).

---

## D-02 — Bootstrap unlinks what pointed into `docs/internal/`

- **Status:** Accepted (#224, `36c324b`)
- **Date:** 2026-10-25

**Context.** 182 Markdown links in 91 files outside `docs/internal/` point into it, 86 of those files
ADRs whose "Origin" line names the kit that took the decision. Bootstrap deletes `docs/internal/`,
so every one of them was dead in a fork. All 182 are inline relative links.
**Decision.** Owner's choice, 2026-10-25: a new `scripts/unlink-internal-docs.js` turns each link
whose target resolves into `docs/internal/` into its text, in every `.md` file outside it. Bootstrap
runs it right after removing the folder, and not with `--keep-internal`. Its `--check` mode exits
non-zero while such a link is left, and Fork Smoke runs it. The template keeps its links.
**Options considered.** _Link to the upstream at the forked commit:_ resolves only while the
upstream repository is public. _Accept and document:_ a fork's reader still meets 182 dead links.
**Consequences.** A fork's ADR still names its kit and decision (`D-01 in the kit`), as plain text.
Plain-text mentions of `docs/internal/` in code comments and tests are not links and stay.

---

## D-03 — Docs reach a container through its Compose service

- **Status:** Accepted (#224, `36c324b`)
- **Date:** 2026-10-25

**Context.** `getting-started.md` and `database-schema.md` told the reader to look for, or
`docker exec` into, `postgres_db`, which in a fork is now `<slug>_postgres_db` (D-01).
**Decision.** They use `docker compose ps` and `docker compose exec db`, which name the service,
the same in every fork. Where a volume must be named, both forms are given.
`run-postgres-in-docker.md` is a standalone `docker run` recipe that picks its own name, and stays.
**Options considered.** _Have bootstrap rewrite the docs too:_ more renames for text that a stable
name makes unnecessary.
**Consequences.** None for the template's reader: the commands work as before.
