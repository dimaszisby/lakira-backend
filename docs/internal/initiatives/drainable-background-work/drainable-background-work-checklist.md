# Drainable Background Work — Checklist

## Phase 0 — Kit and branch

- [x] Branch `fix/drainable-background-work` off `dev` at `abb5831`, `--no-track`
- [x] Kit: `README.md`, plan, this checklist, `decisions.md` (D-01–D-04)
- [x] `graphify query` — server shutdown; auth feature composition

## Phase 1 — Tracker

- [x] `__tests__/unit/utils/background-tasks.test.ts` — tracks until settled; drain waits; drain
      picks up work started mid-drain; timeout resolves and reports the pending labels; a rejection
      and a synchronous throw are logged once and do not reject; a throwing logger does not reject
- [x] `src/utils/background-tasks.ts` — `runInBackground`, `drainBackgroundTasks`,
      `pendingBackgroundTaskCount`, `SHUTDOWN_DRAIN_TIMEOUT_MS`

## Phase 2 — Call sites

- [x] `__tests__/integration/api/auth-verify.test.ts` — new tests: a held-open email is awaited by
      the drain (register and resend). Shown failing against the old controller, twice: in their
      first form (a 300 ms sender) and in their final form (a gated sender), at
      `expect(drained).toBe(false)`
- [x] `src/features/shared/auth/infrastructure/http/controller.ts` — `register` and
      `resendVerification` use `runInBackground`
- [x] `__tests__/unit/features/auth/infrastructure/http/controller.test.ts` — a failing task does
      not fail the response
- [x] `src/shared/middleware/cache.ts` — cache write through `runInBackground`;
      `__tests__/unit/shared/middleware/cache.test.ts` updated for the new failure log line
- [x] `src/server.ts` `shutdown()` — drain between `server.close` and `sequelize.close()`; skipped
      on the crash paths (D-05)
- [x] `jest.setup.ts` — drain (5 s bound) before the truncate loop and in `afterAll`
- [x] `auth-verify.test.ts` — `waitForEmail` / `assertNoEmailSent` drain instead of sleeping
- [x] `grep` — the only promise chains left in `src/` request paths are the readiness probe (it is
      the response) and `RabbitMQConsumer` (tracked by its own in-flight count)

## Phase 3 — Verification beyond the gates

- [x] Full integration suite five times in a row on Node 24.21.0 — 219 passed, 5 skipped each
      time; `docker compose logs db` over the window: no `deadlock detected`, only the two known
      duplicate-key kinds
- [x] Manual shutdown runs, built server, `NODE_ENV=development`, `PORT=5055`, register then
      SIGTERM at once — see Review

## Phase 4 — Review, then fix

- [x] `code-reviewer` pass; each finding confirmed against code before acting — see Review

## Phase 5 — Docs

- [x] `docs/explanation/decisions/adr-0054-post-response-work-is-tracked-and-drained.md`
- [x] `docs/explanation/decisions/README.md` — row for ADR-0054; next free moved to ADR-0055
- [x] `decisions.md` — D-01–D-05 collapsed to pointers
- [x] `CLAUDE.md` — ADR count 53 → 54
- [x] `.claude/rules/architecture.md` § Post-response work
- [x] `.claude/rules/testing.md` § Integration Test Setup
- [x] `docs/explanation/product-requirements.md` — the graceful-shutdown line
- [x] `docs/how-to/testing/run-the-test-suites.md` — not changed: it does not describe the setup
      lifecycle
- [x] `docs/internal/todos/2026-09-25-todo-integration-parse-error-flake.md` — `TRUNCATE` part
      fixed; parse error stays open
- [x] `SAAS-BASE-CHECKLIST.md` § Top gaps item 6 — R3 fixed, pending a dated run.
      `FINAL-AUDIT-SUMMARY.md` not changed: it does not mention R1–R3
- [x] New todos — `2026-10-02-todo-durable-email-delivery.md`,
      `2026-10-02-todo-no-floating-promises-lint.md`
