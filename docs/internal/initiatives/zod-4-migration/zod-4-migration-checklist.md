# zod 4 migration — Checklist

Checked against `origin/dev` at `d1ff8da` (#219). Acceptance criteria: [the plan](zod-4-migration-plan.md).

## Phase 0 — branch and baselines

- [x] `fix/zod-4-migration` cut with `--no-track` from `origin/dev` at `d1ff8da`; HEAD and
      upstream verified
- [x] Corpus baseline on `dev`: 50 values, alone and under each of 68 keys read from the schema
      sources, as the body and inside `params`, `query` and `body`, through every exported schema
      of `zod-rules.ts`, `zod-request-params.schema.ts` and the seven `schema.zod.ts` files: 1,433,250
      cases, 105 schemas, 89 of them with a passing case
- [x] Env baseline: `buildEnv` over `.env.example` and `.env.test.example`, as given, empty, blank
      and junk, under each `NODE_ENV`: 32 cases, values hashed

## Phase 1 — the upgrade

- [x] `package.json`: `zod` `^4.6.7`, `@asteasolutions/zod-to-openapi` `^9.1.0` (D-02); the lockfile
      also moves `openapi3-ts` 4.5.0 to 4.6.2 and its `yaml` 2.8.3 to 2.9.1
- [x] `zod-error-formatter.ts`: `.errors` to `.issues`
- [x] `zod-rules.ts`: `required_error` to an `error` function that answers only a missing value
- [x] `openapi-schemas.ts`: `z.record(z.string(), z.any())`
- [x] `zodEnv.ts`: the 33 defaults a transform follows are `.prefault` (D-04)

## Phase 2 — behaviour

- [x] The cursor lists' `q` and `after`: `.optional()` on the union, so a missing key is allowed
      (D-09)
- [x] `zDisplayOptionsObject`; the settings update takes it, with no default (D-05)
- [x] Request UUIDs `.guid()` (D-08), `UuidSchema` and `SwitchOrgRequest` included

## Phase 3 — messages and reporting

- [x] `src/shared/utils/zod3-messages.ts`, passed at all seven parses: `validate`,
      `pickValidated`, `buildEnv` (D-03)
- [x] `formatZodIssues` and `describeZodIssues`: a union names its closest object option's fields;
      a type error is a field's only issue (D-06)
- [x] Two log-line tests expect `invalid_value` (D-07)

## Phase 4 — the spec

- [x] `format: "uuid"` restored in the six places of the spec `.guid()` dropped it from, by four source edits (D-08)
- [x] Eleven differences left, each recorded (D-10); no Notion record

## Discovered

- [x] Found: the security gate's two default rules match `.default("…")` in the source → in scope,
      Phase 1: they read `.prefault` too (D-04)
- [x] Found: `UuidSchema` in the OpenAPI schemas also parses `GET` parameters → in scope, Phase 2
      (D-08)
- [x] Found: the settings update spec claimed a `displayOptions` default zod 3 never applied →
      in scope, the spec now says so (D-10)

- [x] Found: CI failed the gate on GHSA-27r3-jxmh-p828 in `body-parser` 1.20.8, published
      2026-10-23 20:53 UTC → in scope, `package-lock.json` to 1.20.9 (D-11)
- [x] Found: one full integration run failed two analytics `GET` tests with `socket hang up` → out
      of scope, B-11's flake; sighting added to `2026-09-25-todo-integration-parse-error-flake.md`

## Acceptance

- [x] AC-1 — `npm audit --omit=dev`, with `body-parser` 1.20.9 (D-11): 2 moderate, the accepted
      `uuid` root;
      `security:delta:gate` passes, 0 high
- [x] AC-2 — the corpus run on the branch matches the baseline in every pass or fail, every
      parsed value and every field, except the settings union cases of D-06; unit and
      integration suites pass, with two log-code expectations changed (D-07)
- [x] AC-3 — every message in the corpus matches; `zod3-messages.test.ts`
- [x] AC-4 — `docs:openapi:generate` validates 49 operations and 50 schemas; the semantic diff
      is D-10's eleven lines
- [x] AC-5 — the env run matches the baseline except the raw message dump (D-03)
- [x] AC-6 — ADR-0083; `validation.md` and `environment.md` updated
- [x] AC-7 — see Gates

## Gates

Node 24.22.1.

- [x] typecheck — clean
- [x] lint — clean
- [x] format — `format:check` clean
- [x] tests — unit with coverage: 157 suites, 1654 tests; integration with coverage, against
      throwaway Postgres 18 and Redis 7: 43 suites (2 skipped), 316 tests (6 skipped);
      thresholds met
- [x] build — clean
- [x] OpenAPI — the generated spec is valid and regenerates byte for byte; `docs:openapi:check`
      passes once the spec is committed
- [x] security delta — passes: 0 critical, 0 high, 3 medium
- [x] image smoke — all seven checks pass
