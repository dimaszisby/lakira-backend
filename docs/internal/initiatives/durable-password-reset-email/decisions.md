# Decisions — durable-password-reset-email

## D-01 — The message carries the user id only; the request looks the address up

- **Status:** Proposed
- **Date:** 2026-10-19

Promoted to the architecture decision registry as **[ADR-0069](../../../explanation/decisions/adr-0069-the-password-reset-email-is-a-queued-job.md)**,
together with D-02 to D-04, which it records as its decisions 2 to 4.
That file is authoritative; this entry is a pointer. Register row B-70; branch
`fix/durable-password-reset-email`.

## D-02 — Send inside the idempotency transaction: at least once

- **Status:** Proposed
- **Date:** 2026-10-19

Promoted with D-01 to **[ADR-0069](../../../explanation/decisions/adr-0069-the-password-reset-email-is-a-queued-job.md)**,
decision 2. That file is authoritative; this entry is a pointer.

## D-03 — No staleness check on a late retry

- **Status:** Proposed
- **Date:** 2026-10-19

Promoted with D-01 to **[ADR-0069](../../../explanation/decisions/adr-0069-the-password-reset-email-is-a-queued-job.md)**,
decision 3. That file is authoritative; this entry is a pointer.

## D-04 — With the queue off or a failed publish, send in the request as today

- **Status:** Proposed
- **Date:** 2026-10-19

Promoted with D-01 to **[ADR-0069](../../../explanation/decisions/adr-0069-the-password-reset-email-is-a-queued-job.md)**,
decision 4. That file is authoritative; this entry is a pointer.
