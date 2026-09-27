# Read outbound email locally

Verification, password-reset and invite flows each send a single-use token by email. Locally,
every email the API sends lands in **Mailpit**, a mail catcher with a web inbox and an HTTP API.
You never read a terminal to find a token. The decision is recorded in
[ADR-0048](../../explanation/decisions/adr-0048-mailpit-for-local-outbound-email.md).

## Start it

```bash
docker compose up -d mailpit
```

Open the inbox at **<http://localhost:8025>**.

- **The Compose `app` service** always sends to Mailpit (`EMAIL_PROVIDER=mailpit`,
  `MAILPIT_URL=http://mailpit:8025`), whatever `.env` says.
- **`npm run dev` on your machine** reads `.env`. `.env.example` ships `EMAIL_PROVIDER=mailpit`
  and `MAILPIT_URL=http://localhost:8025`. An older `.env` without them falls back to `console`.

If Mailpit is down while the API sends, the send fails: an invite returns 500, and verification
and reset log `[EMAIL:MAILPIT] failed to send email`. Start Mailpit, or set
`EMAIL_PROVIDER=console`.

## Read a token by hand

Register, request a reset or send an invite, then open the newest message in the inbox. The link
in the body carries the token: `...verify-email?token=<token>`, `...reset-password?token=<token>`,
`...invites/accept?token=<token>`. Post that value to `POST /api/v1/auth/verify-email`,
`POST /api/v1/auth/reset-password` or `POST /api/v1/invites/accept`.

## Read a token from a script or a test

Mailpit's API is documented at <http://localhost:8025/api/v1/> and in the
[Mailpit API reference](https://mailpit.axllent.org/docs/api-v1/). Two calls are enough:

```bash
# 1. Newest messages to an address (search syntax: to:, subject:, from:)
curl -s 'http://localhost:8025/api/v1/search?query=to:"tutorial@example.com"'

# 2. One message, with its Text and HTML bodies
curl -s http://localhost:8025/api/v1/message/<ID>
```

End to end, for a verify-email token:

```bash
ID=$(curl -s 'http://localhost:8025/api/v1/search?query=to:"tutorial@example.com"' \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).messages[0].ID')
TOKEN=$(curl -s "http://localhost:8025/api/v1/message/$ID" \
  | node -pe 'decodeURIComponent(JSON.parse(require("fs").readFileSync(0)).Text.match(/token=([^\s&]+)/)[1])')
curl -s -X POST http://localhost:5000/api/v1/auth/verify-email \
  -H 'Content-Type: application/json' -d "{\"token\":\"$TOKEN\"}"
```

The same shape as a Cypress helper:

```js
const tokenFor = (email, subject) =>
  cy
    .request(`http://localhost:8025/api/v1/search?query=to:"${email}"`)
    .then(({ body }) => {
      const hit = body.messages.find((m) => subject.test(m.Subject));
      return cy.request(`http://localhost:8025/api/v1/message/${hit.ID}`);
    })
    .then(({ body }) =>
      decodeURIComponent(body.Text.match(/token=([^\s&]+)/)[1]),
    );
```

Messages arrive a moment after the API responds, so poll or retry the search rather than
reading once. To start a test from an empty inbox, call `DELETE http://localhost:8025/api/v1/messages`.

## Where it is allowed

| `NODE_ENV`    | `EMAIL_PROVIDER=mailpit`                                                  | `EMAIL_PROVIDER=console`          |
| ------------- | ------------------------------------------------------------------------- | --------------------------------- |
| `development` | yes; the recommended local setting                                        | allowed; the schema default       |
| `test`        | allowed, but `.env.test.example` pins `console` so tests never need it    | allowed; the pinned test setting  |
| `staging`     | allowed, for the VPS Compose stack (ADR-0042); Render staging uses Resend | **refused at startup** (ADR-0049) |
| `production`  | **refused at startup**: the process exits before listening (ADR-0048)     | **refused at startup** (ADR-0049) |

`console` logs every email body, tokens included, so it may only run where the log stays on your
own machine.

The test suites inject a fake `EmailSender` or use `console`, and CI runs no Mailpit. Add
`EMAIL_PROVIDER=console` to your own `.env.test` if it predates this change: `loadEnv` falls back
to `.env` for anything `.env.test` leaves unset.
