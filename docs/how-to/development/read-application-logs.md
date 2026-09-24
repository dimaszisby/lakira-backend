# Read application logs

**Status:** Active
**Last updated:** 2026-08-23

The application writes its log stream to **stdout and nothing else** — it creates, rotates, and
retains no log files in any environment ([ADR-0041](../../explanation/decisions/adr-0041-logs-as-event-streams-on-stdout.md)).
Collection is the platform's job. This page is how you read that stream.

> If you are looking for `logs/error.log` or `logs/combined.log`: they are gone. Before 2026-08-23
> the app wrote only to those files in production, on a Render filesystem that is discarded on every
> restart and deploy — so production effectively had no logs at all. That is what this change fixed.

## Where the stream goes

| Environment                                               | Reader                                                                                      |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Production / staging (Render today; ADR-0042 plans a VPS) | Render dashboard → the service → **Logs**, or the Render CLI/API                            |
| Local Docker                                              | `docker compose logs -f app` (the `json-file` driver is configured with 10 MB × 3 rotation) |
| Local `npm run dev`                                       | Your terminal                                                                               |
| CI                                                        | Redirected to `/tmp/backend.log` and tailed automatically on failure                        |

## What a line looks like

Outside development every line is one JSON object:

```json
{
  "level": "info",
  "message": "[CACHE PROCESS] Cache HIT: viz:org-1:user-9:metric-2:1d:pXpV",
  "requestId": "3f7c1e88-0f9d-4a2e-9a1e-2b6c4d5e6f70",
  "service": "lakira-backend",
  "timestamp": "2026-08-23T15:41:28.324Z"
}
```

In development the same record is rendered as a readable, colourised line instead. Destination does
not change between environments — only formatting.

### Access logs

One line per completed request, at level `http`:

```json
{
  "level": "http",
  "message": "http_request",
  "method": "GET",
  "path": "/api/v1/metrics",
  "status": 401,
  "durationMs": 1.958,
  "contentLength": 61,
  "requestId": "probe-123",
  "service": "lakira-backend",
  "timestamp": "2026-08-23T15:41:28.324Z"
}
```

Two deliberate omissions:

- **No query string.** `path` is the URL with everything after `?` stripped. Redaction applies to log
  metadata, not to URL strings, so search terms, filters, and cursors would otherwise land in the
  stream unredacted. Resource ids in the path do appear.
- **No `/api/v1/health` or `/api/v1/ready`.** Probe traffic would drown the stream.

## Tracing one request end to end

Every log line emitted during a request carries the same `requestId`, propagated through
`AsyncLocalStorage` ([ADR-0027](../../explanation/decisions/adr-0027-asynclocalstorage-for-request-correlation.md)).
The value comes from the caller's `x-request-id` header, or is generated per request, and is echoed
back on the response.

Grab the id from the response header, then filter the stream by it:

```bash
# Local
docker compose logs app | grep '"requestId":"3f7c1e88-…"'

# With jq, showing the request's timeline
docker compose logs --no-log-prefix app \
  | jq -c 'select(.requestId == "3f7c1e88-…") | {timestamp, level, message}'
```

To trace a request you are making yourself, set the id and search for it:

```bash
curl -H 'x-request-id: debug-me-1' http://localhost:8001/api/v1/metrics   # Compose app; 5000 for npm run dev
docker compose logs app | grep debug-me-1
```

The `http_request` access line is the last line for a request, so it marks where the timeline ends
and carries the status and duration.

## Turning up the volume

`LOG_LEVEL` controls verbosity. Winston's ordering is
`error < warn < info < http < verbose < debug < silly`, and setting a level includes everything
above it.

| Environment     | Default | Why                                                             |
| --------------- | ------- | --------------------------------------------------------------- |
| Production      | `http`  | Includes the access-log lines. `info` would silently drop them. |
| Everything else | `debug` | `logger.debug(...)` calls are reachable locally.                |

```bash
LOG_LEVEL=debug npm run dev          # application debug lines
LOG_LEVEL=debug DB_LOGGING=true npm run dev   # …plus every SQL statement
```

`DB_LOGGING=true` routes SQL through `logger.debug`, so it only produces output when `LOG_LEVEL` is
`debug` or `silly`. `LOG_LEVEL=silly` is **refused in production** at startup
([ADR-0036](../../explanation/decisions/adr-0036-refuse-production-unsafe-env-switches.md)).

## Sensitive values

Any key matching
`/password|secret|authorization|cookie|bearer|(token|key|certificate|url|dsn)$/i` is replaced with
`***REDACTED***`, recursively, before serialization
([ADR-0028](../../explanation/decisions/adr-0028-sensitive-key-pattern-out-of-envmanager.md)). This
covers log **metadata**. It does not rewrite free-text messages or URL strings — which is why access
logs drop the query string rather than relying on redaction.

## Startup failures

Environment validation runs before anything binds a port. A bad value exits the process with a
single structured line on **stderr**:

```
[ENV_ERROR] {"event":"env.validation.failed","environment":"production","message":"Environment validation failed","issues":[{"path":["DISABLE_RATE_LIMITING"],"message":"…"}],…}
```

This one bypasses Winston deliberately — `envManager` is on the bootstrap path and importing the
logger there would be a circular init failure. Secret values in the snapshot are masked.

## Crashes

`uncaughtException` and `unhandledRejection` log the error with its stack, wait for the stream to
drain, then exit **non-zero**. If a container restarts and you want to know why, that final line is
on the stream immediately before the restart.

A third exit works the same way: with `REDIS_REQUIRED=true`, losing Redis for longer than the
reconnect budget (~30s) logs

```
[REDIS] Giving up: Redis is required and unreachable after the retry budget. Exiting.
```

and exits `1`. Reconnect attempts appear as `[REDIS] Reconnecting to Redis...` warnings before it,
so the stream shows how long the outage ran. A short blip reconnects and produces no exit — if you
see `Reconnecting` followed by `Connected`, nothing died.

## Related

- [ADR-0041](../../explanation/decisions/adr-0041-logs-as-event-streams-on-stdout.md) — the decision
- [ADR-0027](../../explanation/decisions/adr-0027-asynclocalstorage-for-request-correlation.md) — request correlation
- [ADR-0028](../../explanation/decisions/adr-0028-sensitive-key-pattern-out-of-envmanager.md) — redaction
- [ADR-0038](../../explanation/decisions/adr-0038-observability-stack-as-attached-backing-service.md) — the pending stack decision this unblocks
- [`docs/reference/configuration.md`](../../reference/configuration.md) — `LOG_LEVEL`, `DB_LOGGING`
