# Todo — registration issues no refresh token, so new users lose their session

- **Status:** Ready to start — this is the brief, not a plan
- **Created:** 2026-09-18
- **Owner:** unassigned
- **Prepared for:** a fresh Claude Code session — **Opus, high effort, plan mode**
- **Origin:** surfaced by the `lakira-frontend` session on 2026-09-17 and re-verified here
  2026-09-18. It is **not** in either audit; both predate it.

---

## The symptom, and why the reported fix will not work

`POST /auth/register` returns a 15-minute access token and **sets no refresh cookie**, so a newly
registered user is silently logged out when that token expires. `login`, `refresh` and `switchOrg`
all set one (`auth/infrastructure/http/controller.ts:129`, `:180`, `:257`); `register`
(`:69-96`) does not.

The frontend session reported this as _"register never calls `setRefreshCookie`"_, which reads like a
missing line in the controller. **It is not.** `RegisterUser.execute` returns `{ user, token }`
(`application/use-cases/RegisterUser.ts:75`) — there is no refresh token to set. Compare `LoginUser`,
which takes `IssueRefreshToken` as a constructor dependency (`:28`), calls it (`:51`), and returns
`rawRefreshToken` (`:58`).

So the change runs through four files at minimum: the use case, its return type, the DI wiring in
`feature.ts:102-108` (where `RegisterUser` is constructed **without** `issueRefreshToken`, unlike
`loginUser` at `:109-115`), and only then the controller.

## DECIDE THIS FIRST — it may not be a bug at all

`register` fires `requestEmailVerification` immediately after creating the user
(`controller.ts:81-89`). That is consistent with a deliberate stance: **register, then verify your
email, then log in properly.** Under that reading the defect is the opposite of what was reported —
registration should not be returning an access token either, and the frontend should route to a
"check your email" state rather than into the app.

Nobody has stated which was intended, and the two fixes are mutually exclusive:

| If registration should log you in                                                | If it should not                                     |
| -------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Add `IssueRefreshToken` to `RegisterUser`, set the cookie, keep the access token | Stop returning `token`; return the user only         |
| Session survives past 15 minutes                                                 | New users are explicitly sent to log in              |
| Matches `login`'s behaviour                                                      | Matches the email-verification flow already wired up |

**This is the user's call, not the implementer's.** Ask before building either. Getting it wrong
means shipping an auth behaviour change in the wrong direction, and auth changes are expensive to
walk back once a client depends on them.

## If the answer is "yes, log them in"

Two things to get right:

**Use `executeInTransaction`, not `execute`.** `IssueRefreshToken` exposes both
(`IssueRefreshToken.ts:28` and `:47`). `RegisterUser` currently uses **no transaction at all** —
it creates a user, an organization and a membership as separate writes. Adding a fourth write that
can fail independently makes a partial registration more likely, not less. Whether to wrap the whole
use case in one transaction is a larger question; at minimum do not add an untransacted write to an
already-untransacted sequence without saying so.

**`IssueRefreshTokenInput` wants request context** — `userAgent` and `ip` (`:8-14`). `login` passes
both from the request (`controller.ts:117-118`); `register` currently passes nothing to its use case
from `req` beyond the body. The token rows for registered users will carry nulls unless the
controller threads them through, and that degrades the refresh-token family's usefulness for session
auditing.

## The spec, and the cross-repo cost

`POST /auth/register` documents a 201 carrying a token (`openapi-docs.ts:73`). **Either answer above
changes the response**, which means:

- regenerating `docs/reference/api/lakira-backend-openapi.json`
- `lakira-frontend`'s `api-contract` CI job goes red until it runs
  `npm run api:spec:sync && npm run api:types:generate`

There is already one other pending spec change — the undocumented 304 on both `/analytics` routes
(`2026-08-31-todo-analytics-304-etag.md` § "Left undone deliberately"). **Ship them together** so the
frontend syncs once instead of twice.

## Scope

`RegisterUser.ts`, its return type, `feature.ts` DI, `controller.ts`, the OpenAPI registration, and
tests. Whether `lakira-frontend` needs a behaviour change depends on the decision above — if
registration stops returning a token, that repo needs a matching change and this todo should say so
before the backend lands.

**Out of scope:** the refresh-token rotation and family-revocation paths, which are working and
tested.

## Verification

```bash
npm run lint && npm run typecheck && npm run format:check && npm run docs:openapi:check
npm test
```

The test that proves it, whichever direction is chosen — `__tests__/integration/api/auth.test.ts`
already covers register and login, and `auth-refresh.test.ts` covers the cookie path:

- **If logging in:** register, assert a refresh cookie is set with the same attributes `login` sets,
  then exercise `POST /auth/refresh` with only that cookie and assert a fresh access token comes
  back. Asserting the cookie exists is not enough — the point is that the session actually survives.
- **If not:** assert the 201 body carries **no** token, and that the documented response no longer
  advertises one.

**Prove the negative:** the chosen test must fail against current `dev`. If it passes before the
change, it is not testing the thing.

## Conventions

- Branch: `git checkout -b fix/register-refresh-token --no-track origin/dev`
- **Verify `git rev-parse --abbrev-ref HEAD` before committing**
- Never blanket-stage; name explicit paths (a `pre-commit` hook enforces it)
- Conventional Commits; message to `.git/COMMIT_DRAFT`, validated against `.husky/commit-msg`, shown
  in chat, applied with `git commit -F .git/COMMIT_DRAFT`. Hand the user **short** commands, ideally
  with the `!` prefix so the output is visible
- No `Co-Authored-By` or Claude references in commits or PR text
- The user opens PRs and merges — do not commit, push, or open PRs
- Record the outcome as a `## Review` section appended to this file
