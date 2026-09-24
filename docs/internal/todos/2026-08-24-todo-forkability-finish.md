# Todo — forkability finish (C1 remainder, N5, TF-6)

- **Status:** Complete — delivered by #67 (`8adf7b8`)
- **Created:** 2026-08-24
- **Completed:** 2026-08-24
- **Owner:** dimaszisby
- **Branch:** `chore/forkability-finish` (off `dev` @ `b6d12bd`)

Three small tracked items that finish threads left open by the last four PRs. Closes **C1** fully,
**N5**, and **TF-6**.

---

## C1 remainder — `npm test` could not work on a fresh clone

The previous PR closed half of `SAAS-BASE-CHECKLIST.md:77`: `bootstrap-fork.sh` now creates `.env`
and its `JWT_SECRET` rotation actually runs. The other half was untouched — the script's own closing
output printed _"4. Run: npm test"_, and `npm test` reads `.env.test`, which is gitignored, absent on
a fresh clone, and was **documented nowhere**. A grep across `README.md`, `docs/tutorials/` and
`docs/how-to/testing/` returned nothing. A forker followed the script's instruction and it failed.

- `bootstrap-fork.sh` now creates `.env.test` from `.env.test.example`, mirroring the `.env` block.
- Its closing instructions were stale in a second way — step 2 said "Copy .env.example to .env",
  which the script already does. Rewritten to describe what it actually does, and to say so
  explicitly rather than implying manual work.
- `.env.test` is now documented in the getting-started Configure step and in a new _Before you run
  anything_ section in `docs/how-to/testing/run-the-test-suites.md`.

## N5 — two dummy routes missing from the spec

`/metrics/dummy` and `/metric-categories/dummy` are mounted (both behind `ENABLE_DUMMY_ENDPOINTS`)
but absent from the OpenAPI spec, which is drift-gated in CI and therefore the contract of record.

Sharper than the audit stated: the third sibling, `/metric-logs/{metricId}/dummy`, **was** already
documented — so this was an inconsistency between three sibling routes, not a blanket omission.

Both new operations return **201** with the created array, unlike the metric-logs sibling's **202**,
because that one enqueues to the worker while these insert synchronously.

### All three now share a `Dummy Data` tag

`tests/contract/schemathesis/scripts/run-local.js:35-37` selects operations by tag, and
`DEFAULT_TAGS` includes `Metrics` and `Metric Categories`. Both new bodies accept `count` up to
**1000**, and these endpoints write to the same database the newman contract assertions verify
against seeded fixtures. Under the default `quick` profile only the documented example is sent, but
`gate` and `full` add the `fuzzing` phase and could send `count: 1000` repeatedly.

Tagging them `Dummy Data` — outside `DEFAULT_TAGS` — documents them without handing them to a
fuzzer. This follows the `/api/v1/admin/_ping` precedent from commit `638d75b`, which was documented
under an `Admin` tag "deliberately outside the Schemathesis tag set". The existing metric-logs route
moved to the same tag, which makes the three siblings consistent and is the one externally visible
change to the published spec.

**Measured effect: 38 selected / 44 total → 37 selected / 46 total.** Two operations documented, one
data generator taken _out_ of fuzzing.

> The plan predicted the selected count would "stay at 38". That was internally inconsistent —
> moving the metric-logs generator off a fuzzed tag necessarily drops it by one, which is the whole
> point of the change. 37 is the correct expectation; the plan's number was wrong, not the outcome.

## TF-6 — `SKIP_DB_LIFECYCLE` bypassed the schema

`server.ts:75` read `process.env.SKIP_DB_LIFECYCLE` directly, so the flag was undocumented, untyped,
and invisible to the fail-fast contract. Now a schema entry beside `ALLOW_TEST_HTTP_SERVER`, read via
`env.SKIP_DB_LIFECYCLE`, documented in `.env.example` and `configuration.md`, and **refused when
`NODE_ENV=production`** — which is where `audit-2026-08-17.md:177-178` asked for it, on ADR-0036's
refused-in-production table.

`jest.setup.ts:14` and `env-test-utils.ts:21-22` still read `process.env` directly, deliberately:
both run at test-bootstrap time, and `env-test-utils` _sets_ the value before calling
`loadEnvOrExit()`. Routing them through the validated env would invert that ordering for no benefit.

### The trap, and why it was worth predicting

`withTestEnv` forces `SKIP_DB_LIFECYCLE=true` by default, and every case in
`zodEnv.production-guard.test.ts` drives `NODE_ENV=production`. Adding the refusal made those tests
throw for the wrong reason.

Only **one** test failed outright — the one asserting `.resolves`. The other nine still passed,
because they assert `.rejects` and `refusalFor()` matches on the issue _path_ with
`arrayContaining`, which tolerates the extra `SKIP_DB_LIFECYCLE` issue. That is the more dangerous
outcome: nine green tests exercising a dirty environment. Fixed by passing `skipDbLifecycle: false`
in that suite, which only parses env and never boots a server. Two new cases cover the rule directly.

---

## Verification

```
lint / typecheck / format:check     0
docs:openapi:check                  0, no drift after regeneration
test:unit                           533 passed, 86 suites
test:integration                    172 passed, 26 suites
security:delta:gate                 passed=true, blocking=0, 2 medium
```

| Check                             | Result                                                                        |
| --------------------------------- | ----------------------------------------------------------------------------- |
| OpenAPI operations                | 44 → **46**                                                                   |
| All three dummy paths present     | `/metrics/dummy`, `/metric-categories/dummy`, `/metric-logs/{metricId}/dummy` |
| Their tags                        | `Dummy Data` on all three                                                     |
| Schemathesis selection            | **37 / 46**, down from 38 / 44 — one fewer generator fuzzed                   |
| Schemathesis run                  | 31 generated, **31 passed**                                                   |
| newman contract suite             | 5/5 collections, **60 assertions, 0 failures**                                |
| `SKIP_DB_LIFECYCLE` in production | refused at startup, named in the `[ENV_ERROR]` issue path                     |
| `SKIP_DB_LIFECYCLE` in test       | still legal — `jest.setup.ts` depends on it                                   |

## Not done

- The `ENABLE_DUMMY_ENDPOINTS` gate itself, and whether dummy endpoints belong in a production build.
- Whether `count: 1000` is a sensible upper bound for a data generator.
- The end-to-end fork rehearsal (`bootstrap-fork.sh --name demo-app` in a scratch clone) was **not**
  run — it rewrites branding across 13 files and is destructive to a working tree. The two things it
  now does differently are small and were verified by reading: the `.env.test` copy mirrors the
  already-working `.env` block, and the closing text is `echo` output.
