# Todo — a startup error for a bad connection URL prints the whole URL

- **Status:** Fixed in #151 (`0e11dd4`)
  ([`log-redaction-coverage` D-10](../initiatives/log-redaction-coverage/decisions.md)): the
  message names the variable and the reason and no part of the URL. Not yet confirmed by a dated
  run. Was: Open (P2), reproduced on 2026-10-10 as finding V1 of
  [`audit-2026-10-10.md`](../audits/saas-readiness/audit-2026-10-10.md), which the security grader
  tied to caveat C6
- **Created:** 2026-10-08
- **Owner:** unassigned
- **Origin:** the security review of the cache-key fix; kit
  [`log-redaction-coverage`](../initiatives/log-redaction-coverage/decisions.md) D-09

---

## What

`src/config/zodEnv.ts` builds three error messages that include the value it rejected:
`DATABASE_URL (<url>) is invalid` (`:555`), `REDIS_URL (<url>) is invalid` (`:602`) and
`RABBITMQ_URL (<url>) is invalid` (`:636`). `logEnvFailure` in `src/config/envManager.ts` writes
`error.message` with `console.error`, so the logger and its redaction are not involved. A URL
that is malformed, or that has the wrong protocol, is written to stderr with its user name and
password.

The same payload carries `envSample`, which is masked by key. The message is not.

## Why it is not part of the cache-key fix

That fix is about request text in log lines. This is a credential, written at boot by an operator's
mistake and never by a request, and it sits in environment validation.

## Suggested fix

Name the variable and say what is wrong with it, without the value; or print the URL with its
userinfo removed. Add a case to `envManager.test.ts` that gives each of the three a URL with a
password and reads what is written.
