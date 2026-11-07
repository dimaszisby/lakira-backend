# Keep tokens and recipients out of logs — Checklist

Lean kit: the acceptance criteria are stated here. Checked against `origin/dev` at `0a7920c`.

## Acceptance criteria

- **AC-1** — `EMAIL_PROVIDER=console` is refused at startup under `NODE_ENV=staging` and
  `production`, and allowed under `development` and `test`. The refusal tests fail with the guard
  removed. _Why:_ the adapter logs tokens, so it must never run where logs leave the machine.
- **AC-2** — A failed Resend send logs no recipient, and still throws. The test fails with `to`
  restored. _Why:_ an email address is PII under `.claude/rules/security.md`.
- **AC-3** — No adapter logs a token outside development and test: `console` is the only adapter
  that logs a body, and AC-1 confines it. _Why:_ the originating todo's finding.
- **AC-4** — Every listing of the refused set, the email configuration docs and the security rules
  state the new rule. ADR-0049 is Accepted and in the registry, ADR-0036 has a forward note, and
  the todo is closed. _Why:_ the change moves a security boundary.

## Phase 0 — Kit and branch

- [x] `fix/email-adapters-log-pii` cut with `--no-track` from `dev` at `0a7920c`
- [x] This kit: README, checklist, `decisions.md` with D-01..D-03

## Phase 1 — Code and tests

- [x] `src/config/zodEnv.ts` — `console` refused in staging and production, before the
      production-only early return
- [x] `__tests__/unit/config/zodEnv.production-guard.test.ts` — refused in staging and
      production, allowed in development and test; proven to fail with the refusal removed
- [x] `src/features/shared/auth/infrastructure/providers/ResendEmailSender.ts` — no `to` in the
      failure log; optional injected client
- [x] `__tests__/unit/features/auth/infrastructure/providers/ResendEmailSender.test.ts` — proven
      to fail with `to` restored
- [x] `src/features/shared/auth/infrastructure/providers/ConsoleEmailSender.ts` — comment on
      where it may run

## Phase 2 — Docs

- [x] ADR-0049, its registry row, the next free number (ADR-0050); dated forward notes on
      ADR-0036 and ADR-0010 (whose context said staging may override the provider)
- [x] `docs/reference/configuration.md` — Email section and the refused-set paragraph
- [x] `docs/how-to/development/read-outbound-email.md` — the "where it is allowed" table
- [x] `.claude/rules/security.md` — Sensitive Data Handling
- [x] `docs/tutorials/fork-and-rebrand.md` — refused-set list
- [x] `docs/reference/frontend-handoff.md`
- [x] `.env.example` comment patch (protected): `.git/email-adapters-log-pii-protected.patch`
- [x] The originating todo closed; `2026-09-27-todo-docker-image-sets-no-node-env.md` filed

## Discovered

- [x] Found while planning: `.env.staging` sets no `EMAIL_PROVIDER`, and `loadEnv` falls back to
      `.env` (`console` on the author's machine), so local `npm run staging` and `worker:staging`
      will refuse to start → handed over as one line for the gitignored `.env.staging`.
- [x] Found while planning: neither Dockerfile sets `NODE_ENV`, and the schema defaults it to
      `development`, so every ADR-0036 refusal is off in an image run without it → out of scope,
      filed as `docs/internal/todos/2026-09-27-todo-docker-image-sets-no-node-env.md`.
- [x] Found while testing: the existing "allows guest RabbitMQ credentials" production case
      failed locally, because `loadEnv` pulled `EMAIL_PROVIDER=console` from the developer's `.env`
      into a production env → in scope, `PRODUCTION_BASE` pins `EMAIL_PROVIDER: "resend"`, as it
      already pins other ambient values. CI has no `.env` and was never affected.
- [x] Found in the docs sweep: ADR-0010's context says staging may override the provider, and
      staging can no longer choose `console` → dated forward note on ADR-0010.

## Verification

- Both new tests fail against the old behaviour: with the refusal removed, the staging and
  production cases fail; with `to` restored, the Resend log test fails.
- Live start, Node 24.21.0: `NODE_ENV=staging` and `NODE_ENV=production` with `console` both
  exit 1 with the ADR-0049 message. `NODE_ENV=staging` with `mailpit` passes env validation and stops
  only at the unreachable staging database.
- Not run: a real Resend failure. It would send a recipient address to Resend's API; the unit test
  asserts the same log line with the client injected.

## Gates

- [x] typecheck
- [x] lint
- [x] format
- [x] tests — unit 618/618, integration 202 passed, 5 skipped
- [x] build
- [x] OpenAPI — no change, exit 0
- [ ] security delta — skipped: no dependency changes
