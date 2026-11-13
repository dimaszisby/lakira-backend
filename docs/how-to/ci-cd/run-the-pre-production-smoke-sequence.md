# Run the pre-production smoke sequence

Run this against an environment before promoting to the next one: against staging before
`staging` is merged into `main`, and against production after it deploys. It takes about a
minute. lakira-frontend runs its own half through its proxy and links to this page.

`npm run test:smoke` runs the whole sequence (ADR-0095). Four checks prove the deployed process is
healthy: release, readiness, health, and a protected route that refuses an anonymous request. Then
a session exercises one user's round trip: log in, refresh with the cookie, read, write and clean
up, log out, and see the logged-out cookie refused.

CI runs it on every staging deploy (`smoke_staging`) and against staging before every production
deploy, with the staging smoke account's credentials from the `STAGING_SMOKE_EMAIL` and
`STAGING_SMOKE_PASSWORD` secrets. Run it by hand against production after it deploys, and wherever
CI does not.

## Before you start: a smoke account, once per environment

The session logs in as a dedicated account rather than registering a fresh user each time.
Registration is limited per IP ([ADR-0053](../../explanation/decisions/adr-0053-registration-rate-limited-per-ip.md)),
sends an email, and would leave a user behind on every run.

Create the account once, with an address you control and reserve for this, and keep the password
in your password manager. It goes in the repo's GitHub secrets for the environment CI smokes
(`gh secret set STAGING_SMOKE_EMAIL`, `gh secret set STAGING_SMOKE_PASSWORD`, each of which
prompts for the value), and never in the repo, a `.env` file or a CI log. Logging in does not
require the address to be verified.

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$BASE/auth/register" \
  -H 'content-type: application/json' \
  -d "$(jq -n --arg e "$SMOKE_EMAIL" --arg p "$SMOKE_PASSWORD" \
    '{username: "smoke", email: $e, password: $p, passwordConfirmation: $p}')"
```

Expect `201`. Set the three variables first, as in the next section.

## Set up the shell

You need Node 24, and `curl` and `jq` for the account and the steps by hand. Read the password
without echoing it, so it is not kept in your shell history:

```bash
BASE=https://<host>/api/v1
SMOKE_EMAIL=<the smoke account's email>
read -rs SMOKE_PASSWORD
```

## Run the sequence

```bash
SMOKE_BASE_URL=$BASE SMOKE_EXPECTED_RELEASE=<commit sha> \
  SMOKE_EMAIL=$SMOKE_EMAIL SMOKE_PASSWORD=$SMOKE_PASSWORD npm run test:smoke
unset SMOKE_PASSWORD
```

Expect `all 11 checks passed`, after a `PASS` line for each check and each session step. Leave out
`SMOKE_EXPECTED_RELEASE` when there is no commit to compare against: the release check then
reports itself as skipped, and the rest still run. Leave out both credentials to run only the four
checks; the session then reports itself skipped. Outside CI that is allowed, and in CI it fails.

The session stops at its first failing step and names it, then deletes the metric it created and
logs out. It prints no token, cookie, password or address. To see which part of a step fails, run
that step by hand, below.

## Run a step by hand

The same sequence with `curl`, for diagnosing a failure. `$JAR` holds the refresh cookie between
steps, and the access token is kept in `$TOKEN` and never printed.

```bash
JAR=$(mktemp)
```

### 1. Health, readiness, release

```bash
SMOKE_BASE_URL=$BASE SMOKE_EXPECTED_RELEASE=<commit sha> npm run test:smoke
```

Expect `all 4 checks passed`, and the session skipped.

### 2. Log in

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

### 3. Refresh with the cookie

```bash
TOKEN=$(curl -s -b "$JAR" -c "$JAR" -X POST "$BASE/auth/refresh" | jq -r '.data.token // empty')
[ -n "$TOKEN" ] && echo "refreshed" || echo "FAIL: no token"
```

Expect `refreshed`. The cookie in `$JAR` is replaced by a new one. The access token may come back
identical when it is minted in the same second as the last one; that is not a failure.

### 4. Read as the user

```bash
curl -s -H "authorization: Bearer $TOKEN" "$BASE/auth/profile" \
  | jq -r --arg e "$SMOKE_EMAIL" '"\(.status), email matches: \(.data.email == $e)"'
