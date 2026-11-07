# ADR-0041 — Logs are an event stream on stdout; the app does not manage log files

- **Status:** Accepted (2026-08-23)
- **Date:** 2026-08-17
- **Related:** Reverses the "Winston file transports stay" scoping decision recorded in
  [`docs/internal/initiatives/observability/README.md`](../../internal/initiatives/observability/README.md).
  Prerequisite of [ADR-0038](./adr-0038-observability-stack-as-attached-backing-service.md).
  Preserves the mechanisms established by [ADR-0027](./adr-0027-asynclocalstorage-for-request-correlation.md)
  and [ADR-0028](./adr-0028-sensitive-key-pattern-out-of-envmanager.md).
- **Origin:** `TF-1`, `TF-11` in the twelve-factor audit kit — [`twelve-factor`](../../internal/audits/twelve-factor/audit-2026-08-17.md)

---

## Context

The observability initiative built a good logger. `src/utils/logger.ts:54-70` produces structured
JSON with a service name, a per-request correlation id via `AsyncLocalStorage`
([ADR-0027](./adr-0027-asynclocalstorage-for-request-correlation.md)), and recursive redaction of
sensitive keys ([ADR-0028](./adr-0028-sensitive-key-pattern-out-of-envmanager.md)). The content is
correct, machine-parseable, and safe to ship.

Its destination is not. The logger declares two transports, both files, and adds a Console transport
only outside production (`src/utils/logger.ts:65-78`):

```ts
transports: [
  new transports.File({ filename: "logs/error.log", level: "error" }),
  new transports.File({ filename: "logs/combined.log" }),
],
// …
if (nodeEnv !== "production") {
  logger.add(new transports.Console({ format: combine(colorize(), logFormat) }));
}
```

Under `NODE_ENV=production` the application writes to two local files and **emits nothing to
stdout**. Three consequences follow mechanically:

1. Those files live on the container filesystem. On Render that filesystem is ephemeral — every
   restart, deploy, and instance replacement discards it. No volume is configured anywhere in the
   repo, and `logs/` is gitignored (`.gitignore:9`).
2. Neither transport sets `maxsize` or `maxFiles`, so both files grow without bound for the life of
   a container. The development copies are already at roughly 1.26 MB and 650 KB.
3. `docker-compose.yml` configures the `json-file` driver with rotation on all four services
   (`:27-31`, `:46-50`, `:74-78`, `:101-105`) — collecting a stdout stream that, in production, is
   empty.

The practical position today: **a production incident would be investigated with no application
logs.** They were written to a disk that no longer exists, and nothing was streamed anywhere.

There is also no HTTP access logging — `grep -rn "morgan\|pino-http" src/ package.json` returns
nothing — so request rate, latency distribution, and status-code breakdown are not recorded at all,
by any mechanism.

This was not an oversight. The observability kit deliberately scoped out log shipping and recorded
that "Winston file transports stay." That decision is what this ADR reverses, which is why it is an
ADR and not a patch.

## Decision

**The application writes its log stream to stdout and nothing else. It does not create, rotate,
route, or retain log files in any environment.**

1. **Remove both `transports.File` entries.** The application no longer touches the filesystem for
   logging. The `logs/` directory stops being created.

2. **Add a Console transport unconditionally**, for every `NODE_ENV`. Format varies by environment,
   destination does not:
   - Production, staging, and CI: `format.json()` — one JSON object per line, unbuffered.
   - Development: the existing colourised `printf` format, which is materially easier to read and
     changes nothing about where the stream goes.

   This inverts the current conditional. Today the Console transport is the environment-specific
   part; it becomes the constant, and only its formatting is conditional.

3. **The correlation and redaction chain is unchanged.** `attachRequestId()` and `redactSensitive()`
   keep their positions before `json()`. ADR-0027 and ADR-0028 are preserved in full — this ADR
   changes the sink, not the pipeline.

4. **Add HTTP access logging** via `pino-http`, or `morgan` configured to write through the Winston
   stream. One line per completed request carrying method, path, status, duration, and the same
   `requestId` the application logs use. Health and readiness probes are excluded to avoid drowning
   the stream in orchestrator traffic.

5. **Collection is the platform's responsibility, not the application's.** In production, Render
   captures stdout. Locally, the `json-file` driver already configured in `docker-compose.yml` does.
   If [ADR-0038](./adr-0038-observability-stack-as-attached-backing-service.md) adopts Loki, it
   collects from the platform's stream — the app does not gain a Loki exporter, and never ships its
   own logs.

