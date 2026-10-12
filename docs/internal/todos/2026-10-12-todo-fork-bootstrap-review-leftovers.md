# Todo — what the S10 review left in the fork bootstrap

- **Status:** Open (item 2 is P2, the rest P3)
- **Created:** 2026-10-12
- **Owner:** unassigned
- **Origin:** the security review of `fix/fork-db-password-loopback-ports`
  ([`fork-test-credentials` D-04](../initiatives/fork-test-credentials/decisions.md))

Read in the code by the reviewer. Item 2 was reproduced by `audit-2026-10-12.md` (W3); the others were not run.

## Items

1. **Step 2b rewrites a user's own values.** `scripts/bootstrap-fork.sh` runs
   `s/[Ll]akira_/<slug>_/g` over an existing `.env` and `.env.test`. Its comment says only the
   identifier prefix is rewritten, but any value holding `lakira_` changes, a chosen password
   included. Older than S10.
2. **`DB_USER` in `.env.test` is never matched to `.env`** (P2, finding W3 of
   `audit-2026-10-12.md`). Only the password is copied across. With a hand-made `.env` holding
   `DB_USER=alice` and a chosen password, the script prints "Database password copied to
   .env.test" and leaves `.env.test` with `DB_USER=my_app_user` and
   `TEST_DATABASE_URL=…my_app_user:my_app_password@…`. Fix: write `.env`'s user to `.env.test`
   with its password, and print "copied" only when a line changed.
3. **An `.env` with no `DB_PASSWORD` line gets none**, and a new `.env.test` then keeps the
   template's password. Deliberate (the file is the user's), and not stated in the tutorial.
4. **A fork made before this change keeps `<slug>_password`.** The script never replaces a password
   in use. The tutorial says how to recreate the volume, not how to rotate in place.
5. **Fork Smoke does not assert the outcome.** It proves the chain logs in. It would also pass with
   the template's password or with ports on every interface; the two unit tests are what check
   those, and `bootstrap-fork.test.ts` is skipped in a fork.
6. **The bootstrap tests run on GNU tools in CI.** The BSD `sed` and `grep` paths are exercised
   only when someone runs the unit tests on macOS.
7. **The generated password is an argument to `sed`**, so another user on the same machine could
   read it from the process list while the script runs.
8. **Redis has no password and RabbitMQ is `guest`** on the loopback ports. A browser on the same
   machine sending a cross-protocol request to `127.0.0.1:6379` is a theoretical route. Not
   checked.
9. `docs/how-to/development/run-postgres-in-docker.md` still shows `docker run -p 5432:5432`, which
   binds every interface.
10. From `audit-2026-10-12.md` § 6 (W7): `APP_NAME` is appended onto the last line of an `.env`
    that has no trailing newline; the closing text always says the secrets were rotated; a run
    that stopped during the renames is not healed by the next one; an `.env.test` that exists
    alone has its password overwritten without a message.
11. `--name lakira-x` (T3, same run § 4.3): the workflow is named `Lakira X X Backend CI`, and a
    second run renames `lakira_x_user` to `lakira_x_x_user` in both env files. The grader rated
    it P2.
