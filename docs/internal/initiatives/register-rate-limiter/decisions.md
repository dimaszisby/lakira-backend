# Register Rate Limiter — Decisions Log

`D-NN` entries scoped to this kit.

---

## D-01 — Registration is limited per IP, per hour, first in the chain

- **Status:** Accepted
- **Date:** 2026-10-02

Promoted to the architecture decision registry as **[ADR-0053](../../../explanation/decisions/adr-0053-registration-rate-limited-per-ip.md)**.
That file is authoritative; this entry is a pointer.

## D-02 — A dedicated variable, `RATE_LIMIT_REGISTER_IP_MAX`

- **Status:** Accepted
- **Date:** 2026-10-02

Promoted to the architecture decision registry as **[ADR-0053](../../../explanation/decisions/adr-0053-registration-rate-limited-per-ip.md)**.
That file is authoritative; this entry is a pointer.

## D-03 — The new 429 uses the current rate-limit body

- **Status:** Accepted
- **Date:** 2026-10-02

**Context.** Every limiter answers `{status: 429, message}`, outside the error envelope; moving them
onto the envelope is `error-envelope-residuals` Phase 2, waiting on the frontend.
**Decision.** This limiter uses the same handler shape and body, documented with
`RateLimitErrorSchema` as `/auth/forgot-password` does.
**Options considered.** Give this one the envelope now: rejected, it would leave two 429 shapes in
the API, worse than one consistent exception.
**Consequences.** Phase 2 moves it with the rest.
