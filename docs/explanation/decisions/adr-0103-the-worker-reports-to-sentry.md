# ADR-0103 — The worker reports to Sentry: once per parked job, once per channel outage

- **Status:** Accepted
- **Date:** 2026-11-28
- **Related:**
  - issue #313 (finding Y62 of the dated run of 2026-11-14; #299);
  - extends [ADR-0071](./adr-0071-sentry-11-collects-nothing-on-its-own.md) (what Sentry
    collects) to the worker;
  - builds on [ADR-0102](./adr-0102-a-channel-the-broker-closes-is-reopened.md) (a closed channel
    is reopened) and [ADR-0076](./adr-0076-promises-are-awaited-and-shutdown-has-a-deadline.md)
    (shutdown has a deadline).
- **Origin:** the owner chose, on 2026-11-28:
  - in the plan for #313: a channel failure reported once per outage, for the publisher as well as
    the consumers;
  - after its review: Sentry's `Dedupe` off in the worker, and an outage that ends only once the
    channel has stayed up 30 s.

---

## Context

The worker started no error monitor. A parked job, a channel the broker refused and a crash
reached stdout only, and the worker sends every queued email. The API ran Sentry, but its
publisher reported no broken queue either.

Since ADR-0102, a channel that cannot be set up is retried up to every 30 s. Reporting each attempt
would send an event every 30 s per channel for as long as the cause lasts.

## Decision

1. **One `Sentry.init`**, in `initSentry` (`src/utils/sentry-init.ts`). The server and the worker
   both call it, so both run under ADR-0071's data collection and scrub hooks.
   - Each event is tagged `process` (`api` or `worker`).
   - The server adds the Express integration.
   - **The unhandled-rejection integration runs in mode `none` in both processes.** Its default
     `warn` mode prints the rejection's raw stack with `console.error`, past the logger's masking.
     The event is still captured, and the entry point's own handler logs the rejection.
2. **A parked job is reported once.** All three park paths go through `RabbitMQConsumer.park`:
   the retry policy's verdict, a message with no `messageId`, and a failed retry publish. It
   writes one log line, `[RABBITMQ] Message parked.`, with `queue`, `messageId`, `reason` and
   `retryCount`, so parks can be counted from the logs.
   - **The report is tagged** with the queue, the message id and the reason, never the body.
   - **A failed retry publish** is reported as that failure, with the publish error as its cause;
     the handler's error is logged.
3. **A channel failure is reported once per outage.** It may arrive as a refused setup or as a
   broker close, on a consumer or the publisher.
   - **One report per failure:** `ReopeningChannel` sends the raw channel's `error` and the
     wrapper's `error` to one guard, so a refusal that arrives on both is one report.
   - **When the outage ends:** only once the channel has stayed up ADR-0102's 30 s window. A
     channel closed again soon after it connects, by a poisoned message say, is the same outage.
   - **A connection drop** carries no channel error, so it reports nothing.
4. **The worker runs without Sentry's `Dedupe`.** Dedupe drops an event equal to the one before it,
   whatever its tags. Two parks in a row from one cause would then be one event, and seven channels
   failing on one queue's 406 one event in all. The guard above already deduplicates channels, and
   parks are bounded by the jobs that fail. The API keeps Dedupe.
5. **The worker flushes Sentry with its logs**, through `createShutdown`'s flush
   (`buildWorkerFlush`). That flush runs after the steps whether or not they threw, and again
   when the deadline passes, so a crash's report is sent even when a close fails or hangs.
6. **A worker that fails to start** reports the error and flushes before it exits. That rejection
   is handled, so no integration captures it.

## Options considered

- **Report every failed attempt.** Rejected by the owner: noisy, and it spends the quota.
- **Report consumers only,** as the issue names. Rejected by the owner: the API's publisher was
  blind too, and that is when emails fall back to sending in process.
- **A second `Sentry.init` in `worker.ts`.** Rejected: two copies of the settings drift.
- **Keep Dedupe and record that Sentry undercounts.** Rejected by the owner after review.
- **A fingerprint per channel or per queue.** Not taken: back-to-back identical parks on one queue
  would still be dropped.
- **End an outage on every connect.** Rejected after review: a close loop would report about 120
  events per hour per channel.
- **Flush Sentry as the last shutdown step.** Rejected after review: a step that throws, or the
  deadline, skipped it.

## Consequences

- **Parked jobs are one event each.** A burst of bad jobs spends quota at the rate they park.
  Sentry still groups them into one issue per cause, with the queue and reason tags.
- **One mismatched queue reports once per channel,** since each declares the whole topology. The
  worker's consumers and its retry publisher each report once.
- **A whole-broker outage** (the connection's `disconnect`) is logged, not reported. Neither is a
  job that is retried rather than parked.
- **The API's own crash path does not flush Sentry.** That is unchanged here, and
  `flushErrorReports` makes it a short follow-up.

## Enforcement

- `__tests__/unit/utils/sentry-init.test.ts`:
  - no init without a DSN;
  - the shared settings and the `process` tag;
  - the unhandled-rejection integration in mode `none`;
  - Dedupe left out when told to.
  - `__tests__/unit/config/sentry-release.test.ts` keeps the API's options.
- `__tests__/unit/architecture.test.ts` › "Sentry is started in one place, by both entry points".
- `ReopeningChannel.test.ts`:
  - one report for a raw and a wrapper error;
  - none on repeated reopens;
  - one across a fast close loop;
  - again after the window.
- `RabbitMQConsumer.test.ts`: each park reason nacks and reports once, with its tags.
- `__tests__/unit/worker/worker-shutdown.test.ts`: the flush runs when a close step throws, and the
  logs flush when Sentry's flush fails.
- `__tests__/integration/queue/failure-paths.integration.test.ts`, against a broker: a refused
  publisher channel reports once across at least three failed attempts.
- Mutation check: without the guard, that test sees six reports.

## Links

- `src/utils/sentry-init.ts`, `src/utils/error-report.ts`, `src/worker.ts`,
  `src/worker-shutdown.ts`
- `src/shared/infrastructure/queue/ReopeningChannel.ts`, `RabbitMQConsumer.ts`
- Audit: `docs/internal/audits/saas-readiness/audit-2026-11-14.md` § 6 (Y62)
