# Fork test credentials — Decisions Log

`D-NN` entries scoped to this kit.

---

## D-01 — Database identifiers come from an underscore slug of the short name

- **Status:** Accepted
- **Date:** 2026-09-29

Promoted to the architecture decision registry as **[ADR-0051](../../../explanation/decisions/adr-0051-fork-proven-in-ci.md)**.
That file is authoritative; this entry is a pointer.

## D-02 — Rewrite the test template at bootstrap, rather than derive credentials at load time

- **Status:** Accepted
- **Date:** 2026-09-29

Promoted to the architecture decision registry as **[ADR-0051](../../../explanation/decisions/adr-0051-fork-proven-in-ci.md)**.
That file is authoritative; this entry is a pointer.

## D-03 — A fork smoke workflow in CI, running the fork's own Compose file on every PR

- **Status:** Accepted
- **Date:** 2026-09-29

Promoted to the architecture decision registry as **[ADR-0051](../../../explanation/decisions/adr-0051-fork-proven-in-ci.md)**.
That file is authoritative; this entry is a pointer.

## D-04 — Bootstrap generates the database password, and Compose publishes on loopback only

- **Status:** Proposed
- **Date:** 2026-10-12

**Context.** Finding S10 of `audit-2026-10-03.md`, at P2, open in every run since. Bootstrap rotated
`JWT_SECRET` and nothing else, so a fork named `acme-api` had the database password
`acme_password`. `docker-compose.yml` published every service port as `"5432:5432"`, which binds
all interfaces. On a shared network the database was reachable with a password anyone could guess
from the fork's name, and Redis (no password), RabbitMQ (`guest`/`guest`) and the Mailpit inbox
were reachable too.
**Decision.** Two changes.

1. Every published port of `db`, `redis`, `rabbitmq` and `mailpit` binds `127.0.0.1`. The `app`
   port keeps its all-interfaces binding.
2. Bootstrap generates a database password (`openssl rand -hex 24`) under the condition it already
   uses for `JWT_SECRET`: the first run, or an `.env` this run created. It replaces the template's
   `<slug>_password` only; a password the user chose is kept. It writes the password to
   `DB_PASSWORD` and to `DEVELOPMENT_DATABASE_URL` and `TEST_DATABASE_URL` where they log in as
   `DB_USER`, in `.env` and `.env.test` together. An `.env.test` created on a later run takes the
   password from the `.env` that is there. The two templates keep their readable placeholder.

**Options considered.** Rotating on every run: rejected, the Postgres volume keeps the password it
was created with, so a re-run would lock a working fork out of its own database. Generating the
password when Compose starts: rejected, Compose reads `.env` and nothing else, so the value has to
be in that file before the first `up`. A Redis password and a RabbitMQ user in the same change:
rejected for now, the finding's recorded fix does not ask for it, the loopback binding removes the
network route, and startup refuses `guest` in production (ADR-0036). Binding the `app` port too:
rejected, the finding does not name it, the API authenticates its callers, and a frontend
developer may reach it from another device.
**Consequences.** A fork made before this change keeps `<slug>_password` until its owner changes
it by hand, in both files and in the database. A password in `.env` no longer matches a Postgres
volume created earlier under the same names; `docker compose down -v` recreates it. Redis and
RabbitMQ keep their default credentials and are reachable from the host itself only. A tool on
another machine that read the database, the broker's management UI or the Mailpit inbox over the
network loses that route. No ADR: the developer Compose file and a setup script change, and no
interface, data shape, dependency or runtime boundary of the app does.
**From the review.** Graded open-progressed, on three points. The docs were not yet written; they
are now. A first run that stops after the renames left a tree that reads as already renamed with
the template's secrets in `.env`, and the rule above then skipped it for good. An `.env` whose
`JWT_SECRET` is still the template's placeholder is now treated as new, for both secrets, and the
script checks for `openssl` before it renames anything. A hand-copied `.env.test` beside an `.env`
with a password the user chose kept the template's password; `.env.test` now takes `.env`'s
whenever its own is still the template's. The reviewer also showed that `DB_USER` went into a
`sed` pattern as it was, so the URLs are rewritten only when it is a plain identifier, and only on
the two named lines. These fixes were made after the review and have not been graded. What was
left is in `docs/internal/todos/2026-10-12-todo-fork-bootstrap-review-leftovers.md`.