```

Expect `success, email matches: true`.

### 5. Write, then clean up

```bash
ID=$(curl -s -X POST "$BASE/metrics" -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d "{\"name\": \"smoke check $(date +%s)\", \"defaultUnit\": \"count\"}" \
  | jq -r '.data.id // empty')
[ -n "$ID" ] && echo "created" || echo "FAIL: not created"
curl -s -o /dev/null -w "%{http_code}\n" -X DELETE "$BASE/metrics/$ID" -H "authorization: Bearer $TOKEN"
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/metrics/$ID" -H "authorization: Bearer $TOKEN"
```

Expect `created`, then `200` for the delete, then `404`. Metrics are soft-deleted, so each run
leaves one deleted row on the smoke account. Nothing reads it. The name carries the time, so a run
that died before its delete does not make the next create answer `409`.

### 6. Log out

```bash
COOKIE=$(awk '/_refresh/ {print $6 "=" $7}' "$JAR")
curl -s -o /dev/null -w "%{http_code}\n" -H "cookie: $COOKIE" -X POST "$BASE/auth/logout"
curl -s -o /dev/null -w "%{http_code}\n" -H "cookie: $COOKIE" -X POST "$BASE/auth/refresh"
rm -f "$JAR"; unset TOKEN COOKIE SMOKE_PASSWORD
```

Expect `200`, then `401`: logout revoked the refresh token, and the same cookie is refused.

The cookie is sent by hand on purpose. Its path is `/api/v1/auth/refresh`, so a client that
honours it, as a browser and `curl -b "$JAR"` do, never sends it to `/auth/logout`, and logout
then revokes nothing. The refresh after it would still answer `401`, but only because logout
cleared the cookie from the jar, which proves nothing. That is #290 (ADR-0095).

## If a step fails

| Step | Most likely cause                                                                                                           |
| ---- | --------------------------------------------------------------------------------------------------------------------------- |
| 1    | The deploy has not finished, or a backing service is down. The suite names the failing check                                |
| 2    | A wrong password, or a lockout after repeated failures (a `429`; wait 15 minutes). A `500` is a server fault: read the logs |
| 3    | The cookie was not sent back: on staging and production it is `Secure`, so `$BASE` must be `https://`                       |
| 4    | A `401`: the token was not accepted, or the account has no active organization membership                                   |
| 5    | The database write path, or a rate limit (`429`, with `RateLimit-*` headers)                                                |
| 6    | A `200` refresh after logout means the refresh token was not revoked; report it                                             |

In CI, a failing session names its step in the `Smoke Tests (Staging Backend)` log; a missing or
wrong secret fails at step 2, and several in a row lock the account out for 15 minutes.

[Read application logs](../development/read-application-logs.md) says how to find the request by
its `x-request-id`, which every response carries.

## What it does not prove

- **The frontend's path.** It calls the API directly, not through lakira-frontend's
  `/api/proxy`. The frontend's half of the sequence covers that.
- **A browser's logout.** The session sends the refresh cookie to `/auth/logout`, which a browser
  does not (step 6).
- **Everything else.** It is one user's round trip, not a regression suite. CI's tests and the
  contract gate are that.
- **Run on your own machine,** it cannot show the `Secure` flag, which is set only when `NODE_ENV`
  is `staging` or `production`, or the refusal of plain HTTP, which is on only in production.

CI runs it on staging and leaves its result in the run. A run by hand, against production, leaves
no trace: note the result where you record the promotion.
