# B-12 — The `guest` refusal reads the separate fields; the connection uses `RABBITMQ_URL`

Register row [B-12](register.md). Read at `bf72b58`. Found independently by two graders on
2026-10-12; read in the code, not run.

## 1. What is wrong

In production with `RABBITMQ_ENABLED=true`, startup refuses `RABBITMQ_USER=guest` and
`RABBITMQ_PASSWORD=guest` (`src/config/zodEnv.ts:499-512`). The connection, though, is made from
`RABBITMQ_URL` as given whenever that is set
(`src/shared/infrastructure/queue/RabbitMQConnection.ts:8`).

Two wrong outcomes follow:

- **A `guest` URL starts.** `RABBITMQ_URL=amqp://guest:guest@host` beside any non-guest
  `RABBITMQ_USER` and `RABBITMQ_PASSWORD` passes the check and connects as `guest`.
- **A good URL is refused.** `RABBITMQ_URL=amqp://app:Str0ng@host` with the two fields unset is
  refused, because both fields default to `guest` in the schema and the check reads the defaults.

ADR-0036 states that default `guest` credentials are refused in production. For a deployment
configured by URL, which is the usual way, that sentence does not hold.

## 2. Root cause

Order. The refusals run inside the schema's `superRefine`, on the raw fields.
`normalizeRabbitMQConfig` (`zodEnv.ts:637-665`) copies the URL's user into the field afterwards,
and copies the password only when the field is empty (`:655-657`), which it never is, since the
default is `"guest"`.

## 3. Options

- **A. Normalise first, refuse second:** run the URL normalisation before the production checks,
  so the checks see the credentials the connection will use.
- **B. Check the URL directly** in the refusal, as well as the fields.
- **C. Remove the `guest` defaults** from the schema so an unset field is empty, and let the
  URL's password win. Changes what development gets with nothing set; Compose passes
  `${RABBITMQ_USER:-guest}` itself, so local work is unaffected.

## 4. Recommendation

**A and C together.** A alone still leaves the dead branch at `:655-657`; C alone still checks
before normalising. The Redis and database URLs are normalised by the same pattern and are worth
reading for the same ordering while the file is open, though no refusal depends on them today.

## 5. Acceptance criteria for the fix

- **AC-1** — Production, `RABBITMQ_ENABLED=true`, `RABBITMQ_URL=amqp://guest:guest@host`: startup
  exits 1 and names the variable, not the URL. _Why:_ the first wrong outcome; and V1's rule.
- **AC-2** — Production, a URL with real credentials and the two fields unset: startup proceeds.
  _Why:_ the second wrong outcome.
- **AC-3** — Development with nothing set still connects to the Compose broker.
  _Why:_ the default must not regress local work.
- **AC-4** — ADR-0036's sentence matches the code. _Why:_ it is an Accepted record.

## 6. Size and shape

≤1h. Micro entry; ADR-0036 is amended, not replaced. Gates: typecheck, lint, format, tests, build.

## 7. Depends on, unblocks

Depends on nothing. Could ride with B-07, which also adds a production refusal to the same block.

## 8. Not verified

- Neither outcome was run. Both are read from the order of `superRefine` and the normaliser.
- How staging and production set their broker credentials today; a URL-only deployment would be
  refused already, which suggests none is configured that way, or that the queue is off.
