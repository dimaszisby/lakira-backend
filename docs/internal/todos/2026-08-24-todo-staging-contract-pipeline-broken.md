# Todo — the staging contract pipeline cannot pass

- **Status:** Complete (2026-08-29) — delivered by #72 (`1deca15`); resolved by replacing the staging contract job with a fixture-free smoke suite, not by building seeding
- **Created:** 2026-08-24
- **Owner:** dimaszisby
- **Prepared for:** a planning session; this is a research handoff, not a plan

`contract_staging` fails before it issues a single HTTP request, and would have failed the same way
on the day it was written. This blocks the `dev → staging → main` promotion path.

It is a **pipeline design gap**, not a bug and not a data problem. Seeding staging would not fix it.

## How this surfaced

Staging went down (its Render Postgres was deleted) and came back on 2026-08-22 with an empty
database. The question asked was whether the contract collections would fail against empty data.
They would — but only as the third of three blockers, and the first two make it moot.

An earlier claim that "your next push to `dev` will go red" was **wrong**: `contract_staging` is
gated on `refs/heads/staging` and never runs on `dev`. The trigger was assumed, not read.

---

## Findings

### 1 — Only 1 of 12 required variables is supplied

`tests/contract/postman-newman/scripts/run-contract-staging.js:47-58` requires twelve environment
variables and **throws on the first missing one** (`:64-68`):

```
STAGING_BASE_URL                        ← the only one wired
STAGING_CONTRACT_TOKEN
STAGING_CONTRACT_USER_ID
STAGING_CONTRACT_SECONDARY_USER_ID
STAGING_CATEGORY_REVENUE_ID
STAGING_CATEGORY_PRODUCTIVITY_ID
STAGING_METRIC_REVENUE_ID
STAGING_METRIC_PRODUCTIVITY_ID
STAGING_METRIC_SETTINGS_REVENUE_ID
STAGING_METRIC_SETTINGS_PRODUCTIVITY_ID
STAGING_METRIC_LOG_REVENUE_LATEST_ID
STAGING_METRIC_LOG_PRODUCTIVITY_LATEST_ID
```

`backend-ci.yml:430-434` passes **only `STAGING_BASE_URL`**. The job dies with
`Missing required environment variable "STAGING_CONTRACT_TOKEN"` before any request is made — so
the state of the database is never reached.

### 2 — A stored token cannot work, by design

`ACCESS_TOKEN_TTL_SEC=900`. Even if `STAGING_CONTRACT_TOKEN` were populated as a CI secret, it
expires fifteen minutes after it is minted.

A static secret is structurally incompatible with a 15-minute TTL. The runner has to **mint** a
token at run time. Populating the eleven missing secrets would not fix this one.

### 3 — Nothing seeds staging, and the seed script cannot target it

- `deploy_staging` (`backend-ci.yml:368-406`) runs `npm run migrate:staging:ci` and stops. No seed
  step.
- There is no seed step anywhere in the workflow. The only `seed` match in `backend-ci.yml` is
  `:323`, inside `contract_local`, reading `tmp/contract-seed.json`.
- `seed:contract-tests` is `dotenv -e .env.test -- tsx ./scripts/seed-contract-tests.ts` — bound to
  the **test** environment. It cannot point at staging without changes.

So the ten fixture UUIDs have no producer. They would have to be hand-copied from whatever rows
happened to exist, and re-copied whenever the database is rebuilt — which is exactly what just
happened.

### 4 — `contract_local` already solves this, and is the model to copy

`run-contract-local.js` is self-sufficient:

| Step                                                     | Where           |
| -------------------------------------------------------- | --------------- |
| Runs `npm run seed:contract-tests` itself                | `:74-75`        |
| Reads fixture IDs back from `tmp/contract-seed.json`     | `:47`, `:88-89` |
| Mints/reads the auth token from that seed output         | `:84-104`       |
| Honours `SKIP_CONTRACT_SEED=true` to reuse existing data | `:68-72`        |
| Honours `CONTRACT_AUTH_TOKEN` as an override             | `:84-85`        |

Nothing is hand-copied and no secret holds a UUID. The staging path needs the same shape.

---

## What a fix has to decide

Not a task list — these are the open questions.

- **Is seeding a shared staging database on every push acceptable?** This is the crux. Local
  seeding is free; staging is shared and may hold data someone is looking at. Options: seed once
  and pin (returns to the stale-fixture problem), seed per run into a namespaced tenant, or run
  contract tests against an ephemeral database instead of staging.
- **Make `seed-contract-tests.ts` environment-agnostic**, or add a staging variant. Currently
  `.env.test`-bound.
- **Mint the token at run time** rather than storing it. Whatever is decided, the 15-minute TTL
  makes a stored token a dead end.
- **Does `deploy_production`'s pre-deploy gate need the same treatment?**
  `backend-ci.yml:441+` re-runs the staging suite as its health check on `refs/heads/main`, so it
  inherits every one of these blockers.
- **Is a staging contract run worth having at all**, given `contract_local` already exercises the
  same collections against a seeded database? The staging run's distinct value is proving a
  _deployed_ environment works — which may be better served by a small smoke suite than by the full
  contract collections.

## Interaction with retiring newman

`docs/internal/todos/2026-08-23-todo-newman-vulnerability-chain.md` proposes retiring newman, having
found **~68% (17/25) of the semantic assertions already duplicated** in the Jest integration suite.

These two decisions should be taken together. Building a staging seeding pipeline for collections
that are being retired would be wasted work. If newman goes, this problem shrinks to "what smoke
test proves a staging deploy is healthy" — a much smaller question.

**Recommend deciding newman's future first.**

## Blast radius today

- `dev` is **unaffected** — neither job triggers there.
- `staging` pushes fail at `contract_staging`.
- `main` pushes fail at `deploy_production`'s health gate, which re-runs the same suite.
- No production deploy can complete through CI while this stands.

## Reproducing

```bash
sed -n '407,440p' .github/workflows/backend-ci.yml     # contract_staging: 1 of 12 vars
sed -n '47,68p'  tests/contract/postman-newman/scripts/run-contract-staging.js
grep -n "seed" .github/workflows/backend-ci.yml        # only :323, inside contract_local
grep -n "ACCESS_TOKEN_TTL_SEC" .env.example            # 900
```

---

## Resolution (2026-08-29)

Fixed by **removing the requirement**, not satisfying it. `tests/smoke/run-smoke.mjs` replaces the
staging contract run in both places that used it: the renamed `smoke_staging` job and
`deploy_production`'s pre-deploy gate. It needs only a base URL, so all three blockers in the
findings above stop applying rather than being worked around — no twelve variables, no stored token
fighting a 900s TTL, no seeding of a shared database.

This followed this document's own recommendation to decide newman's future first. Newman retirement
is agreed as the next piece of work; building seeding for collections about to be retired would have
been wasted.

**Also fixed:** `deploy_staging` fires the Render hook and returns immediately, so the next job could
start mid-rollout. The smoke suite polls until reachable before asserting, which is what
`STAGING_HEALTH_URL` — declared in that job's `env` and never used — was presumably meant for.

**Deliberately still open:**

- `run-contract-staging.js`, the `test:contract:staging` npm script, and the staging Postman
  environment are now **uninvoked but present**. They are deleted by the newman retirement, together
  with the collections; removing them here would leave a half-deleted feature across two PRs.
- The suite proves staging is _healthy_, not that the _new deploy_ is live — see the todo for this
  change for why, and what ADR-0039 would add.
- `deploy_production` still has no post-deploy verification of production itself, though
  `PRODUCTION_HEALTH_URL` exists as a secret.
