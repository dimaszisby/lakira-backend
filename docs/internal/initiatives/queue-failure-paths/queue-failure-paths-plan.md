# Queue failure paths — Plan

- **Status:** Done
- **Appetite:** 1.5 days
- **Date:** 2026-10-21

## Context and goals

The dated run of 2026-10-20 (`docs/internal/audits/saas-readiness/audit-2026-10-20.md` § 6) found
the queue's failure paths wrong in seven places:

- **X63 (P2).** No `ChannelWrapper` has an `error` listener. A failing channel `setup`, such as a
  queue declared on the broker with other arguments, becomes an unhandled rejection, and the API
  shuts down although every publisher has an in-process fallback. Reproduced by the run.
- **X64.** An unroutable publish is returned by the broker and then confirmed, so `publish`
  resolves, the fallback never runs, and the job is lost.
- **X65.** The server's start failure and the worker's queue-off check exit without flushing logs.
- **X66.** The worker never closes the Redis client it opens through the auth feature.
- **X67.** After a crash the worker drains for up to 20 s; the server skips its drain.
- **X68.** A publish that times out but reached the broker is sent twice: by the fallback and by
  the worker. The second token replaces the first. It failed #199's Fork Smoke.
- **N4.** `x-request-id` is not carried over the queue.

When this lands, a broker problem degrades to the in-process path instead of stopping the API, a
job the broker drops is sent in process, a job the fallback already sent is not sent again, the
worker stops promptly and cleanly, and a request's id follows its job.

## Acceptance criteria

- **AC-1** — With a work queue declared on the broker with another dead-letter exchange, the API
  stays up, logs the setup error, and reports the queue unavailable, so a registration sends its
  email in process. _Why:_ X63.
- **AC-2** — A publish the broker cannot route rejects, so the caller falls back. _Why:_ X64.
- **AC-3** — When a publish of an email job fails after reaching the broker, the email is sent
  once: by whichever of the fallback and the worker runs first; the other is a duplicate. For the
  verification, reset and invite emails. _Why:_ X68.
- **AC-4** — The server's start failure and the worker's queue-off exit flush logs first.
  _Why:_ X65.
- **AC-5** — The worker closes Redis on shutdown, and after a crash closes its consumers without
  draining. _Why:_ X66, X67.
- **AC-6** — A job published within a request runs in its worker with the request's id; a header
  that is not a valid id is replaced. _Why:_ N4.
- **AC-7** — The queue integration suites pass with `RABBITMQ_ENABLED=true` in the environment as
  well as with it off. _Why:_ with it on, every suite timed out on connect on 2026-10-21
  (Discovered), which also blocked B-54's recheck.

## Open questions

None.

## Out of scope

- `GenerateDummyMetricLogs`, whose publish has no fallback (a failed publish is the request's
  error, as today).
- An aliased `process` (B-83), and the other B-82 and B-83 items.

## Decisions expected

- What a channel that cannot be set up does to the publisher and the consumer (D-01).
- How an unroutable publish is reported (D-02).
- How a fallback avoids sending a job the broker also has (D-03).
- Whether a crashed worker drains (D-04).

## Phases

### Phase 0 — kit and branch

Branch off `origin/dev` at `5a3addb`; this kit.

### Phase 1 — tests first

Unit tests for the publisher, the consumer, the three use cases and the worker's close; Postgres
integration tests for the X68 race; broker integration tests for X63, X64 and N4.

### Phase 2 — the fix

Publisher, consumer, `job-routes.ts`, the three use cases and their wiring, `worker.ts`,
`server.ts`.

### Phase 3 — gates, review, docs

Gates by name, image smoke included; review; ADR-0080; register rows, D-10; #202's loose ends.

## Risks and trade-offs

- A fallback now writes a `processed_messages` row from the API process. Its queue is the job's,
  so the dedup is shared with the worker by design.
- A crashed worker no longer finishes its in-flight jobs; the broker redelivers them and the
  dedup absorbs any that committed.

## Rollback

Code only: no migration. A revert restores the old behaviour, defects included.

## Security and data

No new data. Request ids are held to the pattern the HTTP middleware uses, so a header cannot
write arbitrary text into the worker's logs.

## Observability

A setup failure logs once per failure at error, with the channel's name; an unroutable publish
logs at warn with its routing key and message id; the fallback's duplicate is logged at info.

## References

- `audit-2026-10-20.md` § 6 X63 to X68, N4
- ADR-0007 (dedup), ADR-0054 (background work), ADR-0067, ADR-0069, ADR-0070 (the queued emails),
  ADR-0073 (dedup per queue), ADR-0076 (shutdown), ADR-0077 (one connection per job)