6. **`scripts/logger.js` stays separate and stays Console-only.** It serves CLI scripts that run
   outside the application process. It is already correct; the inconsistency between the two loggers
   resolves by the application logger moving toward the script logger's behaviour.

## Options considered

- _Keep the file transports and add a Console transport alongside them._ The conservative option,
  and the one that requires no argument about whether files are useful. Rejected: it keeps unbounded
  files on an ephemeral disk, so it retains every current cost (unbounded growth, a disk-full
  failure mode on a long-lived container) while adding none of the benefit. Nothing reads those
  files, in any environment, today.
- _Keep the file transports but add rotation (`maxsize` / `maxFiles`) and a mounted volume._
  Considered — this is the coherent version of "files are useful." Rejected because it requires
  infrastructure the repo does not have and Render does not encourage, it makes logs
  instance-local so they must be gathered per-instance before they can be read, and it puts the
  application in the business of log retention. That is the platform's job, and doing it in-process
  is the specific arrangement Factor XI exists to prevent.
- _Switch from Winston to `pino` outright._ Genuinely attractive — `pino` is faster, is stdout-first
  by design, and would make this ADR structural rather than configurational. Rejected as too large
  for the finding. It would rewrite every `logger.*` call site, and would need to reimplement the
  redaction (ADR-0028) and ALS correlation (ADR-0027) formats that already work. Revisit if logging
  throughput ever shows up in a profile.
- _Ship logs directly from the app to a collector (a Winston Loki/OTLP transport)._ Rejected. It
  couples the application to a specific backend, adds a network dependency to the logging path — so
  a collector outage becomes an application concern — and duplicates what the platform already does
  for free. Consistent with ADR-0038's decision that the app pushes telemetry over OTLP but does not
  ship logs.
- _Gate the file transports behind a `LOG_TO_FILE` env var, defaulting off._ Rejected. It preserves
  the code path and the ambiguity for a use case nobody has articulated, and adds a switch of the
  kind [ADR-0036](./adr-0036-refuse-production-unsafe-env-switches.md) argues against.

## Consequences

- Production emits logs for the first time in a way that survives a container restart. This is the
  entire point, and it is a strict improvement over the current position regardless of what
  ADR-0038 decides.
- Log volume reaching the platform increases substantially — from zero. Once access logging is added,
  the dominant term is one line per request. If cost becomes a concern, the lever is sampling
  successful access-log lines, not reintroducing files.
- `logs/` stops being written. The `.gitignore:9` entry stays (developers may still have stale local
  copies), and the existing local files can be deleted by hand.
- Any test asserting on file transports, or reading `logs/*.log`, needs updating. The redaction and
  correlation unit tests assert on the format chain rather than the transport and are unaffected.
- Adding `pino-http` or `morgan` introduces one production dependency. Access logs will carry paths
  containing resource identifiers, which are not secrets but are user-associated — worth stating
  explicitly since it is a new category of data entering the stream. The `SENSITIVE_KEY_PATTERN`
  redaction applies to log metadata, not to URL paths, so query strings are the thing to watch.
- With stdout carrying a real stream, `release` in `defaultMeta`
  ([ADR-0039](./adr-0039-release-identity-and-immutable-artifacts.md)) becomes useful — every line
  becomes attributable to a build.
- **This unblocks the pending observability stack decision.** Loki collects log streams; there is
  currently no stream. ADR-0038 cannot be meaningfully evaluated, let alone implemented, until this
  lands.
- Development experience is unchanged: the colourised console format developers see today is kept
  verbatim.

## Links

- [`audit-2026-08-17.md`](../../internal/audits/twelve-factor/audit-2026-08-17.md) § Factor XI
  (TF-1, TF-11) — the audit's only P0
- [ADR-0038](./adr-0038-observability-stack-as-attached-backing-service.md) — depends on this
- [ADR-0027](./adr-0027-asynclocalstorage-for-request-correlation.md),
  [ADR-0028](./adr-0028-sensitive-key-pattern-out-of-envmanager.md) — the format chain this
  preserves unchanged
- [ADR-0039](./adr-0039-release-identity-and-immutable-artifacts.md) — `release` in log metadata
- `src/utils/logger.ts:65-78` — the two file transports and the `nodeEnv !== "production"` gate
- `docker-compose.yml:27-31` — the `json-file` driver already collecting an empty stream
- [`docs/internal/initiatives/observability/README.md`](../../internal/initiatives/observability/README.md)
  — "Out of scope: … Winston file transports stay", the decision being reversed
