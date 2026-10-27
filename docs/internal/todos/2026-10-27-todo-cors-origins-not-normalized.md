# Todo — a configured CORS origin must match the browser's spelling exactly

- **Status:** Open. Register row B-98
- **Created:** 2026-10-27
- **Owner:** unassigned
- **Origin:** F6 (P3) of `docs/internal/audits/saas-readiness/audit-2026-06-05.md` § 6.4, re-read
  on 2026-10-27 ([`audit-0605-reread`](../initiatives/audit-0605-reread/README.md))

---

## What

`CORS_ORIGIN` in `src/config/zodEnv.ts` is split on commas and trimmed, nothing more. A browser
sends `Origin` as a lowercase scheme and host with no path, so `https://App.example.com` or
`https://app.example.com/` in the variable never matches, and the frontend's requests fail CORS
with nothing in the server log saying why.

## Suggested fix

Parse each entry with `new URL()` at startup: keep its `origin` (lowercased, no trailing slash, no
path), and refuse an entry that is not a bare origin, naming the variable. A unit test per spelling.
