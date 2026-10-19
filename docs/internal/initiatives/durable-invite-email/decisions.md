# Decisions — durable-invite-email

## D-01 — The message carries the invite id only

- **Status:** Proposed
- **Date:** 2026-10-19

Promoted to the architecture decision registry as **[ADR-0070](../../../explanation/decisions/adr-0070-the-invite-email-is-a-queued-job.md)**,
together with D-02 to D-04, which it records as its decisions 2 to 4.
That file is authoritative; this entry is a pointer. Register row B-70; branch
`fix/durable-invite-email`.

## D-02 — The token is minted where the email is sent

- **Status:** Proposed
- **Date:** 2026-10-19

Promoted with D-01 to **[ADR-0070](../../../explanation/decisions/adr-0070-the-invite-email-is-a-queued-job.md)**,
decision 2. That file is authoritative; this entry is a pointer.

## D-03 — With the queue off or a failed publish, the invite and the send share one transaction

- **Status:** Proposed
- **Date:** 2026-10-19

Promoted with D-01 to **[ADR-0070](../../../explanation/decisions/adr-0070-the-invite-email-is-a-queued-job.md)**,
decision 3. That file is authoritative; this entry is a pointer.

## D-04 — A parked invite email leaves a pending invite; the remedy is the frontend's call

- **Status:** Proposed
- **Date:** 2026-10-19

Promoted with D-01 to **[ADR-0070](../../../explanation/decisions/adr-0070-the-invite-email-is-a-queued-job.md)**,
decision 4. That file is authoritative; this entry is a pointer. The remedy is register row B-71.
