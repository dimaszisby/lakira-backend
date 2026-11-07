# Inner layers reach infrastructure — Checklist

Checked against `origin/dev` at `230aada` (#200).

## Phase 0 — kit and branch

- [x] `fix/inner-layers-reach-infrastructure` cut with `--no-track` from `origin/dev` at `230aada`;
      HEAD and upstream verified
- [x] This kit: README, plan, this file, `decisions.md` with D-01 to D-03
- [x] Register D-08: the bundle as an exception to D-02

## Phase 1 — tests first, each seen to fail

- [x] `__tests__/unit/feature-boundaries.lint.test.ts`: a new describe, "relative paths, public.ts
      and the last unread forms (ADR-0078)", nine tests for AC-1 to AC-6 and AC-8; `.mts`, `.cts`
      and `.jsx` added to "holds … to the domain's rules" (AC-7); the domain-list test takes
      `contract.js` and refuses `public.js`. On the unchanged config 13 tests failed
- [x] `__tests__/unit/architecture.test.ts`: "the source-file reader" (AC-7) failed: it read `a.ts`
      alone of eight extensions

## Phase 2 — the rules

- [x] `eslint.config.mjs`: local rule `boundaries/relative-imports-on-the-list` (D-01) in the four
      inner blocks and on `contract.ts`
- [x] `eslint.config.mjs`: allowlist `public` entry becomes `contract` (D-02); `@/constants/`
      narrowed to `zod-messages.js`
- [x] `eslint.config.mjs`: `no-eval`, `no-implied-eval`, `.Function` and `module.require`
      selectors (D-03); `EXT` and the base block take `mts`, `cts`, `jsx`; `CANONICAL_PATH` covers
      `@utils/` and `@config/`
- [x] `src/features/public/metric-category/contract.ts`; `metric.domain.ts` imports it;
      metric-category's `public.ts` drops `type MetricCategory`
- [x] `architecture.test.ts`: `contract` accepted as a cross-feature relative target; the reader
      renamed `getAllSourceFiles`

## Phase 3 — gates, review, docs

- [x] Each new rule seen to reject a deliberate violation written into real files (typed lint, not
      stdin): a relative `config/db.js` and `authMiddleware` from auth's `public.ts` in
      `MetricLog.ts`, `zod-rules.js`, `eval`, `globalThis.Function`, an adapter re-exported from
      `contract.ts`, and `@utils/../features/...` in an infrastructure file. 8 errors; files restored
- [x] Review of the diff: no defect found. One gap probed: `import x = require()` and a `.cjs`
      `require` in an inner layer are read by neither import rule; `no-require-imports` already
      refuses both, and the X43 test now proves it
- [x] ADR-0078; ADR-0074 Status note; ADR README row and next number; CLAUDE.md count 78
- [x] `.claude/rules/architecture.md` § Dependency Rules and § Export Convention
- [x] Register: B-80 to Closed; B-83 and B-73 lose X42 to X45; "As of" `230aada`; todo closed
- [x] #200's loose ends: `auth-infrastructure-errors-are-5xx` D-01 Accepted, README Done; B-77 and
      its todo name `#200 (230aada)`; Notion record moved to Completed (verified by re-fetch)
- [ ] B-54 recheck: not done. The queue suite could not complete `connect` against a throwaway
      RabbitMQ 3.13 (the broker accepted and authenticated the connection; the client timed out).
      B-54 says so

## Discovered

- [x] Found: `.env.test`'s `TEST_DATABASE_URL` wins over `DB_HOST`/`DB_PORT`, so the first
      `db:migrate:test` reached the Compose stack's test database (it ran nothing: "already up to
      date") → the gate run pins `TEST_DATABASE_URL`, `DATABASE_URL` and `REDIS_URL` to throwaway
      containers. Not filed: an environment habit, not a defect
- [x] Found: metric-category's `public.ts` exported `type MetricCategory`, which nothing took once
      the domain moved to `contract.ts` → in scope, removed (D-02)

## Acceptance

- [x] AC-1 — › judges a domain file's relative path by where it lands; › judges an application
      file's relative path by where it lands
- [x] AC-2 — the same two tests' allowed cases; › reads export-from as well as import
- [x] AC-3 — › holds the shared kernel and src/types/domain to the same rule
- [x] AC-4 — › keeps another feature's public.ts out of the inner layers, and lets its contract.ts
      in; › lets a contract.ts re-export its own domain and nothing else
- [x] AC-5 — › allows one file of src/constants, not the directory
- [x] AC-6 — › rejects eval, a Function reached as a property, and module.require under src
- [x] AC-7 — › holds …Probe.mts / .cts / .jsx to the domain's rules; › reads every extension
      ESLint lints under src, and no declaration file
- [x] AC-8 — › rejects @utils and @config paths that are not canonical, anywhere under src
- [x] AC-9 — `npm run lint` clean

## Gates

Node 24.22.0 (official tarball, SHA256 checked against nodejs.org's SHASUMS256.txt); throwaway
`postgres:18` and `redis:7-alpine` on loopback ports 55432 and 56379.

- [x] typecheck — clean
- [x] lint — clean
- [x] format — `prettier --check` on every touched file: clean
- [x] tests — `test:unit:coverage` 147 suites, 1498 tests passed, thresholds met;
      `test:integration:coverage` 40 suites passed (2 skipped), 286 tests passed (5 skipped),
      thresholds met
- [x] build — clean
- [x] OpenAPI — `docs:openapi:check` clean (no route or schema change; run anyway)
- [ ] security delta — skipped: no dependency added, upgraded or removed
- [ ] image smoke — skipped: no `Dockerfile`, `.dockerignore` or dependency change
