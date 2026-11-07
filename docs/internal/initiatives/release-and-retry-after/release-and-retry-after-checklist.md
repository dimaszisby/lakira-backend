# Release and Retry-After — Checklist

## Acceptance criteria

A Lean kit has no plan, so the criteria are stated here.

- **AC-1** — In the committed spec, every 429 of every operation declares `Retry-After`, pointing at
  a required `RetryAfter` component.
  _Why:_ the audit's W7; the header was sent and not documented.
- **AC-2** — Every limiter's 429 carries a numeric `Retry-After`.
  _Why:_ the spec now says it is required, so the code must send it.
- **AC-3** — An empty `APP_RELEASE` resolves to `RENDER_GIT_COMMIT` or `"unknown"`, never `""`.
  _Why:_ `.env.example` shipped an empty one, and `/health` reported it.
- **AC-4** — `Dockerfile.dev` takes `APP_RELEASE` as a build argument after `npm install`, both
  Compose builds pass it, and neither service sets it at run time.
  _Why:_ lakira-frontend's F-61; the commit must travel with the image.
- **AC-5** — On the local stack, an image built with `APP_RELEASE=$(git rev-parse HEAD)` reports
  that commit; an `up` with another value and no `--build` still reports it; an image built without
  the variable reports `"unknown"`.
  _Why:_ the files can be right and the image wrong.
- **AC-6** — No status, body or route changes: the spec only gains entries, and the contract quick
  profile passes as before.
  _Why:_ D-02 documents; it does not change behaviour.

## Phase 0 — kit and branch

- [x] `fix/release-and-retry-after` cut with `--no-track` from `origin/dev` at `d3b254e`; HEAD and
      upstream verified
- [x] `README.md`, this file, `decisions.md` D-01 to D-03

## Phase 1 — tests first

- [x] `__tests__/unit/openapi-response-headers.test.ts` — every 429 declares `Retry-After`; the
      component is required, an integer of seconds; the seven-operation check now sets 429s aside
- [x] `__tests__/unit/shared/middleware/rate-limiter.envelope.test.ts` — `retry-after` on every
      limiter's 429 (passed before the change, confirming the header is sent)
- [x] `__tests__/unit/config/zodEnv.app-release.test.ts` — set, empty, empty with
      `RENDER_GIT_COMMIT`
- [x] `__tests__/unit/dockerfile-dev-release.test.ts` — `Dockerfile.dev`, both Compose services,
      `.env.example`
- [x] Run before the change: 54 failed, 39 passed

## Phase 2 — the change

- [x] `src/lib/openapi/openapi-config.ts` — `RetryAfter` component; `TooManyRequestsError` points at it
- [x] `src/lib/openapi/openapi-docs.ts` — `RETRY_AFTER_HEADER` on the five route-level 429s
- [x] `docs/reference/api/lakira-backend-openapi.json` — regenerated: 39 lines added, none removed
- [x] `src/config/zodEnv.ts` — an empty `APP_RELEASE` counts as unset
- [x] `Dockerfile.dev`, `docker-compose.yml` (`app`, `worker`), `.env.example`

## Phase 3 — docs

- [x] `docs/reference/configuration.md` — what `APP_RELEASE` means locally and how to set it
- [x] ADR-0039 — a dated note for D-01 and D-03
- [x] Register: B-27 to Closed; #189's loose ends

## Discovered

- [x] Found: B-27's `PORT` item was already fixed by #177 (`863c75b`), with a test at
      `zodEnv.connection-url.test.ts:192` → nothing to do; the Closed row says so
- [x] Found: `docs:openapi:check` diffs against the git index, so an intended spec change fails it
      before it is staged → drift checked instead by regenerating and comparing byte for byte

## Acceptance

- [x] AC-1 — `openapi-response-headers.test.ts` › "429 responses", one case per operation
- [x] AC-2 — `rate-limiter.envelope.test.ts`, every limiter factory
- [x] AC-3 — `zodEnv.app-release.test.ts`
- [x] AC-4 — `dockerfile-dev-release.test.ts`
- [x] AC-5 — built with the commit: `/health` said `d3b254e5c54924df706c86e84b5a929ca0ac3edd`;
      `APP_RELEASE=bogus docker compose up -d` with no build: unchanged; rebuilt without the
      variable: `unknown`
- [x] AC-6 — spec diff adds only; contract quick profile 36 passed, 6 skipped, the same two
      warnings

## Gates

- [x] typecheck
- [x] lint
- [x] format
- [x] tests — `test:coverage`: unit 1354 passed; integration 273 passed, 5 skipped; thresholds met
- [x] build
- [x] OpenAPI — validated (47 operations, 399 `$ref`s); a second generation is byte-identical
- [x] image smoke — passed
- [ ] security delta — skipped: no dependency changes
