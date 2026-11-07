# Decisions — fork-bootstrap-leftovers

## D-01 — In a user's env files, only database identifiers are renamed

- **Status:** Accepted (#219, `d1ff8da`)
- **Date:** 2026-10-23

**Context.** Step 2b renames an `.env` or `.env.test` that exists before the run with
`s/[Ll]akira_/<slug>_/g`, over every line. Its comment says only the identifier prefix changes,
but any value holding `lakira_` changes: `DB_PASSWORD=lakira_secret` becomes `my_app_secret`, and
the user's database then refuses the login (item 1).
**Decision.** Step 2b renames the values of `DB_USER` and `DB_NAME`, and in a
`DEVELOPMENT_DATABASE_URL` or `TEST_DATABASE_URL` the user and the database name, when they start
with the template's prefix. The template's own password, `lakira_password`, is renamed wherever
those keys hold it, so step 3c still recognises it as the template's and replaces it. Nothing else
on any line changes. The rewrite is `awk` fed through its environment, as `write_db_login` is.
**Options considered.** _Anchor the `sed` on `=lakira_`:_ still rewrites `DB*PASSWORD`, and misses
the user in a URL. \_Leave the files alone:* S3 (audit 2026-10-03) is why step 2b exists.
**Consequences.** A user's own value is never renamed. A staging or production URL in `.env` keeps
its database name, as it does in the template.

---

## D-02 — No secret the script writes is a command-line argument

- **Status:** Accepted (#219, `d1ff8da`)
- **Date:** 2026-10-23

**Context.** The database password reaches `awk` through its environment, which only the same user
can read. The JWT secret is part of a `sed` expression, so for the life of that `sed` any user on
the machine can read it from the process list (item 7).
**Decision.** Every value the script generates is written by an `awk` that reads it from
`ENVIRON`: the JWT secret, the database password and the broker password (D-06). A test reads the
script and fails on a generated value inside a `sed` or `do_sed` argument.
**Options considered.** _A temp file holding the secret:_ one more copy of it on disk.
**Consequences.** None for the user; one write path for every secret.

---

## D-03 — The script has no BSD/GNU branch

- **Status:** Accepted (#219, `d1ff8da`)
- **Date:** 2026-10-23

**Context.** The script detects the `sed` flavour to pick `sed -i` or `sed -i ''`. CI runs the
bootstrap tests on GNU tools only, so the BSD branch runs only when someone tests on a Mac (item
6).
**Decision.** `do_sed` runs plain `sed` into a temp file outside the tree, then writes it back
through the file with `cat`, as `write_db_login` does, so the file keeps its mode. The detection
goes. Every other tool the script uses is called the same way on both.
**Options considered.** _A macOS job in CI:_ about ten times the runner cost, to test a branch
that can be removed.
**Consequences.** The path CI tests is the path a Mac runs.

---

## D-04 — A run finishes a rename that an earlier run left part-way

- **Status:** Accepted (#219, `d1ff8da`)
- **Date:** 2026-10-23

**Context.** "Already renamed" is read from `package.json`, which step 1 renames first. A run
stopped after it leaves the spec, the workflows, the test template and the init SQL on the
template's names, and every later run skips steps 1b and 2 (item 10, first half).
**Decision.** Steps 1, 1b and 2 run in both states. Each matches only the template's strings, and
a name holding `lakira` is refused, so on a finished tree they change nothing. The prune and
`FORKED-FROM.md` stay first-run only. The template asked to take its own name still renames
nothing.
**Options considered.** _A marker file written at the end:_ a second source of truth beside
`package.json`, and one a fork could commit.
**Consequences.** A second run reads a few more files. Found in review: a re-run also renames
"Lakira" in a file of step 2's list that the fork later edited to hold it, such as a workflow
comment; in CI that is the job's own checkout, on a machine it is a change `git diff` shows.

---

## D-05 — An `.env.test` the user filled in gives its login to a new `.env`

- **Status:** Accepted (#219, `d1ff8da`)
- **Date:** 2026-10-23

**Context.** With no `.env`, step 3 creates one from the template and generates a password, and
step 3c copies it over the password the user chose in an `.env.test` that was already there. The
only message is "Database login copied" (item 10, second half).
**Decision.** When this run created `.env` and the existing `.env.test` holds a plain-identifier
`DB_USER` and a `DB_PASSWORD` that is not the template's, `.env` takes that user and password, in
its URLs too, and the run says so. A Postgres volume created with them keeps working. Every other
case is unchanged.
**Options considered.** _Warn and replace:_ the user's database then refuses the new login.
**Consequences.** A fork's first `.env` can hold a password it did not generate; the closing
message says which happened.

---

## D-06 — Bootstrap generates the broker login; Redis keeps no password

- **Status:** Accepted (#219, `d1ff8da`)
- **Date:** 2026-10-23

**Context.** Both templates ship `RABBITMQ_USER=guest` and `RABBITMQ_PASSWORD=guest`, and Compose
creates the broker from them with its management UI on `127.0.0.1:15672`. A page that rebinds its
DNS name to `127.0.0.1` can reach that UI. Redis has no password, and already refuses input that
looks like HTTP (item 8). The owner chose to generate the broker login only (2026-10-23).
**Decision.** In an `.env` this run treats as fresh (the rule JWT*SECRET follows) that still holds
`guest`/`guest`, `RABBITMQ_USER` becomes the database slug and `RABBITMQ_PASSWORD` a generated
value. `.env.test` takes the same pair while it holds `guest`. Compose already passes both to the
broker and to the app's and worker's URLs.
**Options considered.** \_A Redis password too:* Compose, both templates and CI's Redis change, for
a route Redis closes itself. _Documentation only:_ leaves the UI on a known login.
**Consequences.** A broker volume created before the run keeps the old user; the tutorial's
`down -v` note names both volumes.

---

## D-07 — The script's short name strips only `-backend`

- **Status:** Accepted (#219, `d1ff8da`)
- **Date:** 2026-10-23

**Context.** The script strips `-backend` or `-api` for the database, CI and queue names it
writes; `app-name.ts` strips only `-backend` (ADR-0060), and the script computes that second name
too, for the spec. `acme-api` got `acme_*` databases and an `Acme Api` API (B-51).
**Decision.** One short name, the app's: only `-backend` is stripped. `acme-api` gets
`acme_api_user`. The two derivations become one, and the `lakira` refusal follows the same rule,
so `lakira-api` is refused.
**Options considered.** _The app strips `-api` too:_ renames the cookie, queues and API title of
every deployed `-api` fork.
**Consequences.** Only what a new bootstrap writes changes; a renamed tree is never renamed again.

---

## D-08 — Fork Smoke checks what the bootstrap produced

- **Status:** Accepted (#219, `d1ff8da`)
- **Date:** 2026-10-23

**Context.** Fork Smoke proves the bootstrap, Compose and `.env.test` chain logs in. It would pass
with the template's secrets, or with a port published on every interface (item 5).
**Decision.** A step after the bootstrap fails when `.env` keeps the template's `JWT_SECRET`,
`DB_PASSWORD` or `RABBITMQ_PASSWORD`; when `.env.test` and `.env` disagree on the database or
broker user or password; or when `docker compose config` publishes a port on any address but
`127.0.0.1`. It prints names, never values. The workflow file is staged for the owner to copy.
**Options considered.** _Leave it to the unit tests:_ `bootstrap-fork.test.ts` skips in a fork,
and does not run Compose.
**Consequences.** One more step, in seconds.

---

## D-09 — The docs say how to rotate in place, and publish on loopback

- **Status:** Accepted (#219, `d1ff8da`)
- **Date:** 2026-10-23

**Context.** The tutorial says how to recreate a volume, not how to change a password in one that
holds data (item 4). `run-postgres-in-docker.md` publishes Postgres on every interface (item 9).
**Decision.** The tutorial gains rotating the database password with `ALTER ROLE` and the broker's
with `rabbitmqctl change_password`, then both env files. The how-to publishes on `127.0.0.1`.
**Options considered.** _A `--rotate` flag:_ the script never touches a running service.
**Consequences.** None in code.
