# Proxy trust and xss-clean — Checklist

Lean kit: the acceptance criteria are stated here. Checked against `origin/dev` at `53f6bce` (#205).

## Acceptance criteria

- **AC-1** — In production mode with `trust proxy` 0, a request to a route below the gate that
  carries `x-forwarded-proto: https` gets 403. _Why:_ X12.
- **AC-2** — With `trust proxy` 1 the same request passes, and a probe still passes over plain
  HTTP. _Why:_ Render runs one hop behind a proxy.
- **AC-3** — A body value and a query value holding `<script>` reach the route as sent. _Why:_
  X14.
- **AC-4** — `xss-clean` is in neither `package.json` nor `package-lock.json`, and
  `src/types/xss-clean.d.ts` is gone. _Why:_ X14.
- **AC-5** — `docker compose config` publishes the app on `127.0.0.1` by default and on `0.0.0.0`
  with `APP_BIND_ADDRESS=0.0.0.0`. _Why:_ X12, second half.

## Phase 0 — kit and branch

- [x] `fix/proxy-trust-and-xss-clean` cut with `--no-track` from `origin/dev` at `53f6bce`; HEAD
      and upstream verified
- [x] This kit: README, this file, `decisions.md` with D-01 to D-03

## Phase 1 — tests first, each seen to fail

- [x] `http-pipeline.test.ts`: `build()` takes `trustProxy`; production, trust proxy 0, a
      forwarded `https` to `/echo` gets 403. On the old code it got 200 (AC-1)
- [x] The test "lets a request through that a proxy marks as HTTPS" asked `/probe`, which is
      mounted above the gate, so it proved nothing. It asks `/echo` with trust proxy 1 (AC-2)
- [x] The body-and-query test expects `<script>` as sent, in the body and `<` in the query. On
      the old code the body came back as `&lt;script>` (AC-3)

## Phase 2 — the fix

- [x] `http-pipeline.ts`: the gate tests `req.secure` only (D-01); `xss-clean` gone (D-02)
- [x] `npm uninstall xss-clean`, which takes `xss-filters` with it; `src/types/xss-clean.d.ts`
      deleted (AC-4)
- [x] `architecture.test.ts`: `xss-clean` out of the list of imports held to the pipeline
- [x] `docker-compose.yml`: the app port binds `${APP_BIND_ADDRESS:-127.0.0.1}` (D-03, AC-5). A
      hook protects the file, so the change is written to
      `.git/docker-compose.yml-fix-proxy-trust-and-xss-clean` and handed over as a `cp`

## Phase 3 — gates, review, docs

- [x] Review of the diff: no defect. `xss-clean`'s JSON round trip and `trim()` changed only a
      scalar body, which `requireJsonObjectBody` refuses before a route sees it. Nothing in
      `scripts`, `.github` or the Dockerfile names it
- [x] D-02 promoted to ADR-0082; ADR-0061 Status note; registry row 0082; CLAUDE.md ADR count
- [x] `.claude/rules/security.md` § Global Middleware Stack
- [x] `c4-containers.md` (the diagram also had the old order; it follows `mountHttpPipeline`
      now), `product-requirements.md`, the three agent files: `xss-clean` out
- [x] `docs/reference/environments.md` § 3: `APP_BIND_ADDRESS`
- [x] Register: B-81 names this branch for X12 and X14, B-63's `x-forwarded-proto` part closed;
      "As of" `53f6bce`
- [x] #205's loose ends: `log-and-ci-leaks` D-01 to D-03 Accepted, README Done, AC-4 ticked; B-81
      names `#205 (53f6bce)` for X3, X5, X6
- [x] Notion Part 2: not written. The frontend reaches the API on `localhost:8001`, has no
      `&lt;` handling and renders no raw HTML (origin/dev `c1821df`), so it has nothing to do

## Discovered

- [x] Found: register row B-63 also named X12's `x-forwarded-proto` → in scope, that part closed
- [x] Found: `security:delta:check` rule `CFG-CORS-001` reads `src/server.ts`, which no longer
      holds the CORS options, and reports a false medium → out of scope, filed as
      `docs/internal/todos/2026-10-22-todo-cors-delta-check-reads-server-ts.md`, row B-86
- [x] Found: a `Parse Error` in the unit project (`cache.test.ts`), once, then three clean runs
      of the file and a clean full run → B-11, logged in its todo

## Acceptance

- [x] AC-1 — `http-pipeline.test.ts` › refuses a request that marks itself as HTTPS when no proxy
      is trusted
- [x] AC-2 — › lets a request through that a trusted proxy marks as HTTPS; › still answers a probe
      over plain HTTP; image smoke check 5 (production, behind no proxy, plain HTTP refused)
- [x] AC-3 — › still hands a route its parsed body, cookies and query
- [x] AC-4 — `grep -c xss package.json package-lock.json` gives 0 and 0
- [x] AC-5 — `docker compose config` on the staged file: `host_ip: 127.0.0.1` by default,
      `0.0.0.0` with `APP_BIND_ADDRESS=0.0.0.0`

## Gates

- [x] typecheck — clean
- [x] lint — clean
- [x] format — `prettier --check` on every touched file and the staged compose file: clean
- [x] tests — `test:unit:coverage` 149 suites, 1526 tests passed, thresholds met (the first run
      had one B-11 `Parse Error`; see Discovered); `test:integration:coverage` 43 suites passed
      (2 skipped), 299 tests passed (6 skipped), thresholds met
- [x] build — clean
- [x] OpenAPI — `docs:openapi:check` clean
- [x] security delta — `security:delta:gate` passed; 0 critical, 0 high, 3 medium, none from this
      change (`sequelize`, `uuid`, and the false CORS finding of B-86)
- [x] image smoke — `docker:smoke`, all seven checks passed
