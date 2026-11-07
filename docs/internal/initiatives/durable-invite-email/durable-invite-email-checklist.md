# Durable invite email — Checklist

## Phase 0 — kit and branch

- [x] `fix/durable-invite-email` cut with `--no-track` from `origin/dev` at `631108f`; HEAD and
      upstream verified
- [x] `README.md`, `durable-invite-email-plan.md`, this file
- [x] `decisions.md` D-01 to D-04

## Phase 1 — the auth feature

- [x] `OrganizationInviteRepository` and its Sequelize adapter — `save(data, tx?)`,
      `findById(id, tx?)`, `replaceTokenHash(id, hash, tx?)`, `deleteById(id)`
- [x] `InviteUserToOrganization` — takes a `MessageQueuePort` and a `TransactionPort`; publishes
      `{ inviteId }`, or saves and sends in one transaction; `executeInTransaction(inviteId, tx)`
      throws on a failed send
- [x] `application/use-cases/SendInviteEmailHandler.ts`

## Phase 2 — plumbing and wiring

- [x] `src/shared/application/messaging/job-routes.ts` — `ROUTING_KEYS.AUTH_SEND_INVITE_EMAIL`
- [x] `src/shared/infrastructure/queue/topology.ts` — `QUEUES.AUTH_SEND_INVITE_EMAIL`, declared
      through `assertWorkQueue`
- [x] `feature.ts` — the queue and the transaction port passed to the use case; the handler
      built beside it
- [x] `src/worker.ts` — a consumer for the new queue

## Phase 3 — proof

- [x] Unit tests: `InviteUserToOrganization.test.ts`, `SendInviteEmailHandler.test.ts`,
      `topology.test.ts`
- [x] `__tests__/integration/features/auth/InviteEmailQueue.integration.test.ts`
- [x] `organization-membership.test.ts` — a new queue-off rollback case

## Discovered

- [x] Found: the organization controller built its own auth feature with no publisher, so the
      invite would never have been queued → in scope: `installOrgFeature`, and `src/server.ts`
      installs one wired feature into both auth controllers
- [x] Found: the planned mutation (the worker's hash write outside the transaction) cannot fail a
      test, since every attempt overwrites the hash and the last one wins → in scope: mutated the
      three things the tests guard instead (the queue-off save outside the transaction, no delete
      after a failed publish and send, the hash never replaced); each failed a test
- [x] Found: with the queue on, a crash between the save and the publish leaves an invite nobody
      can accept, as a parked email does → recorded in ADR-0070 and B-71
- [x] Found: `AcceptInvite.test.ts` mocks the invite repository → in scope, the three new methods
      added to its mock
- [x] Found: `c4-containers.md`, `configuration.md`, `.claude/rules/architecture.md` and
      `src/composition/auth.ts` name only two queued emails → in scope, updated

## Acceptance

- [x] AC-1 — `InviteEmailQueue.integration.test.ts` › "queues the invite id only, and the worker's
      link accepts the invite"; `InviteUserToOrganization.test.ts` asserts the body is
      `{ inviteId }` exactly
- [x] AC-2 — › "queues the invite id only, and the worker's link accepts the invite"
- [x] AC-3 — › "retries a failed send, and the stored hash is the emailed token's", "parks the job
      when every attempt fails"
- [x] AC-4 — › "sends one email when the same message is delivered twice", "sends nothing for an
      invite already accepted"; `SendInviteEmailHandler.test.ts` parks malformed bodies;
      `InviteUserToOrganization.test.ts` › "sends nothing when the invite is gone / accepted /
      expired"
- [x] AC-5 — `organization-membership.test.ts` › "leaves no invite when the send fails, so a retry
      succeeds"
- [x] AC-6 — › "when the publish fails" › "sends in the request, with a link that works", "leaves
      no invite when the send fails too, so a retry succeeds"
- [x] AC-7 — the existing invite tests in `organization-membership.test.ts` pass unchanged; OpenAPI
      shows no drift

## Gates

- [x] typecheck
- [x] lint
- [x] format
- [x] tests — `test:coverage`: unit 1289 passed; integration 269 passed, 5 skipped, on a rerun
      after the B-11 flake (`Parse Error: Expected HTTP/`) failed one untouched test on the first
- [x] build
- [x] OpenAPI — no drift
- [ ] security delta — skipped: no dependency changes
- [ ] image smoke — skipped: no Dockerfile or dependency changes
