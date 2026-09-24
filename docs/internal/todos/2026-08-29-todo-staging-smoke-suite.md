# Todo — staging smoke suite

- **Status:** Complete — delivered by #72 (`1deca15`)
- **Created:** 2026-08-29
- **Completed:** 2026-08-29
- **Owner:** dimaszisby
- **Branch:** `fix/staging-smoke-suite`

Unblocks the `dev → staging → main` promotion path. Closes
`2026-08-24-todo-staging-contract-pipeline-broken.md`.

---

## What was wrong

`contract_staging` failed before issuing a single HTTP request, and always had. `main` inherited it,
because `deploy_production`'s health gate re-ran the same suite — so no production deploy could
complete through CI. `dev` was unaffected; neither job triggers there.

Three independent blockers, all re-verified before starting:

- **12 environment variables required, 1 supplied.** `run-contract-staging.js:47-58` throws on the
  first missing one; CI passed only `STAGING_BASE_URL`.
- **A stored token cannot work.** `ACCESS_TOKEN_TTL_SEC=900` — any `STAGING_CONTRACT_TOKEN` secret
  expires fifteen minutes after minting. Structural, not a misconfiguration.
- **Nothing seeds staging.** `seed:contract-tests` is bound to `.env.test`; `deploy_staging` runs
  migrations and stops. The ten fixture UUIDs had no producer.

## The approach: remove the requirement rather than satisfy it

`tests/smoke/run-smoke.mjs` needs **only a base URL**. No seeding, no token, no fixture UUIDs — so
all three blockers stop applying instead of being worked around.

| Check                                   | What it proves                                             |
| --------------------------------------- | ---------------------------------------------------------- |
| `GET /ready` → 200, all checks `ok`     | Postgres **and** Redis reachable from the deployed process |
| `GET /health` → 200 with an environment | The process serves and knows where it is                   |
| `GET /metrics` unauthenticated → 401    | The auth middleware is actually mounted                    |

Zero new dependencies; plain node with global `fetch`, matching the existing runner scripts.

This followed the handoff doc's own recommendation to **decide newman's future first**. Newman
retirement is agreed as the next piece of work; building a seeding pipeline for collections about to
be retired would have been wasted effort.

### A second bug fixed on the way

`deploy_staging` fires `curl -X POST "$RENDER_STAGING_DEPLOY_HOOK_URL"` and the step ends — it never
waits. The next job therefore started while Render was still rolling out. `STAGING_HEALTH_URL` was
declared in that job's `env` and **never used**, which looks like a wait step that was intended and
never written. The smoke suite now polls until reachable (bounded, backing off) before asserting.

### What this does NOT prove — stated in the script header and the workflow comment

It proves staging is **healthy**, not that the **new deploy is live**. Render deploys with zero
downtime and the app exposes no build identity, so polling cannot distinguish a new release from the
old one still serving. **ADR-0039** (release identity) is what closes that gap; once a release SHA is
exposed the suite should assert it matches the commit being promoted.

Overclaiming here would repeat the `docs:openapi:check` mistake — a green gate proving less than it
appears to. The production gate's comment now says this explicitly.

## A real finding the smoke suite surfaced immediately

With Redis stopped and `REDIS_REQUIRED=true`, `GET /metrics` did not return 401 — it **hung until the
10s request timeout**. The rate limiter's `RedisStore` blocks on a dead Redis, so during an outage
rate-limited routes become unresponsive rather than merely uncached. That is more severe than
"degraded", and it is bounded only by the ~30s Redis retry budget after which the process exits and
restarts.

Not fixed here — it belongs with **TF-12** (the rate limiter's Redis coupling). Worth recording that
the smoke suite earned its place on its first real run.

## Verification

| Step                          | Result                                                           |
| ----------------------------- | ---------------------------------------------------------------- |
| Local stack, healthy          | **3/3 pass**, exit 0                                             |
| Redis stopped                 | **Fails**, exit **1**, naming `{"db":"ok","redis":"fail"}`       |
| Redis restored                | **3/3 pass** again                                               |
| Dead port, 8s bound           | Times out at **exactly 8s** with `Target never became reachable` |
| Bare origin vs `/api/v1` base | Both normalise correctly                                         |

The Redis-down case is the one that matters: a smoke test that passed while a backing service was
down would be worse than none, because it would hand the promotion path a green light it had not
earned.

```
lint / typecheck / format:check   0
docs:openapi:check                clean
test:unit / test:integration      green
```

`staging` and `main` have **no branch protection**, so renaming `contract_staging` → `smoke_staging`
breaks no required check. Verified via the GitHub API rather than assumed.

## Left deliberately undone

- `run-contract-staging.js`, the `test:contract:staging` script, and the staging Postman environment
  are **uninvoked but still present**. The newman retirement deletes them along with the collections;
  splitting that across two PRs would leave a half-deleted feature.
- **Production has no post-deploy verification.** `deploy_production` deploys and stops, and
  `PRODUCTION_HEALTH_URL` exists as a secret. Running the same smoke suite against production after
  deploy is the obvious follow-up — a separate gap from the one that was blocking the pipeline.
