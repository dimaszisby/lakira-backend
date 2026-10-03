# Fork OpenAPI gate and bootstrap ordering — Checklist

Lean kit: the acceptance criteria are stated here, not in a plan.

## Phase 0 — kit and branch

- [x] `fix/fork-openapi-gate` cut with `--no-track` from `origin/dev` at `50258e4`; HEAD and
      upstream verified
- [x] This kit: README, checklist, `decisions.md` with D-01 to D-03
- [x] Loose ends from #133: the S1 todo, kit `saas-reaudit-2026-10-03` D-07 and
      `SAAS-BASE-CHECKLIST.md` say merged in #133 (`50258e4`) where they name the branch

## Phase 1 — tests first

- [x] `__tests__/unit/bootstrap-fork.test.ts` — the fixture gains the spec file; new cases for the
      renamed spec path (S2), a hand-made `.env` first (S3), a second run without the env files
      (S4), and a second run with them (idempotence)
- [x] `__tests__/unit/openapi-spec-path.test.ts` — the path comes from the package name; no script
      or contract runner except bootstrap carries the literal filename
- [x] The new cases shown failing on the current script — 8 failed: S2, S3, S4, and the five
      single-definition checks

## Phase 2 — the fix

- [x] `scripts/openapi-spec-path.js` — the one definition, plain JavaScript
- [x] `scripts/generate-openapi.ts`, `normalize-openapi.ts`, `validate-openapi.ts`, and
      `tests/contract/schemathesis/scripts/run-local.js` and `run-staging.js` — import it
- [x] `scripts/bootstrap-fork.sh` — spec file and its mentions renamed; identifier renames applied
      to an existing `.env` and `.env.test`; the early exit replaced by a skip of the rename steps;
      header comment updated
- [ ] `.git/fork-smoke.yml` — `Fork Smoke` with lint, typecheck and `docs:openapi:check` added.
      Drafted; **copied into `.github/workflows/` by the repository owner at commit time** (the
      hook blocks edits there), and first run on this branch's push

## Discovered

- [x] Found in review: the two contract runners (`run-local.js`, `run-staging.js`) hardcoded the
      same filename, so a fork's contract tests would have pointed at a missing file → in scope,
      the shared module became plain JavaScript and both import it (D-01)
- [x] Found in review: `git mv` fails when the new spec path exists, after `package.json` is
      already rewritten → in scope, the script refuses before changing anything (D-01)
- [x] Found in review: a re-run with a different name rotated the secret of a `.env` in use and
      pruned again → in scope, the tree keeps its name (D-03)
- [x] Found in review: the broad `Lakira` patterns would have run over the reader's own `.env` →
      in scope, only the identifier prefix is rewritten there (D-02)
- [x] Found while fixing the above: `--name lakira-backend` on the template would have reached the
      prune and deleted `docs/internal` → in scope, treated as nothing to rename (D-03)
- [x] Checked and not a defect: the review expected the regenerated spec to differ on a fork
      (title from `APP_NAME`). On a scratch fork it is byte-identical, because the generator does
      not load `.env`; recorded as a known limit under D-01
- [x] Not fixed: S10 (unrotated service passwords, ports on all interfaces) → out of scope, stays
      open in `docs/internal/todos/2026-10-03-todo-fork-openapi-gate-and-bootstrap-order.md`

## Acceptance

- [x] **AC-1** — On a fresh fork, `npm run docs:openapi:check` exits 0 (scratch clone, `--name
my-app`; lint and typecheck also exit 0 there). _Why:_ S2.
- [x] **AC-2** — Upstream, the spec path and content are unchanged: `git diff` on
      `docs/reference/api/lakira-backend-openapi.json` is empty and `docs:openapi:check` passes.
      _Why:_ lakira-frontend syncs from that path.
- [x] **AC-3** — Bootstrap after a hand-made `.env` leaves `.env`, `.env.test` and the init SQL in
      agreement. _Why:_ S3.
- [x] **AC-4** — Bootstrap re-run under the fork's own name creates a missing `.env` and
      `.env.test`, and changes nothing when they exist. _Why:_ S4, and the script's idempotence
      promise.
- [ ] **AC-5** — `Fork Smoke` runs lint, typecheck and the OpenAPI gate on the bootstrapped tree.
      Proven only when this branch's own `Fork Smoke` run is green; the same three commands pass
      on a scratch fork locally.
      _Why:_ S2 survived because the smoke ran the fork's tests and not its gates.

## Gates

Final tree, Node 24.21.0, 2026-10-04.

- [x] typecheck — pass
- [x] lint — pass
- [x] format — pass
- [x] tests — unit 733 passed; integration 219 passed, 5 skipped
- [x] build — pass
- [x] OpenAPI — `docs:openapi:check` pass, no drift; the spec file is untouched
- [x] security delta — skipped, no dependency change
- [x] image smoke — skipped, no `Dockerfile`, `.dockerignore` or dependency change
- [x] extra: `contract:local:gate` — pass (1441 generated), run because the contract runners changed

## Review

`code-reviewer` pass: 2 marked critical, 6 warnings. Each was checked against the code or a scratch
fork.

- "The OpenAPI step in `Fork Smoke` will fail, because the title follows `APP_NAME`" — not a
  defect today: reproduced on a scratch fork, where the regenerated spec is byte-identical and the
  gate exits 0. Recorded as a known limit (D-01).
- `git mv` can abort half-way when the destination exists — confirmed, fixed (pre-flight refusal).
- Contract runners hardcode the filename — confirmed, fixed.
- A different name on a re-run rotates a secret in use — confirmed, fixed (D-03).
- Broad patterns applied to the reader's `.env` — confirmed, fixed (D-02).
- S3 not fixed on the already-renamed path — fixed: the identifier rename runs on every run.
- No guard when `package.json` has no name — fixed: the module throws.
- Tests proved less than they claimed — partly fixed: the module is now loaded by Node and its
  result asserted; a git fixture covers the staged rename, the refusal and the different-name run.
  The generator itself is exercised by `docs:openapi:check`, not by a unit test.
