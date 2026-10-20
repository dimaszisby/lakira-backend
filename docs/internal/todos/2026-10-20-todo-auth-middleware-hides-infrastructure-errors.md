# Todo — a database failure in `authMiddleware` answers 401

- **Status:** Open (P2)
- **Created:** 2026-10-20
- **Owner:** unassigned
- **Origin:** dated SaaS-readiness run of 2026-10-20, finding X61
  ([`audit-2026-10-20.md`](../audits/saas-readiness/audit-2026-10-20.md) § 6)

---

## What

`authMiddleware` wraps token verification and both repository lookups in a bare `catch {}`
(`authMiddleware.ts:49-82`). A pool timeout, a lost connection or a lock wait becomes 401
"Unauthorized: Invalid token", with no log of the cause, so clients drop sessions on a database blip.
It is the likely mask for B-54, the intermittent 401 on register in the queue test.

Reproduced on the dated run of 2026-10-20: with the `users` table renamed for one request, the answer
was 401 and the only log line was the 401 itself.

## Suggested fix

Catch only the token library's errors as 401, and let the rest reach the error handler as a 5xx,
logged. A test that makes a lookup throw.
