# Todo — nothing checks `docs/reference/commands.md` against `package.json`

- **Status:** Open
- **Created:** 2026-09-24
- **Owner:** unassigned
- **Origin:** found by the `docs-sweep` kit; see [D-05](../initiatives/docs-sweep/decisions.md)

---

## What

`docs/reference/commands.md` and `.claude/rules/commands.md` both said the command list was
"verified" or "checked" against `package.json`. No test, script or workflow did that. The claim
has been corrected. On 2026-09-24 the page was missing 27 real scripts (now added under "Other
scripts") and documented none that did not exist.

## Why it matters

The page is the declared single source of truth for commands (`.claude/rules/commands.md`), and a
second copy already drifted once (`migrate:dev`, which never existed). Without a check, it drifts
silently again.

## Suggested fix

A small unit test or script that reads `package.json` `scripts` and asserts that every script
name appears in `commands.md`, and that every `npm run <name>` in the page exists. Brace groups
such as `migrate:{test,staging,production}:undo` need expanding. Prove it fails first by deleting
one row.
