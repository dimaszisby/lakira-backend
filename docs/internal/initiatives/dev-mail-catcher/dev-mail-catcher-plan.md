# Read outbound email locally with Mailpit — Plan

- **Status:** Done
- **Appetite:** 1 day — past that, ship the adapter and docs, and hand the Compose wiring over as a
  follow-up
- **Date:** 2026-09-26

## Context and goals

lakira-frontend's P1 request "A way to read emailed tokens outside production" (raised
2026-08-29) blocks the success paths of verify-email, reset-password and invite-accept. That
includes the one-user-two-organizations switcher test that #114 enabled, and any Cypress E2E of the
auth flows. All of them consume a single-use token that is delivered only by email.

With `EMAIL_PROVIDER=console` the email is logged to stdout. The development log format, however,
prints only the message line and drops the metadata that holds the body. The `list-user-organizations`
kit confirmed this: its end-to-end check could not read an invite token and seeded memberships in
SQL instead.

When this lands, every outbound email in local development appears in Mailpit, which has a web
inbox and a documented HTTP API that Cypress can call. It cannot be enabled in production.

Settled with the user before the plan: Mailpit, delivered through its HTTP send API, for local
development now, and allowed under `NODE_ENV=staging` for the ADR-0042 VPS stack later. Render
staging keeps Resend.

From Mailpit's own `swagger.json` (checked 2026-09-26): `POST /api/v1/send` takes
`{ From: { Email }, To: [{ Email }], Subject, HTML, Text }`. Reading uses `GET /api/v1/search` and
`GET /api/v1/message/{ID}`. The send API is on by default, and authentication is optional
(`MP_SEND_API_AUTH`).

Checked against `origin/dev` at `afac3f4`.

## Acceptance criteria

- **AC-1** — With the Compose stack up, a developer can register, open the verify-email message in
  Mailpit (web UI or API), and complete `POST /auth/verify-email` without reading any terminal.
  _Why:_ the frontend's first acceptance line.
- **AC-2** — The same works for reset-password (then log in with the new password) and for an
  invite (accept it, then `GET /organizations` lists two).
  _Why:_ the frontend's second line; it also closes #114's two-organization loop through the real
  flow.
- **AC-3** — `EMAIL_PROVIDER=mailpit` with `NODE_ENV=production` refuses to start, and the test for
  it fails when the guard is removed.
  _Why:_ "nothing about it is reachable in production".
- **AC-4** — A Mailpit send failure (unreachable, or a non-2xx response) surfaces as an error, as
  a Resend failure does. It is never silently swallowed.
  _Why:_ keeps the adapters consistent, and keeps the verification and reset try/catch meaningful.
- **AC-5** — Docs describe where mail goes and how to read it, including the API calls Cypress
  would make.
  _Why:_ the frontend needs a documented, stable mechanism.
- **AC-6** — ADR-0048 is Accepted and in the registry, and D-01..D-04 point to it.
  _Why:_ a new adapter, new env vars and an extended production refusal set.

## Open questions

None.

## Out of scope

- Render staging, which keeps Resend until the VPS migration. Mailpit send-API authentication for
  the VPS stack is set up with that stack.
- A Mailpit service in CI. Tests inject a fake `EmailSender`.
- Making the console adapter print the email body in development. Mailpit supersedes it.
- Wrapping invite sends in a try/catch, which is existing behaviour.

## Decisions expected

- Which catcher (D-01)
- How the backend delivers to it (D-02)
- Where it may be enabled (D-03)
- What the local defaults are (D-04)

## Phases

### Phase 0 — Kit and branch

### Phase 1 — Adapter and config

`MailpitEmailSender` follows `ResendEmailSender`, with `fetch` injectable for tests. In
`zodEnv.ts`: the enum value, `MAILPIT_URL`, and the refusal in the ADR-0036 `superRefine`. A
`buildEmailSender` branch in `feature.ts`.

### Phase 2 — Local stack

The `docker-compose.yml` and `.env.example` changes. Both are protected files, so they are handed
over as patches.

### Phase 3 — Docs

A new how-to for reading outbound email, plus configuration reference, getting-started, frontend
handoff, C4 diagrams, the refused-set listings, and ADR-0048.

## Risks and trade-offs

- **Tied to Mailpit.** The adapter speaks Mailpit's API, not SMTP. Swapping catchers means a new
  adapter; that is accepted in exchange for no new dependency.
- **The Compose `app` fails invites if `mailpit` is down.** It is mitigated by `depends_on`, and the
  code default for development stays `console`.

## Rollback

Code and config only. Revert the merge; the Compose `app` falls back to `console`.

## Security and data

The adapter is refused in production at startup (ADR-0036 pattern). It sends full email bodies,
tokens included, to Mailpit, which is on the developer's machine and is the point of the change.
Nothing new is logged. The adapter logs failures with the subject and reason only: never the
body, and never the recipient, which is PII.

## References

- `src/features/shared/auth/infrastructure/providers/ResendEmailSender.ts` — the adapter pattern
- `src/config/zodEnv.ts` — the ADR-0036 refusal block
- ADR-0010 (adapter selected by `EMAIL_PROVIDER`), ADR-0036 (production-unsafe switches), ADR-0042
  (VPS Compose topology)
