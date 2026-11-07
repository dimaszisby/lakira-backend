# B-08 and B-09 — The fork bootstrap and a database user or a name it did not expect

Register rows [B-08 and B-09](register.md). Read at `bf72b58`. Both reproduced in the audit of
2026-10-12 on scratch copies of the script's inputs.

## 1. What is wrong

**B-08 (W3).** With a hand-made `.env` holding `DB_USER=alice` and a chosen password, bootstrap
prints "Database password copied to .env.test" and leaves `.env.test` with `DB_USER=my_app_user`,
`DB_PASSWORD` set to the chosen one, and
`TEST_DATABASE_URL=postgres://my_app_user:my_app_password@…`. The test chain then fails to log in,
and the predictable password is still in the URL.

**B-09 (T3).** `--name lakira-x` names the CI workflow `Lakira X X Backend CI`. A second run then
turns `lakira_x_user` into `lakira_x_x_user` and `lakira_x_development` into
`lakira_x_x_development` in `.env` and `.env.test`, while the init SQL keeps `lakira_x_test_db`.

## 2. Root cause

Both come from one habit: the script rewrites by pattern and assumes the pattern cannot match its
own output or a value it did not write.

- B-08: `set_db_password` (`scripts/bootstrap-fork.sh:370`) rewrites a URL only where it logs in
  as the user read from `.env`. `.env.test` came from the template, so its user is the template's,
  the pattern matches nothing, and the message at `:410` is printed whether or not a line changed.
  The script copies the password across and never the user.
- B-09: `s/Lakira Backend/<display> Backend/` then `s/Lakira/<display>/` (`:272-273`) run in
  sequence, and the second matches the first's output when the display name starts with "Lakira".
  The step that renames identifiers in an existing `.env` (`:288-290`) is `s/[Ll]akira_/<slug>_/g`
  with no guard for a slug that itself starts with `lakira_`, so it is not idempotent.

## 3. Options

For B-08:

- **A. Copy the user as well as the password** from `.env` to `.env.test`, in `DB_USER` and in the
  URL, replacing whatever user the URL names.
- **B. Rebuild the two URLs from parts** (`DB_USER`, `DB_PASSWORD`, host, port, database) instead
  of editing them by pattern. Removes the class of bug; changes more lines.
- **C. Refuse to continue** when `.env`'s user differs from the template's, and tell the user to
  align the files. Cheap and unfriendly.

For B-09:

- **D. Refuse a name that starts with the template's** (`lakira`, `lakira-…`). One check beside
  the other name rules. Loses a name nobody is likely to want.
- **E. Make each rewrite safe for its own output:** a single pass per file with the longer pattern
  first and anchored, and skip the identifier rewrite when the slug starts with the template's.
  Keeps the name available; more to get wrong.

## 4. Recommendation

**B and D.** Rebuilding the URLs ends the pattern-editing of credentials, which has now produced
three findings (the special-character user, this one, and the review's W7 items). Refusing the
name is honest about a case the script was never built for, and `--name lakira` (the template's
own short name) already behaves correctly and stays allowed.

Print "copied" only when a line changed: compare the file before and after.

## 5. Acceptance criteria for the fix

- **AC-1** — After a run with a hand-made `.env` holding any plain `DB_USER`, `.env.test` has the
  same user and password, in `DB_USER`, `DB_PASSWORD` and `TEST_DATABASE_URL`. _Why:_ W3.
- **AC-2** — No line of either file holds `<slug>_password` after a run that generated or copied a
  password. _Why:_ the predictable value must not survive in a URL.
- **AC-3** — The script prints that it copied the password only when `.env.test` changed.
  _Why:_ the message was false in the reproduction.
- **AC-4** — `--name lakira-x` exits non-zero before anything is renamed, with a message that names
  the rule. _Why:_ T3; and the existing rule that a refused name changes nothing.
- **AC-5** — A second run after any accepted name changes no file. _Why:_ the script's stated
  idempotence, which T3 broke.
- **AC-6** — `Fork Smoke` stays green, and the unit suite gains a case with a non-template user.
  _Why:_ the existing tests use `lakira_user` only, which is how W3 passed them.

## 6. Size and shape

≤½ day. Micro entry in `fork-test-credentials/decisions.md`. No ADR. Gates: typecheck, lint,
format, tests, build. The tutorial's table and its note on a chosen password change with it.

## 7. Depends on, unblocks

Depends on nothing. Closes the script half of S10 at the next dated run. The other bootstrap
leftovers (B-50) touch the same lines; items 3 and 10 of that todo are cheap to take in the same
PR, and the rest should stay out.

## 8. Not verified

- BSD `sed` and `grep` behaviour beyond what the unit suite exercises on this machine; CI runs GNU.
- A password or user containing characters outside the safe sets: the script declines to copy
  those today and option B has to keep declining or learn to percent-encode.
- Whether any existing fork is named with a `lakira` prefix. None is known.
