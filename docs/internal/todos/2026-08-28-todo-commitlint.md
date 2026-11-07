# Todo — enforce Conventional Commits with commitlint

- **Status:** Complete — delivered by #71 (`bba4e6c`), CI check in #74 (`b71bacd`)
- **Created:** 2026-08-28
- **Completed:** 2026-08-28
- **Owner:** dimaszisby
- **Branch:** `chore/commitlint`

---

## Why

`CLAUDE.md` already mandates a Conventional Commits prefix on every PR title, but nothing enforced
it. The history shows the drift: across the last 120 commits the types include `static` (15),
`tests` (13, where the standard is `test`), plus `update`, `prettier`, `dockerignores` and `cheap`.

## What this does and does not fix

The prompt for this was three commits on `dev` sharing the subject
`chore(dev-env): make local setup work from a fresh clone`, each carrying the wrong body.

**commitlint would not have caught any of them.** All three are valid Conventional Commits — they
were simply the wrong message, recalled from shell history as a `git commit -F- <<'EOF'` block.
`squash_merge_commit_title` is `COMMIT_OR_PR_TITLE`, so a wrong subject propagates into the PR title
and onto `dev`.

The root-cause fix is a workflow change, recorded in `.claude/rules/workflow.md`: **hand commit
messages over as a file** and use `git commit -F <path>`, or compose in `$EDITOR`. commitlint is a
complementary control adopted on its own merits — format discipline — not a fix for that incident.
Claiming otherwise would be the same mistake as trusting `docs:openapi:check` to catch an invalid
spec.

Two alternatives were considered and rejected: a bespoke duplicate-subject hook (targets a symptom;
custom hooks accumulate friction and get bypassed) and `git notes` on the mislabelled commits (wrong
tool — notes are Gerrit-adjacent, do not clone by default, and GitHub barely renders them; the PRs
and todo docs already carry the record).

## What changed

- `@commitlint/cli` and `@commitlint/config-conventional` as devDependencies. **`npm audit` is
  unchanged at 9 moderate** — no new vulnerabilities.
- `commitlint.config.mjs` extending `config-conventional`, with one deviation: `release` added to
  `type-enum`, since the `dev → staging → main` promotion flow uses it (e.g. PR #58,
  `release(staging): …`).
- `.husky/commit-msg` running `npx --no -- commitlint --edit "$1"`. It exports `PATH` the same way
  `.husky/pre-commit` does, because commits are sometimes made from a GUI client (SourceTree) that
  does not inherit a login shell's PATH.
- `prepare` script changed from `husky install` to `husky` — the v9 form. The old one printed
  `husky - install command is DEPRECATED` on every `npm install`.

Defaults were kept where they fit rather than tightened for its own sake: `header-max-length` stays
at 100, and all ten most recent subjects are ≤80 characters, so it will not fight normal use. The
older 292-character subject in the history would have been rejected, which is the point.

## Verification

Rejected, as intended:

| Message                                |                         |
| -------------------------------------- | ----------------------- |
| `added some stuff`                     | no type                 |
| `tests: plural type is not standard`   | `tests` ≠ `test`        |
| `static: not a conventional type`      | not in `type-enum`      |
| `Fix(redis): capitalised type`         | type must be lower-case |
| `fix(redis): Subject Starts Uppercase` | subject case            |

Accepted, as intended: `release(staging): …` (the custom type), the real 80-character
`fix(redis): let the reconnect strategy run instead of exiting on the first error`, `docs: …`, and
`revert: …`.

The hook itself was exercised through the same interface git uses — `sh .husky/commit-msg <file>` —
and exits non-zero on a bad message, zero on a good one. `core.hooksPath` is `.husky/_`, and
`.husky/_/commit-msg` delegates via husky's dispatcher, so git will actually invoke it. That last
check matters: a hook file that exists but is never called is the failure mode here.

```
lint / typecheck / format:check   0
docs:openapi:check                clean
test:unit / test:integration      green
```

## Expect some friction

The first few commits after this lands will be rejected while habits adjust — that is the tool
working. `git commit` with no `-m` opens `$EDITOR`, and the message can be fixed in place rather
than retyped.
