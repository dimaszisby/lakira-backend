# ADR-0088 — CORS origins are kept as origins; anything else is refused at startup

- **Status:** Accepted
- **Date:** 2026-11-06
- **Related:** issue #245 (finding F6 of the 2026-06-05 run, register row B-98); builds on
  [ADR-0034](./adr-0034-cors-origin-allowlist.md), the comma-separated allowlist
- **Origin:** issue #245, planned and approved on 2026-11-06

---

## Context

`CORS_ORIGIN` was split on commas and trimmed, nothing more, and `cors` compares each entry with
the browser's `Origin` exactly. A browser sends a lowercase scheme and host, with no path and no
default port. So `https://App.example.com`, `https://app.example.com/` and
`https://app.example.com:443` never matched. The frontend's requests failed CORS, and the server
logged nothing to say why.

## Decision

- Each entry is parsed with `new URL()` and kept as its `origin`: scheme and host lowercased, no
  trailing slash, no default port. Two spellings of one origin are kept once.
- An entry is refused at startup unless it is `http:` or `https:` with no user or password, no
  path beyond `/`, no query and no hash. A wildcard and a host with no scheme are refused too.
- The refusal names the variable and the entry's position, never its value. A mistaken entry
  could hold a password, and startup errors are printed unredacted.
- Unset or empty still means the app's default, `http://localhost:3000`.

## Options considered

- **Normalize and drop a bad entry with a warning:** the deployment would still serve with a
  frontend that cannot reach it. A loud failure at startup is easier to find.
- **Lowercase and strip the slash only, by string:** a path or credentials would still pass, and
  would never match.
- **Accept wildcards or patterns:** a different feature, with its own risk. Out of scope.

## Consequences

- A deployment whose `CORS_ORIGIN` holds a path, a query, credentials or no scheme now fails at
  startup. Staging's value is not recorded (#233), so its next deploy is the check.
- The frontend can spell an origin any way a URL allows, with nothing changed on its side.
