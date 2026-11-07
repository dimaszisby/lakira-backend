# Todo — Factor XI: logs as an event stream on stdout (ADR-0041)

- **Status:** Complete — delivered by #65 (`47854e2`)
- **Created:** 2026-08-23
- **Completed:** 2026-08-23
- **Owner:** dimaszisby
- **Branch:** `fix/logs-to-stdout` (off `dev` @ `f5f28b9`)

Closes the twelve-factor audit's **only P0**. ADR-0041 moves from Proposed to Accepted, and
ADR-0038 (observability stack) is unblocked — Loki collects log streams, and until now there was no
stream.

---

## What was wrong

`src/utils/logger.ts:72` added the Console transport **only when `NODE_ENV !== "production"`**. The
two unconditional transports were files (`:65-68`) with no `maxsize`/`maxFiles`. So production wrote
`logs/error.log` and `logs/combined.log` to Render's ephemeral filesystem — discarded on every
restart, deploy, and instance replacement — and **emitted nothing to stdout**. An incident would
have been investigated with no application logs.

Staging was affected identically: Render runs it with `NODE_ENV=production`
(`docs/reference/environments.md:154`).

The log _content_ was already correct. This changed the sink, not the pipeline: `attachRequestId()`
(ADR-0027) and `redactSensitive()` (ADR-0028) keep their positions before `json()`.

## The deployment surface was thinner than expected

Worth recording, because it collapsed most of the anticipated work:

- **No Dockerfile change.** CI never builds either image — `grep -rn "docker" .github/workflows/`
  returns nothing. Both deploy jobs run `npm run build`, discard it, and `curl` a Render hook that
  rebuilds from source. The fix reaches production via that rebuild.
- **No Compose change.** All four services already configure the `json-file` driver with rotation,
  commented `# Configure logging to stdout` — infrastructure that was collecting an empty stream.
- **No PaaS config in the repo** — no `render.yaml`, `Procfile`, or `app.json`.
- **Nothing consumed the files.** No volume, bind mount, rotation, upload, or CI step. The single
  consumer in the whole repo was a doc line, `.claude/agents/debugger.md:47` (`cat logs/*.log`).
- **No existing test asserted on transports**, so none needed changing.

## Four defects found beyond the ADR's text

**1. Dev console colours never rendered — and I nearly shipped the bug twice.** `logFormat:51` called
`String(level).toUpperCase()` _after_ `colorize()` had rewritten `info.level` to
`\x1b[32minfo\x1b[39m`, uppercasing the escape terminator into `\x1b[32M` — not a valid SGR sequence
(`M` = Delete Line). ADR-0041 says "development experience is unchanged", which taken literally
preserves it.

My first fix, `String(level).replace(/[a-z]+/g, w => w.toUpperCase())`, **had the same bug** — `[a-z]+`
matches the `m` in `\x1b[32m`. Caught by actually looking at `cat -v` output rather than trusting the
change. The working version skips ANSI sequences explicitly:

```ts
const ANSI_OR_WORD = /\[\d+m|[a-z]+/g;
String(level).replace(ANSI_OR_WORD, (m) =>
  m.startsWith("") ? m : m.toUpperCase(),
);
```

**2. `logger.debug()` was unreachable everywhere.** `level: "info"` was hardcoded with no env
override, and no `LOG_LEVEL` existed in `zodEnv.ts`. Consequence: **`DB_LOGGING=true` was a no-op**,
since `db.ts:5-7` routes SQL through `logger.debug`. Same for `shared/cache/logging.ts` and two
routers.

**3. Access logs would have been invisible in production.** Caught by running it. Winston's npm
levels put `http` at 3 and `info` at 2, so with production defaulting to `info` the `http_request`
lines were **silently dropped** — shipping access logging that does not exist in production, which is
the exact class of bug this whole task exists to fix. Production now defaults to `LOG_LEVEL=http`.

**4. Fatal lines raced `process.exit`.** `server.ts` handled `uncaughtException` by calling the async
`logger.error(...)` then `shutdown()`, ending in `process.exit(0)` — **exit code 0 on a crash path**,
and `process.exit` does not flush pending stream writes. Registering the handler also suppresses
Node's own stderr crash printer. `worker.ts` was identical.

---

## What changed

### `src/utils/logger.ts`

Both `transports.File` deleted. One Console transport, unconditional, with `stderrLevels: []` and
`consoleWarnLevels: []` set explicitly so a future winston default cannot split the stream.

