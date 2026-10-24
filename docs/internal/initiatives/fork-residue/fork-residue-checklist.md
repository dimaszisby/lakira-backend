# Fork residue — Checklist

Lean kit: the acceptance criteria are stated here. Checked against `origin/dev` at `e36b2d5` (#223).
R12 named four items; two were fixed before this kit: the hard-coded OpenAPI filename (S2,
`scripts/openapi-spec-path.js`) and the `lakira.dev` seed addresses (#223, `app-name-review-leftovers`
D-04).

## Acceptance criteria

- **AC-1** — After bootstrap, `docker-compose.yml` holds no template container, network or volume
  name; each is the fork's slug plus the old name. A second run changes nothing. _Why:_ R12, a
  fork shared the template's database volume (D-01).
- **AC-2** — The template's own `docker-compose.yml` is unchanged. _Why:_ the owner's stack keeps
  its containers and data (D-01).
- **AC-3** — After bootstrap, no Markdown link outside `docs/internal/` points into it, and each
  link's text is kept. With `--keep-internal`, nothing is unlinked. _Why:_ R12, dead links in a
  fork (D-02).
- **AC-4** — Links that point elsewhere are unchanged, including external links, anchors, and
  relative links that only mention "internal". _Why:_ the rewrite must not touch what it was not
  for.
- **AC-5** — No doc outside `docs/internal/` tells a reader to reach a Compose container by a
  template name. _Why:_ D-03.
- **AC-6** — Fork Smoke fails on a surviving template name or an internal link, and passes on a
  bootstrapped tree. _Why:_ keeps R12 closed.

**Out of scope.** Compose project names for the template (owner, 2026-10-25); plain-text mentions of
`docs/internal/` in code and tests; dead links that do not point into `docs/internal/`.

## Phase 0 — kit and branch

- [x] `fix/fork-residue` cut with `--no-track` from `origin/dev` at `e36b2d5`; HEAD and upstream
      verified
- [x] This kit: README, this file, `decisions.md` with D-01 to D-03
- [x] #223's loose ends: `app-name-review-leftovers` D-01 to D-05 Accepted, README Done; the
      register's B-52 row names `#223 (e36b2d5)`; "As of" `e36b2d5`

## Phase 1 — tests first, each seen to fail

All of them failed first, the bootstrap suite whole: its fixture copies the script that did not
exist yet. Two cases were added later. One for links written as code, together with its fix, so
never seen red. One for a tree whose `docs/internal/` was already gone, seen red against the
script without the review's fix.

- [x] `bootstrap-fork.test.ts` › a fork's Compose names carry its slug; a second run changes
      nothing; the template's own run leaves the file as it is (AC-1, AC-2)
- [x] `bootstrap-fork.test.ts` › links into `docs/internal/` are unlinked; `--keep-internal` keeps
      them (AC-3)
- [x] `unlink-internal-docs.test.ts` › depths, anchors, external links, a sibling folder named like
      `internal`, `--check` (AC-3, AC-4)

## Phase 2 — the change

- [x] `scripts/bootstrap-fork.sh`: the Compose renames (D-01); the unlink after the prune (D-02);
      the closing message
- [x] `scripts/unlink-internal-docs.js` (D-02)
- [x] `getting-started.md`, `database-schema.md` through `docker compose` (D-03)
- [x] `.github/workflows/fork-smoke.yml`: the two checks, staged at `.git/` for the owner to copy
      (AC-6)

## Phase 3 — gates, review, docs

- [x] Fork run in the scratchpad: a copy of this tree bootstrapped as `my-app`. All ten Compose
      names became `my_app_*`; bootstrap printed "Unlinked 181 links in 89 files" (the 180 found
      on the template, and ADR-0051's new note); the drafted Fork Smoke step passed, and failed
      on the template's `docker-compose.yml` (all ten names reported) and on a restored link.
      `docker compose create db` made `my_app_postgres_db`, `my_app_db_data_volume` and
      `my_app_backend_network`, and `down -v` removed only those: the owner's `db_data_volume`
      and five containers were there before and after (AC-1, AC-3, AC-6)
- [x] Review of the diff: one fix. A tree whose `docs/internal/` was already gone kept its dead
      links, so the "already absent" branch unlinks too, with a test
- [x] Docs: `fork-and-rebrand.md`, ADR-0051 status note, register B-53 to Closed

## Discovered

- [x] Found: two examples written as code, in `.claude/agents/doc-writer.md` and
      `documentation-standards.md`, look like links into `docs/internal/` → in scope: the script
      leaves fenced blocks and inline code alone (D-02)
- [x] Found: the worker service is under a Compose profile, so `docker compose config` left out
      `node_worker` → in scope: the Fork Smoke check reads `--profile '*'`
- [x] Found: the tutorial's manual removal of `docs/internal/` (step 6) would leave the links dead
      → in scope: it runs the script too

## Acceptance

- [x] AC-1 — `bootstrap-fork.test.ts` › "gives every Compose name the fork's slug", "changes nothing
      in docker-compose.yml on a second run"; the fork run
- [x] AC-2 — `bootstrap-fork.test.ts` › "leaves the template's names alone when the template takes
      its own name"; `git diff docker-compose.yml` is empty
- [x] AC-3 — `bootstrap-fork.test.ts` › "turns each link into docs/internal into its text", "unlinks
      them too when docs/internal was removed before the run", "keeps the links with
      --keep-internal"; the fork run
- [x] AC-4 — `unlink-internal-docs.test.ts` › "leaves every other link alone", "leaves a link
      written as code alone"
- [x] AC-5 — `getting-started.md`, `database-schema.md`; no other doc outside `docs/internal/`
      names a template container with Compose (`run-postgres-in-docker.md` is plain `docker run`)
- [x] AC-6 — the drafted step, run on the fork both ways

## Gates

Node 24.22.1.

- [x] typecheck — clean
- [x] lint — clean
- [x] format — clean
- [x] tests — unit with coverage, 158 suites, 1689 tests, before the review's fix; the two changed
      suites again after it, 99 tests. Integration not run: no `src/` change
- [x] build — clean
- [x] OpenAPI, image smoke, security delta — not run: no route, image or dependency change
