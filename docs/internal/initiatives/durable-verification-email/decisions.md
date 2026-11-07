# Decisions — durable-verification-email

## D-01 — The verification email is a job on the existing queue

- **Status:** Accepted (merged in #184, `975de82`)
- **Date:** 2026-10-18

Promoted to the architecture decision registry as **[ADR-0067](../../../explanation/decisions/adr-0067-the-verification-email-is-a-queued-job.md)**,
together with D-02 to D-04, which it records as its decisions 2 to 5.
That file is authoritative; this entry is a pointer. Register row B-39; branch
`fix/durable-verification-email`.

## D-02 — The message carries the user id only; the worker mints the token

- **Status:** Accepted (merged in #184, `975de82`)
- **Date:** 2026-10-18

Promoted with D-01 to **[ADR-0067](../../../explanation/decisions/adr-0067-the-verification-email-is-a-queued-job.md)**,
decision 2. That file is authoritative; this entry is a pointer.

## D-03 — Send inside the idempotency transaction: at least once

- **Status:** Accepted (merged in #184, `975de82`)
- **Date:** 2026-10-18

Promoted with D-01 to **[ADR-0067](../../../explanation/decisions/adr-0067-the-verification-email-is-a-queued-job.md)**,
decision 3. That file is authoritative; this entry is a pointer.

## D-04 — Fall back in process when the publish fails; every publish has a timeout

- **Status:** Accepted (merged in #184, `975de82`)
- **Date:** 2026-10-18

Promoted with D-01 to **[ADR-0067](../../../explanation/decisions/adr-0067-the-verification-email-is-a-queued-job.md)**,
decisions 4 and 5. That file is authoritative; this entry is a pointer.
