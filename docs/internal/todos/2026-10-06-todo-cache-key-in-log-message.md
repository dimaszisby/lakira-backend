# Todo — the cache key, with the user's search text, is written into log messages

- **Status:** Fixed on `fix/cache-key-in-log-message`
  ([`log-redaction-coverage`](../initiatives/log-redaction-coverage/decisions.md) D-08, D-09). The
  three items under "Also noted" are still open. Was: Open (P3), the reviewer of the U1 fix kept
  caveat C6 open on it
- **Created:** 2026-10-06
- **Owner:** unassigned
- **Origin:** the security review of the U1 fix; kit
  [`log-redaction-coverage`](../initiatives/log-redaction-coverage/decisions.md) D-07

---

## What

Redaction is by metadata key and never scans message text. `src/shared/middleware/cache.ts` puts
the cache key into three messages at `info`, which the production level includes:

- `:36` `[CACHE PROCESS] Cache HIT: <key>`
- `:41` `[CACHE PROCESS] Cache miss for key: <key>`
- `:52` `[CACHE] Cached response: <key> (TTL: …)`

The key for a metric list is built from the query
(`src/features/public/metric/infrastructure/http/cache-keys.ts:24-36`): it holds the search text
`q`, the name filter, the category id, the user id and the organization id. A search for an email
address or a name is therefore written to the log. The access log drops the query string for this
reason; these three lines put it back.

The reviewer also named `src/utils/redis-client.ts:144,166-168`, which log keys on invalidation.
Read by the session that wrote the fix and confirmed for `cache.ts` and the metric key builder; the
other key builders and the `redis-client.ts` lines have not been checked.

## Why it is not part of the U1 fix

U1 is about what the logger does with what it is given. This is a call site choosing to put
request text in a message, in other files, and it changes what the cache lines say. It is the same
class as
[`2026-10-05-todo-log-lines-that-carry-row-or-body-text.md`](2026-10-05-todo-log-lines-that-carry-row-or-body-text.md).

## Suggested fix

Log a fixed message and name the entry by something that is not request text: the route's
namespace and a short hash of the key, as the limiter lines do for an address with `hashEmail`.
Check every key builder and the two `redis-client.ts` lines in the same change, and add a test that
reads the line for a search containing an address.

## Also noted in the same review, not filed separately

- Metadata passed beside an error can replace the record's `message` or `level`
  (`logger.error("x", err, { message: "y" })`). Winston does the same for any metadata. Log-forging
  at most, and no call site does it.
- `summarizeError` writes `name`, and `redactObject` writes a nested error's `message`, without
  checking that either is a string.
- `src/config/db.ts:5-7` writes the SQL text at `debug` when `DB_LOGGING=true`. Off by default and
  below the production level.
