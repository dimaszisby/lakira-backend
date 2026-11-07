# Fork bootstrap leftovers — Plan

- **Status:** Approved
- **Appetite:** 1 day — past that, cut an item into its own row rather than extend
- **Date:** 2026-10-23

## Context and goals

Register row B-50 holds what the review of `fix/fork-db-password-loopback-ports` left in
`scripts/bootstrap-fork.sh` (`2026-10-12-todo-fork-bootstrap-review-leftovers.md`, items 1, 4 to 9
and two halves of 10). B-51 is the same script's short name disagreeing with `app-name.ts`. The
owner chose (2026-10-23) to fold B-51 in with the script following the app, and for item 8 to
generate the RabbitMQ login and leave Redis without a password.

Read on `dev` at `9534687`:

- **Item 1 holds.** Step 2b runs `s/[Ll]akira_/<slug>_/g` over an existing `.env` and
  `.env.test`: `DB_PASSWORD=lakira_secret` becomes `my_app_secret`.
- **Item 7, half.** The database password reaches `awk` through its environment; the JWT secret is
  a `sed` argument, readable in the process list.
- **Item 6.** `sed -i` is the one BSD/GNU branch the script has.
- **Item 10a holds.** A run stopped after step 1 leaves `package.json` renamed; the next run reads
  the tree as renamed and skips steps 1b and 2.
- **Item 10b.** With no `.env`, the generated password replaces one the user chose in an existing
  `.env.test`.
- **Item 5.** Fork Smoke proves the chain logs in, not that the secrets were rotated or the ports
  bound to loopback.
- **Item 8.** Compose reads `RABBITMQ_USER` and `RABBITMQ_PASSWORD` from `.env`; both templates
  ship `guest`/`guest`, with the management UI on `127.0.0.1:15672`.
- **Items 4 and 9.** The tutorial does not say how to rotate a password in place; one how-to
  publishes Postgres on every interface.
- **B-51.** The script strips `-backend` or `-api`; `app-name.ts` strips only `-backend`.

## Acceptance criteria

- **AC-1** — A value the user set in `.env` or `.env.test` survives step 2b; only database
  identifiers and the template's password are renamed. _Why:_ item 1.
- **AC-2** — No secret the script writes is a command-line argument. _Why:_ item 7.
- **AC-3** — The script has no BSD/GNU branch, and a file it rewrites keeps its mode. _Why:_
  item 6.
- **AC-4** — A run after one that stopped part-way through the renames finishes them. _Why:_
  item 10a.
- **AC-5** — An `.env.test` the user filled in, found without an `.env`, keeps its login, and the
  new `.env` takes it. _Why:_ item 10b.
- **AC-6** — A fresh fork's broker login is generated, the same in `.env` and `.env.test`, and is
  not `guest`. _Why:_ item 8.
- **AC-7** — Fork Smoke fails when a template secret survives, when the two env files disagree on
  a login, or when Compose publishes a port beyond loopback. _Why:_ item 5.
- **AC-8** — The tutorial says how to rotate the database and broker passwords in place, and no
  how-to publishes a service on every interface. _Why:_ items 4 and 9.
- **AC-9** — The script's short name is the app's: only `-backend` is stripped. _Why:_ B-51.
- **AC-10** — Every gate passes.

## Open questions

None. Items 8 and B-51 were the owner's, answered 2026-10-23.

## Out of scope

- B-52 (the `APP_NAME` review leftovers) and B-53 (fixed Compose names): rows of their own.
- A Redis password (D-06).
- A macOS CI job (D-03).

## Decisions expected

All taken in planning: [decisions.md](decisions.md) D-01 to D-09.

## Phases

- **Phase 0** — branch, this kit, #218's loose ends, the `follow-redirects` row (B-91).
- **Phase 1** — tests first in `__tests__/unit/bootstrap-fork.test.ts`.
- **Phase 2** — the script: D-03, D-02, D-01, D-04, D-07, D-05, D-06.
- **Phase 3** — Fork Smoke (D-08), staged for the owner to copy; docs (D-09).
- **Phase 4** — gates, review, fix, docs, drafts.

## Risks and trade-offs

- D-07 changes what a new `-api` fork's database is called. A fork that ran the old script keeps
  its names, since a renamed tree is never renamed again.
- D-06 gives a broker volume created before the run an old user; the tutorial's `down -v` note
  names it.

## Security and data

Items 1, 7 and 8 are about the secrets a fork starts with. No secret is printed by the script, by
a test, or by Fork Smoke: the new step compares values and prints only their names.

## References

- `2026-10-12-todo-fork-bootstrap-review-leftovers.md`, `2026-09-24-todo-app-name-short-name-mismatch.md`
- `fork-test-credentials` D-04, D-05; ADR-0051; ADR-0060
