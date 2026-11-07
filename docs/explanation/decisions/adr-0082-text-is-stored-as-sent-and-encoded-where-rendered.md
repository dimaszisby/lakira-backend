# ADR-0082 — Text is stored as sent, and encoded where it is rendered

- **Status:** Accepted
- **Date:** 2026-10-22
- **Related:** [ADR-0061](./adr-0061-a-request-is-counted-before-its-body-is-parsed.md) (the global
  middleware order, whose row 11 this removes); lakira-frontend's ADR-0028 (raw HTML is banned by
  lint); `.claude/rules/security.md` § Global Middleware Stack
- **Origin:** `D-02` in the proxy-trust-and-xss-clean kit —
  [`proxy-trust-and-xss-clean`](../../internal/initiatives/proxy-trust-and-xss-clean/decisions.md);
  register row B-81, finding X14 of the dated run of 2026-10-20

---

## Context

`xss-clean@0.1.4` ran on every request, after the body parsers, and rewrote `req.body`,
`req.query` and `req.params` through `xss-filters`' `inHTMLData`, which turns `<` into `&lt;`. The
package is deprecated on npm and unmaintained (X14).

What it protected against does not happen in this stack:

- The API answers JSON. No route renders HTML from request data.
- The one client, lakira-frontend, renders no raw HTML: `react/no-danger` is an error there and it
  ships no sanitiser (its ADR-0028, origin/dev `c1821df`). React escapes every string it renders.
- The three email templates (`src/features/shared/auth/infrastructure/email/templates/`) escape
  every value they interpolate with `escapeHtml`.

What it did instead was corrupt text. React escaped the `&lt;` it was handed, so a user who saved
`a < b` read `a &lt; b`. An invite email encoded an organization name a second time, so `A<B`
arrived as `A&amp;lt;B`.

## Decision

1. **`xss-clean` is removed, with nothing in its place.** The pipeline rewrites no input; text is
   stored exactly as sent.
2. **Encoding happens on output, where the context is known.** React for the frontend,
   `escapeHtml` in each email template. A new place that renders API text as HTML encodes it there.
3. **Zod decides what an input may be**: its shape, its length, the characters a field accepts.
   A field that must not hold markup says so in its schema, not in a global rewrite.
4. **Rows stored before this change are left as they are.**

## Options considered

- _Copy the `<` encoding into the repo and drop the package._ No unmaintained dependency, and the
  same corruption.
- _A maintained sanitiser such as `express-xss-sanitizer`._ A new dependency that rewrites input
  the same way, for an attack the stack does not have.
- _Remove it and decode the stored `&lt;` in a migration._ A `&lt;` the user typed cannot be told
  from one the middleware wrote, so the migration would corrupt the first kind to repair the
  second.

## Consequences

- New text reaches the frontend as typed. Text saved before 2026-10-22 may still show `&lt;`.
- A client that renders API text as HTML must encode it. The frontend's lint rule holds it to
  that; a second client would have to make the same promise.
- `xss-clean` and `xss-filters` leave the dependency tree, and so does `src/types/xss-clean.d.ts`.
- The global stack is eleven middleware, not twelve.

## Enforcement

`__tests__/unit/shared/middleware/http-pipeline.test.ts` › "still hands a route its parsed body,
cookies and query" sends `<script>` in the body and `<` in the query and expects both as sent. On
the frontend side, `react/no-danger`.

## Links

- Kit: [`proxy-trust-and-xss-clean`](../../internal/initiatives/proxy-trust-and-xss-clean/README.md)
- Audit: `docs/internal/audits/saas-readiness/audit-2026-10-20.md` § 6, X14
