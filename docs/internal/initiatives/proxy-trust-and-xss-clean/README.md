# Proxy trust and xss-clean

**Status:** Implemented on `fix/proxy-trust-and-xss-clean`; PR open. Register row B-81, its
second slice: X12 and X14 of the dated run of 2026-10-20. B-81 keeps X7, X8, X9, X10 and B-17's `iss` and `aud`.
**Slug:** `proxy-trust-and-xss-clean` · **Branch:** `fix/proxy-trust-and-xss-clean`

Lean kit: no plan; the acceptance criteria are in the checklist. D-02 removes a dependency and a
global middleware, so it is promoted to
[ADR-0082](../../../explanation/decisions/adr-0082-text-is-stored-as-sent-and-encoded-where-rendered.md).
ADR-0061 gains a dated Status note.

**Why this row now.** B-81 is D-01's first `ready` row. The owner chose this slice on 2026-10-21
and settled its two open questions on 2026-10-22: remove `xss-clean` with nothing in its place,
and bind the local app port to loopback, with LAN access as an opt-in.

- [Checklist](proxy-trust-and-xss-clean-checklist.md): acceptance, work items, gates
- [Decisions](decisions.md): `D-NN` entries