Format is the only environment-dependent part now — the inversion ADR-0041 describes. Development
keeps the colourised human format (bug fixed); everything else has **no transport-level format**, so
the chain's `json()` output in `info[Symbol.for("message")]` passes through. Re-applying
`format: json()` at the transport would serialize twice and lose it.

`nodeEnv` still reads raw `process.env` — `app-name.ts:1-3` documents that importing `envManager`
here is a circular init failure — but is now lowercased, since it selects behaviour and `zodEnv`
normalizes where this did not.

### `LOG_LEVEL`

New enum in `zodEnv.ts` defaulting to `http` in production and `debug` elsewhere, plus a production
refusal of `silly` alongside the ADR-0036 rules. `logger.ts` re-validates `process.env.LOG_LEVEL`
itself and falls back to the same default, because it cannot import the validated env.

### HTTP access logging — `src/shared/middleware/access-log.ts`

`morgan` writing through Winston rather than `pino-http`, so access lines share one JSON shape with
application logs and inherit correlation and redaction for free. Mounted in `server.ts` directly
after `requestIdMiddleware` so every line carries the request's `requestId`.

morgan's format function is used for its side effect and returns `null`, which tells morgan to write
nothing itself — the seam it offers for handing token values to another sink instead of stringifying
them.

**Query strings are dropped**; `path` is the URL up to `?`. `SENSITIVE_KEY_PATTERN` redaction covers
log metadata, not URL strings, so search terms, filters and cursors would otherwise enter the stream
unredacted. `/api/v1/health` and `/api/v1/ready` are skipped.

### Crash paths

`flushLogs()` in both `server.ts` and `worker.ts` awaits the logger's `finish` event before exiting,
bounded at 2s so a wedged stdout cannot hang shutdown. `shutdown()` takes an exit code; the two
crash handlers pass `1` instead of exiting `0`.

---

## Verification

```
lint / typecheck / format:check     0
docs:openapi:check                  0, no drift
test:unit                           539 passed, 87 suites
test:integration                    172 passed, 26 suites (ENABLE_REDIS_INTEGRATION=true)
test:contract:local                 5/5 collections, 60 assertions, 0 failures
security:delta:gate                 passed=true, blocking=0, 2 medium (unchanged)
npm audit                           9 moderate — unchanged by adding morgan
```

Behavioural checks against a running server mattered more than the suites here:

| Check                           | Result                                                                      |
| ------------------------------- | --------------------------------------------------------------------------- |
| Production emits JSON on stdout | `{"level":"info","message":…,"service":"lakira-backend",…}`                 |
| No files written                | `logs/*.log` mtimes unchanged after logging; no `transports.File` in `src/` |
| Dev colours render              | `cat -v` shows `^[[32m` … `^[[39m` — valid, was `^[[32M`                    |
| Access line correlates          | `requestId: "probe-123"` propagated from the request header                 |
| Query strings excluded          | `?q=secret-search&filter=topsecret` → `path: "/api/v1/metrics"`, 0 leaks    |
| Probes excluded                 | 0 access lines for `/api/v1/health` and `/api/v1/ready`                     |
| `LOG_LEVEL` works               | `debug` reaches `logger.debug`; `silly` refused in production               |
| Crash produces a line           | Full stack on stdout, **exit code 1**                                       |

New tests: 4 for the access-log middleware (built on a real Express app + supertest after a
hand-rolled `res` fake failed morgan's finish detection), and 2 for the `LOG_LEVEL` schema.

## Deliberately not done

- **`scripts/logger.js`** stays Console-only per ADR-0041 item 6 — already correct.
- **`src/config/envManager.ts:68-81`** keeps `console.error`; the comment at `:69` binds it to the
  bootstrap path. Already structured JSON on stderr, and it is the one line that worked in
  production before this change precisely because it bypasses Winston.
- **ADR-0038/0039/0040.** This unblocks 0038; it does not implement it. ADR-0040 notes the worker
  shared this defect — fixed for free via the shared logger.
- **Sentry in the crash handlers.** `error.ts:68` captures HTTP-path exceptions, but the
  `uncaughtException` handler does not call `captureException`. Real gap, separate concern.

## Follow-up

Delete the local `logs/` directory by hand — `combined.log` had reached 3.0 MB, largely because
`jest.setup.ts:12` emits through the real logger on every test run. `.gitignore:9` stays, since
developers will have stale copies.

`__tests__/unit/shared/middleware/validation.test.ts:13` is the one test that constructs the real
winston logger; it used to create `logs/` as a side effect of the unit suite and no longer does.
