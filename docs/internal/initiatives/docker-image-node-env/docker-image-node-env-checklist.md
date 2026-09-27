# Run the production image as production by default — Checklist

Lean kit: the acceptance criteria are stated here. Checked against `origin/dev` at `560f56f`.

## Acceptance criteria

- **AC-1** — An image built by `npm run docker:build` reports `NODE_ENV=production` with no runtime
  value, and the runtime value when one is given (`-e NODE_ENV=staging`). _Why:_ fail safe by
  default, override when intended.
- **AC-2** — Started with `DISABLE_RATE_LIMITING=true` and no `NODE_ENV`, the new image refuses to
  start with the ADR-0036 message, and the image built from `dev` before the change does not.
  _Why:_ this is the defect, shown before and after.
- **AC-3** — The image still builds, and bcrypt still works inside it. _Why:_ `NODE_ENV` must not
  leak into the build stage's `npm ci`.
- **AC-4** — The Dockerfile test fails with the `ENV` line removed, and fails with it moved into the
  build stage. _Why:_ CI never builds the image (TF-2).
- **AC-5** — `configuration.md`, `commands.md` and `environments.md` describe the image's default;
  ADR-0050 is Accepted and in the registry; ADR-0036 has a forward note; the todo is closed with
  its Render wording corrected. _Why:_ the default of a security guard moved.

## Phase 0 — Kit and branch

- [x] `fix/docker-image-node-env` cut with `--no-track` from `dev` at `560f56f`
- [x] This kit: README, checklist, `decisions.md` with D-01..D-03

## Phase 1 — Prove, change, prove

- [x] `lakira-backend:before` built from the unchanged `Dockerfile`; AC-2 "before" recorded
- [x] `Dockerfile` — `ENV NODE_ENV=production` in the runtime stage
- [x] `__tests__/unit/dockerfile.test.ts` — proven to fail with the line removed, and with it in
      the build stage
- [x] New image built; AC-1, AC-2 "after" and AC-3 checked

## Phase 2 — Docs

- [x] `docs/reference/configuration.md` — the `NODE_ENV` row
- [x] `docs/reference/commands.md` — `docker:build`
- [x] `docs/reference/environments.md` — the image's default, and staging's explicit value
- [x] ADR-0050, its registry row, the next free number; a forward note on ADR-0036
- [x] The todo closed, with "Render sets `NODE_ENV` itself" corrected

## Discovered

- [x] Found while planning: the todo said "Render sets `NODE_ENV` itself". `environments.md` §5
      lists `NODE_ENV=production` among the Render staging service's configured variables, so it is
      a dashboard setting, not something Render chooses → in scope, wording corrected in the todo.

## Verification (2026-09-28, Docker, Node 24 image)

Same env file for both images: a dummy `JWT_SECRET` and database URLs, `REDIS_REQUIRED=false`,
`DISABLE_RATE_LIMITING=true`, and no `NODE_ENV`.

- **Before** (`dev` at `560f56f`): `NODE_ENV` undefined; validation passed as `development`; the app
  logged `DISABLE_RATE_LIMITING=true — skipping throttling`. No refusal.
- **After:** `NODE_ENV` is `production` by default and `staging` with `-e NODE_ENV=staging`;
  `docker inspect` shows it in the image metadata; the same container exits 1 with the
  `DISABLE_RATE_LIMITING` refusal and never logs "skipping throttling"; bcrypt hashes inside the
  image.
- The Dockerfile test fails on the untouched file (runtime check), and fails in both of its checks
  with the line moved to the build stage.
- Process note: the first "before" attempts passed variables through an unquoted zsh variable,
  which zsh does not word-split, so they never reached Docker. An env file fixed it.

## Gates

- [x] typecheck
- [x] lint
- [x] format
- [x] tests — unit 621/621, integration 202 passed, 5 skipped
- [x] build
- [x] `npm run docker:build`
- [x] OpenAPI — no change, exit 0
- [ ] security delta — skipped: no dependency changes
