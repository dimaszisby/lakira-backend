# Todo — pre-commit guard against staged environment files

- **Status:** Complete — delivered by #73 (`dc7ad39`)
- **Created:** 2026-08-29
- **Completed:** 2026-08-29
- **Owner:** dimaszisby
- **Branch:** `chore/pre-commit-secret-guard`

---

## Why

`.claude/hooks/validate-bash.sh` rejects blanket staging with _"risks staging .env files. Add files
explicitly."_ — but it only inspects **agent tool calls**. A developer typing the same command in a
terminal was completely unguarded, and `pre-commit` ran `lint-staged` (eslint and prettier), which
has no opinion on secrets.

So the control existed against the actor least likely to leak a secret, and was absent for the one
holding the shell. That asymmetry is the whole reason for this change.

## What changed

`.husky/pre-commit` now inspects the **staged set** before running anything slower:

```sh
staged_env=$(git diff --cached --name-only --diff-filter=ACM \
  | grep -E '(^|/)\.env($|\.)' \
  | grep -vE '\.example$' || true)
```

Any staged `.env*` path that is not an `*.example` aborts the commit with the offending paths
listed. Because it reads the staged set rather than the command, it holds however files were added
and by whom — which is the property the agent-side hook lacks.

Placed **before** `lint-staged` so it fails in milliseconds rather than after a full lint pass.

Escape hatch is the standard `git commit --no-verify`, documented in the failure message itself.

## Verification

| Case                                             | Expected | Result                                |
| ------------------------------------------------ | -------- | ------------------------------------- |
| Staged `.env.hookprobe`                          | blocked  | **exit 1**, path named in the message |
| Only `.env.example` + `.env.test.example` staged | allowed  | **exit 0**                            |
| Nothing staged                                   | allowed  | exit 0, lint-staged runs              |

The match was designed against real inputs before being written:

| Path                                                         | Verdict                                               |
| ------------------------------------------------------------ | ----------------------------------------------------- |
| `.env`, `.env.development`, `.env.test.local`, `config/.env` | blocked                                               |
| `.env.example`, `.env.test.example`                          | allowed — these are tracked and must stay committable |
| `src/environment.ts`, `.envrc`                               | allowed — no false positives                          |

The `*.example` exemption is not cosmetic: both templates are tracked in this repo, so a guard that
caught them would block every commit touching them.

## Scope

Deliberately limited to `.env*`, matching the concern the existing agent-side hook names. Widening
it to `*.pem`, `*.key` and similar is a one-line change to the pattern, but each addition risks false
positives (`*.key` in particular), so it should be driven by a real incident rather than
speculation.

`.envrc` (direnv) is **not** blocked. It frequently holds secrets, but is also frequently committed
deliberately. Worth revisiting if this repo starts using direnv.

## Related

This landed alongside a change to the global commit-handover convention: commit messages are written
to `$(git rev-parse --git-dir)/COMMIT_DRAFT`, shown in chat for review, and applied with explicit
`git add` paths rather than a blanket stage. This hook is the part of that convention which does not
depend on anyone remembering it.
