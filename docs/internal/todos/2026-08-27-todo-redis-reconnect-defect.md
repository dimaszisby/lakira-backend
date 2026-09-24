# Todo — Redis reconnect defect

- **Status:** Complete — delivered by #69 (`8b3e9b2`)
- **Created:** 2026-08-27
- **Completed:** 2026-08-27
- **Owner:** dimaszisby
- **Branch:** `fix/redis-reconnect-defect` (off `dev` @ `b5b16fd`)

Now tracked as **TF-17** in the twelve-factor audit. It was previously recorded only in user memory
and appeared in no audit tracker, so the programme meant to catch it could not see it.

---

## What was wrong

`src/utils/redis-client.ts` configured a reconnect strategy that could never execute. The `error`
handler called `process.exit(1)` on the **first** error event when `REDIS_REQUIRED`, and node-redis
v4 emits `error` on every failed attempt — including the first. So `reconnectStrategy`, which backed
off up to 2s and would have retried indefinitely, was dead code. A Redis restart, a network blip, or
a cold start where Redis wasn't up yet killed the process.

### The chain it caused

Because the app died whenever Redis wasn't instantly available, staging set `REDIS_REQUIRED=false`
as a workaround — recorded in memory as _"a workaround, not a preference"_.

That had a second, non-obvious consequence: `rate-limiter.ts:24` selects the in-memory store only
when `!env.REDIS_REQUIRED`, so the workaround silently downgraded rate limiting from a shared Redis
store to a **per-instance** one. That is finding **TF-12**, and it existed _because of_ this defect.

Worse: `maybeCreateStore()` is called at all eight eager limiter singletons, i.e. at import time,
when `redisClient.isOpen` is still `false` because `connectRedis()` is async and never awaited. So
with `REDIS_REQUIRED=false` the in-memory store was chosen **permanently**, even once Redis
connected. TF-12 is now cross-linked to this finding.

### Three further problems in the same file

- **Two racing exit paths** — the `error` handler and `connectRedis`'s catch both exited on an
  initial failure.
- **Neither flushed logs.** ADR-0041 added `flushLogs()` to `server.ts` and `worker.ts` so a fatal
  line reaches stdout before exit; this module bypassed it, so the line explaining _why_ Redis killed
  the process could be lost — the same bug class, in a file that change did not touch.
- **Startup and runtime were not distinguished**, so routine Redis maintenance killed a healthy app.

## What changed

**Bounded the retry budget and made it reachable.** node-redis v4's `reconnectStrategy` may return a
delay _or_ an `Error`, and returning an `Error` stops retrying — the documented mechanism, and what
makes a budget possible at all. 35 attempts ≈ **29.8s**.

**One exit path, gated on the budget being spent.** The `error` handler logs but no longer exits on
its own; it exits only when the strategy has given up _and_ `REDIS_REQUIRED` _and_ not in test. The
duplicate exit in `connectRedis`'s catch is gone. A successful `connect` resets the flag, so a later
outage gets a fresh budget.

**`flushLogs` extracted to `src/utils/logger.ts`.** It was duplicated verbatim in `server.ts` and
`worker.ts`; rather than add a third copy, all three now import it. That removes duplication
introduced earlier and gives the Redis exit the same guarantee.

### Why exit at all, rather than degrade

`/api/v1/health` — the URL CI and Render actually probe — returns `{status:"ok"}` unconditionally
and never checks Redis. Only `/ready` does, and nothing probes it. Without an exit, a Redis-less
instance would keep taking traffic with no signal anywhere. Exiting after the budget is the only
signal the current probing setup understands.

Making `/health` Redis-aware, or repointing Render at `/ready`, is the better long-term answer and
is listed below.

## Verification

Unit tests mock the client, so the behavioural runs are the real evidence. Against the live Compose
stack with `REDIS_REQUIRED=true`:

| Scenario                     | Result                                                                                       |
| ---------------------------- | -------------------------------------------------------------------------------------------- |
| Brief outage (5s), run twice | **Survived and reconnected** — identical container start time, `Reconnecting…` → `Connected` |
| `/ready` during outage       | **503**                                                                                      |
| `/health` during outage      | **200** — unchanged, and exactly why we exit rather than idle                                |
| Sustained outage (>30s)      | **Exited 1**, with `[REDIS] Giving up: …` on stdout _before_ the exit                        |
| After the exit               | `wget` inside the container → connection refused, confirming the process was gone            |

```
lint / typecheck / format:check   0
test:unit                         540 passed, 86 suites
```

Seven new unit tests cover the strategy boundary, the transient-error case (the whole point), exit
with and without `REDIS_REQUIRED`, the test-env guard, and the budget reset on reconnect. The
existing suite had none of this — it pinned `REDIS_REQUIRED: false`, so the exit path was never
exercised.

> **A correction worth recording.** The plan claimed 20 retries ≈ 30s, reasoning "the first eight
> retries sum to ~8s, then 2s each". That arithmetic was wrong twice over: the delay is
> `min(50r, 2000)`, so the 2000ms cap is not reached until attempt **40**, and 20 attempts is only
> `50 × 20×19/2` = **9.5s**. A unit test asserting the cap caught it. The correct figure for ~30s is
> **35** attempts (29.8s), which is what shipped.

## Follow-up outside the repo

**Set `REDIS_REQUIRED=true` on the Render staging service.** That retires the workaround recorded in
memory and restores the shared rate-limit store. No PR can make this change — it is a dashboard
setting. Until it happens, staging keeps per-instance rate limiting.

## Not done

- **`connectRedis()` is an unawaited import-time side effect** and is never exported, so `server.ts`
  cannot sequence startup around it. A real design smell; changing it alters startup ordering.
- **TF-12 proper.** Restoring `REDIS_REQUIRED=true` makes the store correct by skipping the fallback
  branch, but "decide the store once, at import, before Redis can be open" is still wrong.
- **Making `/health` Redis-aware or repointing Render at `/ready`.** Needs a dashboard change, and
  would turn a Redis blip into a failed CI deploy gate — worth its own decision.
