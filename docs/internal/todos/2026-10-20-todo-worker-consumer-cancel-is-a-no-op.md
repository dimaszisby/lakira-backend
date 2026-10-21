# Todo — the worker's consumer cancel does nothing

- **Status:** Closed by #198 (`4bfaf4e`), branch `fix/worker-cancel-and-one-connection-per-job`
  ([`worker-cancel-and-one-connection-per-job`](../initiatives/worker-cancel-and-one-connection-per-job/README.md)).
  Reproduced by a test first; a dated run is owed to confirm it
- **Created:** 2026-10-20
- **Owner:** unassigned
- **Origin:** dated SaaS-readiness run of 2026-10-20, finding X60
  ([`audit-2026-10-20.md`](../audits/saas-readiness/audit-2026-10-20.md) § 6)

---

## What

`RabbitMQConsumer.cancel()` cancels nothing. The consumer is registered with the raw channel's
`consume` inside the wrapper's `setup` (`src/shared/infrastructure/queue/RabbitMQConsumer.ts:56-63`),
so it is not in `amqp-connection-manager`'s list of consumers, and `ChannelWrapper.cancel(tag)` finds
no match and returns without error (`ChannelWrapper.js:607-616` in the library). On SIGTERM the
worker logs "Consumer cancelled" and keeps taking deliveries until `channel.close()`, which then cuts
off handlers still running. Under load the in-flight count rarely reaches zero, so every stop waits
the full 20 s drain. The unit test mocks `cancel`, so nothing caught it.

Reproduced on the dated run of 2026-10-20 against a throwaway broker: 4 s into the drain,
`rabbitmqctl list_consumers` still listed the consumer, after four "Consumer cancelled" lines.

## Suggested fix

Register the consumer through the wrapper (`channel.consume`), so `cancel` reaches it, or call
`cancel` on the raw channel kept from `setup`. Add a test against a broker that reads the consumer
list after `cancel`. B-38's worker half closes with it.
