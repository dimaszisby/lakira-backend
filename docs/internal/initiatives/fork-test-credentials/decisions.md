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

- **Status:** Accepted (merged in #157, `5bb4e3a`)
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

## D-05 — `.env.test` takes the whole login from `.env`, and a name that holds `lakira` is refused

- **Status:** Accepted
- **Date:** 2026-10-13

Micro entry for register rows B-08 (finding W3 of `audit-2026-10-12.md`, P2) and B-09 (T3, P3 on
file, P2 from the grader), on `fix/fork-bootstrap-user-and-name`. Written before any code.

**Context.** Both come from one habit of `scripts/bootstrap-fork.sh`: it rewrites by pattern and
assumes the pattern cannot match its own output or a value it did not write. With a hand-made
`.env` holding `DB_USER=alice`, the script copied the password to `.env.test` and never the user,
edited a URL only where it already logged in as `alice`, and printed "copied" whether or not a
line changed. With `--name lakira-x`, the title rewrite matched its own output on the first run
and the identifier rewrite matched its own on the second.
**Decision.** Two changes.

1. When the script brings `.env.test` into line with `.env` (the three cases of D-04 are
   unchanged), it writes `DB_USER`, `DB_PASSWORD` and `TEST_DATABASE_URL` together. A URL is
   rebuilt: its scheme, then the user and password, then whatever followed the old credentials.
   Whatever user the old URL named is replaced. The same rebuild is used in `.env` for
   `DEVELOPMENT_DATABASE_URL` and `TEST_DATABASE_URL` when the password is generated, for a URL
   that logs in as `DB_USER` or still holds the template's password (see "From the review"). The lines
   are written by one `awk` pass that takes the values from its environment, so neither value is
   part of a `sed` pattern, and the script says it copied the login only when the file changed.
2. A `--name` that holds `lakira` is refused beside the other name rules, before anything is
   renamed, unless its short name is exactly `lakira` (`lakira`, `lakira-backend`, `lakira-api`).

**Options considered.** Copying the user with one more pattern: rejected, it is the habit that
produced this finding and two before it. Refusing to continue when the two users differ:
rejected, the script can do the work. Percent-encoding a user or password that is not plain:
rejected, more to get wrong than the case is worth; the script keeps warning and leaves those
URLs to the user. Making each rename safe for its own output: rejected, more to get wrong, for
names nobody is known to want. Refusing only a name that starts with `lakira`, as the analysis
proposed: read from the code, `my-lakira` and `lakirax` break the same way, so the rule covers
them; a test of each is written first, and this entry is corrected if one is refuted.
**Consequences.** A fork that re-runs bootstrap with an `.env.test` still on the template's
password has its user replaced by `.env`'s as well as its password. A tree already named with
`lakira` in it is refused on its next run, which also stops that run from renaming its database
user again; none is known. An `.env` with no `DB_USER` line still gives `.env.test` the password
only. No ADR, on D-04's ground: a setup script changes, and no interface, data shape, dependency
or runtime boundary of the app does.
**Reproduced before the fix,** on scratch copies at `c8e1a87`: `lakira-x` and `my-lakira` title
the workflow twice and rename the database user again on a second run; `lakirax` titles the
workflow `Lakiraxx Backend CI` and leaves the env files alone. All three are refused. `lakira`
and `lakira-api` change nothing on a second run and stay allowed.
**From the review,** my own, of the first version. In `.env` the rebuild replaced the credentials
of any development or test URL, so a URL the user had pointed at another server with a user and
password of their own lost them; it now rebuilds only a URL that logs in as `DB_USER` or still
holds the template's password, and `.env.test`, which has one database to reach, is rebuilt
whatever it names. The temporary file was made beside `.env` under a name no ignore rule covers;
it is made in the system's temporary directory. A tree the old script had already run on, with
the chosen password in `DB_PASSWORD` and the template's still in the URL of `.env.test`, was not
healed by a new run; a URL that still holds the template's password is now a fourth case for
copying the login. Two parts of item 10 of the leftovers todo went in with this: `APP_NAME`
starts its own line in an `.env` with no final newline, and the closing text says what the run
generated; a first run on an `.env` with no `JWT_SECRET` line used to say it had rotated one.
Run on BSD tools here and on GNU `sed` with `mawk` in a `node:24` container, with the same
result. Not graded by anyone else.
