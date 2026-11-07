# Decisions — metric-log-stats-in-sql

## D-01 — The stats are one aggregate query on the existing scoping

- **Status:** Accepted (promoted)
- **Date:** 2026-10-21

Promoted to the architecture decision registry as **[ADR-0079](../../../explanation/decisions/adr-0079-metric-log-stats-are-one-ranged-aggregate.md)**
(decision 1). That file is authoritative; this entry is a pointer.

---

## D-02 — The range is half-open, by `loggedAt`, with no cap

- **Status:** Accepted (promoted)
- **Date:** 2026-10-21

Promoted to the architecture decision registry as **[ADR-0079](../../../explanation/decisions/adr-0079-metric-log-stats-are-one-ranged-aggregate.md)**
(decision 2). That file is authoritative; this entry is a pointer.

---

## D-03 — The cache key names the range in epoch milliseconds, and a write clears every range

- **Status:** Accepted (promoted)
- **Date:** 2026-10-21

Promoted to the architecture decision registry as **[ADR-0079](../../../explanation/decisions/adr-0079-metric-log-stats-are-one-ranged-aggregate.md)**
(decision 3). That file is authoritative; this entry is a pointer.
