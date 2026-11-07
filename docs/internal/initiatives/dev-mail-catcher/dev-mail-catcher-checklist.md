# Read outbound email locally with Mailpit — Checklist

## Phase 0 — Kit and branch

- [x] `feat/dev-mail-catcher` cut with `--no-track` from `dev` at `afac3f4`
- [x] This kit: README, plan, checklist, `decisions.md` with D-01..D-04

## Phase 1 — Adapter and config

- [x] `src/features/shared/auth/infrastructure/providers/MailpitEmailSender.ts`
- [x] `__tests__/unit/features/auth/infrastructure/providers/MailpitEmailSender.test.ts` — payload
      shape, non-2xx, network error; proven to fail with the error check removed
- [x] `src/config/zodEnv.ts` — `mailpit` in the `EMAIL_PROVIDER` enum, `MAILPIT_URL`, and the
      production refusal
- [x] `__tests__/unit/config/zodEnv.production-guard.test.ts` — refused in production, allowed in
      staging; proven to fail with the refusal removed
- [x] `src/features/shared/auth/feature.ts` — `mailpit` branch in `buildEmailSender`

## Phase 2 — Local stack

- [x] `docker-compose.yml` patch — `mailpit` service; `app` wired to it
- [x] `.env.example` patch — `mailpit` documented, and `MAILPIT_URL`
- [x] `.env.test.example` patch — `EMAIL_PROVIDER=console` pinned (see Discovered). All three
      files are in `.git/dev-mail-catcher-protected.patch`; the patched Compose file passes
      `docker compose config`

## Phase 3 — Docs

- [x] `docs/how-to/development/read-outbound-email.md` (new)
- [x] `docs/reference/configuration.md` — Email section; env var count wherever it is stated
- [x] `docs/tutorials/getting-started.md`
- [x] `docs/reference/frontend-handoff.md`
- [x] `docs/explanation/architecture/c4-context.md`, `c4-components-auth.md`
- [x] Every listing of the ADR-0036 refused set (`configuration.md`, `fork-and-rebrand.md`,
      `.claude/rules/security.md`), plus a dated forward note on ADR-0036. Also `CLAUDE.md` (69 to
      70 env vars, counted from the schema), `commands.md`, and the `docs/README.md` map
- [x] `docs/how-to/development/read-application-logs.md` — checked: it does not cover reading
      emails, so no change
- [x] ADR-0048, its registry row, and the next free number

## Discovered

- [x] Found: `loadEnv` falls back to `.env` for anything `.env.test` leaves unset, so a developer
      who follows the new `.env.example` would run tests with `EMAIL_PROVIDER=mailpit` → in scope,
      `.env.test.example` pins `console`. Measured: with `mailpit` forced and Mailpit down, the
      integration suite still passes (invite tests inject a fake sender; the other sends catch),
      but it logs 124 failed sends; with Mailpit up, it would fill the inbox. The pin is about
      noise and independence, not about failures.
- [x] Found: invite sends are not wrapped in a try/catch, so with the provider on `mailpit` and
      Mailpit down, an invite returns 500 (verified live) → not filed. It matches a Resend outage,
      and it is documented in the how-to.
- [x] Found in review: the new adapter's failure log copied the Resend adapter's `to` field, and
      an email address is PII under `.claude/rules/security.md` → in scope, removed from the new
      adapter. The existing `ResendEmailSender` and `ConsoleEmailSender` still log `to`, and the
      console adapter logs the full text, token included, in its JSON metadata (hidden by the dev
      format, visible in JSON) → out of scope, filed as
      `docs/internal/todos/2026-09-26-todo-email-adapters-log-pii.md`
- [x] Found: ADR-0036's table does not list `LOG_LEVEL=silly`, which the schema refuses → in scope
      as a sentence in the dated forward note; the historical table is not edited.

## Live walkthrough (2026-09-26, Node 24.21.0, Mailpit v1.31.2 via `docker run`)

Every token was read from Mailpit's API:

- register 201 → verify mail in Mailpit → `POST /auth/verify-email` 200, profile verified
- forgot-password 200 → reset mail → reset 200 → login with new password 200, old password 401
- invite 201 → invite mail → accept 200 → `GET /organizations` lists 2 (`owner*`, `member`)
- Mailpit stopped: register 201 and forgot-password 200 (caught), invite 500, 3 failures logged
- `NODE_ENV=production EMAIL_PROVIDER=mailpit`: exit 1 with the ADR-0048 message, never listened
- the server log contains no `token=`
- the how-to's bash snippet, run as written (port changed), verified a fresh account; both
  documentation URLs and `DELETE /api/v1/messages` answer 200

## Acceptance

- [x] AC-1 — live walkthrough: register, verify through Mailpit
- [x] AC-2 — live walkthrough: reset-password and invite through Mailpit
- [x] AC-3 — unit test, proven to fail without the guard; live startup refusal
- [x] AC-4 — unit tests; live send with Mailpit stopped
- [x] AC-5 — review of the how-to and reference docs
- [x] AC-6 — ADR-0048 in the registry

## Gates

- [x] typecheck
- [x] lint
- [x] format
- [x] tests — unit 612/612, integration 202 passed, 5 skipped
- [x] build
- [x] OpenAPI — no change, exit 0
- [ ] security delta — skipped: no dependency changes
