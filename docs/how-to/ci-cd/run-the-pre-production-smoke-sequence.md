# Run the pre-production smoke sequence

Run this against an environment before promoting to the next one: against staging before
`staging` is merged into `main`, and against production after it deploys. It takes about two
minutes. lakira-frontend runs its own half through its proxy and links to this page.

The first step is the suite CI already runs (`smoke_staging`). It proves the deployed process is
healthy, but it never logs in. The remaining steps exercise one user's round trip: log in, refresh
with the cookie, read, write and clean up, log out.

## Before you start: a smoke account, once per environment

The steps log in as a dedicated account rather than registering a fresh user each time.
Registration is limited per IP ([ADR-0053](../../explanation/decisions/adr-0053-registration-rate-limited-per-ip.md)),
sends an email, and would leave a user behind on every run.

Create the account once, with an address you control and reserve for this, and keep the password
in your password manager. It never goes in the repo, a `.env` file or a CI log. Logging in does not
require the address to be verified.

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$BASE/auth/register" \
  -H 'content-type: application/json' \
  -d "$(jq -n --arg e "$SMOKE_EMAIL" --arg p "$SMOKE_PASSWORD" \
    '{username: "smoke", email: $e, password: $p, passwordConfirmation: $p}')"
```

Expect `201`. Set the three variables first, as in the next section.

## Set up the shell

You need `curl`, `jq` and Node 24. Read the password without echoing it, so it is not kept in your
shell history:

```bash
BASE=https://<host>/api/v1
SMOKE_EMAIL=<the smoke account's email>
read -rs SMOKE_PASSWORD
JAR=$(mktemp)
```

`$JAR` holds the refresh cookie between steps. The access token is kept in `$TOKEN` and never
printed.

## 1. Health, readiness, release

```bash
SMOKE_BASE_URL=$BASE SMOKE_EXPECTED_RELEASE=<commit sha> npm run test:smoke
```

Expect `all 4 checks passed`. Leave out `SMOKE_EXPECTED_RELEASE` when there is no commit to compare
against. The release check then reports itself as skipped, and the other three still run.

## 2. Log in

```bash
TOKEN=$(curl -s -c "$JAR" -X POST "$BASE/auth/login" \
  -H 'content-type: application/json' \
  -d "$(jq -n --arg e "$SMOKE_EMAIL" --arg p "$SMOKE_PASSWORD" '{email: $e, password: $p}')" \
  | jq -r '.data.token // empty')
[ -n "$TOKEN" ] && echo "logged in" || echo "FAIL: no token"
grep -c _refresh "$JAR"
```

Expect `logged in` and `1`: the response set the refresh cookie. Add `-D -` to the `curl` to see
its flags: `HttpOnly`, `SameSite=Strict`, `Path=/api/v1/auth/refresh`, and `Secure` on staging
and production.

## 3. Refresh with the cookie

```bash
TOKEN=$(curl -s -b "$JAR" -c "$JAR" -X POST "$BASE/auth/refresh" | jq -r '.data.token // empty')
[ -n "$TOKEN" ] && echo "refreshed" || echo "FAIL: no token"
```

Expect `refreshed`. The cookie in `$JAR` is replaced by a new one. The access token may come back
identical when it is minted in the same second as the last one; that is not a failure.

## 4. Read as the user

```bash
curl -s -H "authorization: Bearer $TOKEN" "$BASE/auth/profile" \
  | jq -r --arg e "$SMOKE_EMAIL" '"\(.status), email matches: \(.data.email == $e)"'
```

Expect `success, email matches: true`.

## 5. Write, then clean up

```bash
ID=$(curl -s -X POST "$BASE/metrics" -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"name": "smoke check", "defaultUnit": "count"}' \
  | jq -r '.data.id // empty')
[ -n "$ID" ] && echo "created" || echo "FAIL: not created"
curl -s -o /dev/null -w "%{http_code}\n" -X DELETE "$BASE/metrics/$ID" -H "authorization: Bearer $TOKEN"
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/metrics/$ID" -H "authorization: Bearer $TOKEN"
```

Expect `created`, then `200` for the delete, then `404`. Metrics are soft-deleted, so each run
leaves one deleted row on the smoke account. Nothing reads it.

## 6. Log out

```bash
curl -s -o /dev/null -w "%{http_code}\n" -b "$JAR" -c "$JAR" -X POST "$BASE/auth/logout"
curl -s -o /dev/null -w "%{http_code}\n" -b "$JAR" -X POST "$BASE/auth/refresh"
rm -f "$JAR"; unset TOKEN SMOKE_PASSWORD
```

Expect `200`, then `401`: logging out cleared the cookie and revoked the refresh token.

## If a step fails

| Step | Most likely cause                                                                                                           |
| ---- | --------------------------------------------------------------------------------------------------------------------------- |
| 1    | The deploy has not finished, or a backing service is down. The suite names the failing check                                |
| 2    | A wrong password, or a lockout after repeated failures (a `429`; wait 15 minutes). A `500` is a server fault: read the logs |
| 3    | The cookie was not sent back: on staging and production it is `Secure`, so `$BASE` must be `https://`                       |
| 4    | A `401`: the token was not accepted, or the account has no active organization membership                                   |
| 5    | The database write path, or a rate limit (`429`, with `RateLimit-*` headers)                                                |
| 6    | A `200` refresh after logout means the refresh token was not revoked; report it                                             |

[Read application logs](../development/read-application-logs.md) says how to find the request by
its `x-request-id`, which every response carries.

## What it does not prove

- **The frontend's path.** It calls the API directly, not through lakira-frontend's
  `/api/proxy`. The frontend's half of the sequence covers that.
- **Everything else.** It is one user's round trip, not a regression suite. CI's tests and the
  contract gate are that.
- **Run on your own machine,** it cannot show the `Secure` flag, which is set only when `NODE_ENV`
  is `staging` or `production`, or the refusal of plain HTTP, which is on only in production.

It is run by hand. Until it is automated, a skipped run leaves no trace, so note the result where
you record the promotion.