- [x] Carried: `register-rate-limiter/README.md` status → merged in #127 (`abb5831`)
- [x] Carried: `2026-10-02-todo-per-ip-limiter-hardening.md` gains the frontend-proxy finding
- [x] Notion — no record: the contract and behaviour the frontend sees are unchanged

## Discovered

- [x] Found: the development log format prints no metadata, so a drain-timeout warning named
      nothing → in scope; the labels and the error message are in the message text too
- [x] Found: `server.close()` has no bound and `shutdown` has no re-entry guard (review) → out of
      scope, filed as `docs/internal/todos/2026-10-02-todo-shutdown-hardening.md`
- [x] Found: draining on the uncaught-exception path keeps a broken process running → in scope,
      D-05

## Acceptance

- [x] AC-1 — `auth-verify.test.ts` › background work is drainable (register, resend)
- [x] AC-2 — the same tests, failing on the old controller; `jest.setup.ts`; five clean runs
- [x] AC-3 — `background-tasks.test.ts` › drain gives up after the timeout; the manual runs
- [x] AC-4 — `background-tasks.test.ts` › rejected task, synchronous throw, throwing logger;
      `controller.test.ts` › answers 200 even when the verification email fails
- [x] AC-5 — existing register and resend tests unchanged in status and body; OpenAPI gate, no
      spec diff
- [x] AC-6 — no `setTimeout` left in `auth-verify.test.ts`
- [x] AC-7 — `grep` above; `.claude/rules/architecture.md` § Post-response work

## Gates

Final tree, Node 24.21.0, 2026-10-02.

- [x] typecheck — pass
- [x] lint — pass
- [x] format — pass
- [x] tests — unit 675 pass (666 + 8 tracker + 1 controller); integration 219 pass (217 + 2), 5
      skipped
- [x] build — pass
- [x] OpenAPI — pass; no spec change
- [x] security delta — skipped, no dependency change

## Review

**Manual shutdown runs.**

- Normal (`EMAIL_PROVIDER=console`): `Waiting for 1 background task(s)...`, the email line about
  30 ms later, then `Closing database connection...`; exit 0. Repeated on the final build.
- Mail host unreachable (`EMAIL_PROVIDER=mailpit`, `MAILPIT_URL` on a non-routable address):
  the wait line, the drain-timeout warning exactly 10 s later, then the connections closed; exit 0.
- The runs left three users named `r3drain<timestamp>` in the local development database.

**`code-reviewer` pass:** 0 critical, 4 warnings, 6 suggestions.

- Draining on the crash paths adds up to 10 s of work on a process in an unknown state —
  confirmed; `shutdown` now drains only when `exitCode === 0` (D-05). Not covered by an automated
  test: `shutdown` ends in `process.exit`.
- Failure logs lost the old message strings and, for the cache write, the error's stack —
  confirmed. The failure line now carries the error message in its text and `errorName` and
  `stack` in its metadata. The changed strings are recorded in ADR-0054 § Consequences.
- The controller test would have passed if the task never ran — confirmed; it now asserts the use
  case was called.
- The 300 ms sender could race a slow machine — confirmed as a risk; replaced with a gated sender
  and re-proven against the old controller.
- The setup's drain had no timeout, so a stuck task would surface as a bare Jest timeout —
  confirmed; bounded at 5 s, which logs the label.
- A throwing logger inside the failure handler could become an unhandled rejection — confirmed as
  possible; a terminal catch and a test cover it.
- `server.close()` is unbounded, and `shutdown` can run twice — both confirmed, both older than
  this change; filed as `2026-10-02-todo-shutdown-hardening.md`.
- The drain's return value was described as "abandoned" though the tasks stay tracked — comment
  corrected.
- An SMTP error message can contain the recipient — not changed: the old code logged the same
  message, and `RequestEmailVerification` catches send errors itself before they reach the tracker.
- Confirmed by the reviewer: no task can be left in the map, the drain cannot spin, the timer is
  always cleared, request-id context is kept, the meta keys are not redacted by accident, and no
  other untracked post-response promise exists in `src/`.
