# Relative ranges and lifecycle timestamps — Decisions Log

`D-NN` entries scoped to this kit. Register rows are those of
`docs/internal/initiatives/backend-debt-register/register.md`. Paths without a root are under
`src/features/public/analytics/`.

---

## D-01 — A relative range ends at the start of the next bucket, in the requested zone

- **Status:** Accepted
- **Date:** 2026-10-13

Promoted to the architecture decision registry as **[ADR-0062](../../../explanation/decisions/adr-0062-a-relative-range-ends-with-the-current-bucket.md)**
(decision 1). That file is authoritative; this entry is a pointer.

## D-02 — `firstLogAt` and `lastLogAt` are the stored instants

- **Status:** Accepted
- **Date:** 2026-10-13

Promoted to the architecture decision registry as **[ADR-0062](../../../explanation/decisions/adr-0062-a-relative-range-ends-with-the-current-bucket.md)**
(decision 2). That file is authoritative; this entry is a pointer.

## D-03 — The fallback range ends at the end of the bucket that holds the newest log

- **Status:** Accepted
- **Date:** 2026-10-13

Promoted to the architecture decision registry as **[ADR-0062](../../../explanation/decisions/adr-0062-a-relative-range-ends-with-the-current-bucket.md)**
(decision 3). That file is authoritative; this entry is a pointer.

## D-04 — No date library is added

- **Status:** Accepted
- **Date:** 2026-10-13

**Context.** D-01 needs a local time in a named zone turned into an instant and back. The
repository has no date library.

**Decision.** The arithmetic uses `Intl.DateTimeFormat`, which the schema already uses to validate
`tz`.

**Options considered.** _`luxon` or `date-fns-tz`._ Rejected for this change: a dependency brings
the security delta gate and the image smoke into a one-day fix, for two functions. _Compute the
bounds in SQL._ Rejected: the range is part of the cache key and is needed before any query runs.

**Consequences.** The zone arithmetic is ours to test, daylight-saving changes included. The
review found the first version wrong east of UTC: a local time that happens twice resolved to its
second instant. A library would not have had that defect.
