# B-05 — The browser's IP is lost through the frontend proxy

Register row [B-05](register.md), with B-18. Read at `bf72b58` and lakira-frontend `1edb13c`.
Recorded on the Notion page (Part 2, "Needs decision", 2026-10-02) and in ADR-0053 § Consequences.

## 1. What is wrong

Every per-IP limiter keys on `req.ip`: the app-wide limiter and the IP fallbacks of the user,
analytics and switch-org limiters, and the IP limiters for registration, password reset and email
verification (`src/shared/middleware/rate-limiter.ts:56-184`). `req.ip` comes from `trust proxy`,
set to `TRUST_PROXY` or 1 hop (`src/server.ts:115`).

Browser traffic reaches the backend through the frontend's `/api/proxy`, which forwards the
incoming headers except three (`src/app/api/proxy/[...path]/route.ts:23,103-107` in the frontend)
and sets no `X-Forwarded-For` of its own. So behind the backend's platform proxy, one trusted hop
resolves to the frontend server's address, and **all proxied users share one budget**: 100
requests per 15 minutes app-wide, and 10 registrations per hour.

Inferred from both repos' code. Not verified against a deployed chain.

## 2. Root cause

Two services each assume the other handles the client's address. The frontend forwards whatever
`X-Forwarded-For` the browser sent, which is also a spoofing route: with one trusted hop the
backend ignores it, and with two it would believe a header the browser wrote.

## 3. Options

1. **The proxy overwrites `X-Forwarded-For`** with the address its own host reports, and the
   backend sets `TRUST_PROXY` to the real hop count per environment. Standard; correct only if the
   count is right in each environment, and wrong silently if it is not.
2. **A dedicated header carrying the browser's address, authenticated by a shared secret.** The
   backend keys on it only when the secret matches. Does not depend on hop counts. One more secret
   to rotate, and a custom mechanism to document.
3. **Accept the shared budget and raise the limits.** No code. Wrong for registration, which
   sends email.
4. **Key the limiters on something else for proxied traffic**, such as the session or the account
   for authenticated routes. Already true where a user id exists (`rate-limiter.ts:78`); does
   nothing for registration, login and password reset, which are the ones that matter.

## 4. Recommendation

**Option 1**, with a startup log line stating the resolved hop count, and a documented check per
environment: one request through the frontend, read `req.ip` in the access log, compare with the
browser's address. Option 2 is the fallback if the frontend's host cannot be made to report the
client address reliably.

The backend's half is small and can be prepared now: make the hop count visible, and add the check
to `docs/how-to/`. It cannot be finished until the frontend's hosting is known.

## 5. Acceptance criteria for the fix

- **AC-1** — Two browsers on different networks, registering through the frontend, get separate
  `RateLimit-Remaining` counts. _Why:_ the Notion record's own verification.
- **AC-2** — A browser that sends its own `X-Forwarded-For` does not change the key it is limited
  under. _Why:_ otherwise the fix is a bypass.
- **AC-3** — `TRUST_PROXY` is documented per environment, and startup logs the value in use.
  _Why:_ a wrong count fails silently.
- **AC-4** — Direct calls to the backend, with no frontend in front, are still limited per client.
  _Why:_ the contract tests and any API consumer.

## 6. Size and shape

≤½ day for the backend's half; the frontend's is its own. An ADR is owed, shared with the
frontend's decision: how a client is identified is a security boundary in both repos. Gates:
typecheck, lint, format, tests, build.

## 7. Depends on, unblocks

Depends on the frontend's answer to two questions (register O-04): where it is hosted per
environment, and whether that host sets `X-Forwarded-For`. Depends on the production host being
chosen (B-04). B-18's first item, IPv6 keyed per address, is independent and can go first.

## 8. Not verified

- The proxy chain of staging or production. Neither repo records it.
- That the frontend's host exposes the client address to the route handler at all.
- What `req.ip` is on staging today; one request and one log line would settle it.
