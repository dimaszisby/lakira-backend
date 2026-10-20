# Queue design hardening — Plan

- **Status:** In progress
- **Appetite:** 2 days
- **Date:** 2026-10-20

## Context and goals

Register row B-40, the 2026-09-29 audit's R8. Three findings, all still true on `dev` at `394f949`:
the dedup key is `message_id` alone, so a second queue bound to the same routing key skips its
copy; one retry queue per work queue with a per-message expiry holds a short wait behind a long
one; the dummy-logs handler casts its payload and loops `count` times. Since #184 to #187 every
email goes through the queue.

When this lands, a message is processed once per queue, a retry waits in the queue of its delay,
and every job's body is checked before anything acts on it.

## Acceptance criteria

- **AC-1** — The same `messageId` delivered on two queues is processed on each; delivered twice
  on one, it is processed once.
  _Why:_ R8's first finding; the second queue's work was lost.
- **AC-2** — The migration's `up` and `down` both run; `down` refuses while a message id is
  recorded on two queues, and passes once that row is removed.
  _Why:_ a schema change must be reversible, or say why not.
- **AC-3** — Against the broker, a short retry scheduled after a long one comes back first, each
  from its own tier.
  _Why:_ R8's head-of-line finding.
- **AC-4** — A dummy-logs job with a bad id or a `count` that is not a whole number from 1 to 1000
  parks at once and writes no row.
  _Why:_ R8's payload finding; `count` drives the write loop.
- **AC-5** — The four queue integration suites pass, retries and parking included.
  _Why:_ the retry path changed under them.
- **AC-6** — No HTTP route, response or OpenAPI change.
  _Why:_ the change is behind the queue.

## Open questions

None.

## Out of scope

Cleaning up `processed_messages` (B-41); a parking-lot consumer or alerting; turning the queue on
anywhere.

## Decisions expected

The dedup key (D-01); the retry tiers (D-02); payload validation (D-03).

## Phases

### Phase 0 — kit and branch

### Phase 1 — tests first, and the old behaviour observed

### Phase 2 — the migration and the model

### Phase 3 — the tiers

### Phase 4 — the job body

### Phase 5 — gates, review, docs

## Risks and trade-offs

The key rebuild rewrites the index; the table only holds local and test rows today. Up to about
nine retry queues per work queue.

## Rollback

Migrations: `down` of `20261020000001-processed-messages-key-per-queue.cjs` verified against the
test database, refusal included.
Code: revert the PR; a leftover tier queue is harmless.

## Security and data

No personal data changes. A malformed job can no longer drive an unbounded write loop.

## References

- ADR-0073; ADR-0005; ADR-0007; audit 2026-09-29 § 6 R8
