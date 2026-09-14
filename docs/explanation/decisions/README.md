# Architecture decision records

One decision per file, numbered globally and ordered by the date the decision was made.
Format: [Nygard ADR](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions).

**42 records.** 25 accepted, 17 proposed.

## Reading these

- **Status is the first thing to check.** `Proposed` means the decision was written down but is
  **not implemented** — do not assume the code matches it.
- **Records are immutable.** A decision that no longer holds is superseded by a new record, not
  edited. The `Related` line links the pair in both directions.
- **`Origin` points at the kit** the decision was made in. Those kits live under
  `docs/internal/` and are removed on fork; the record here is the durable copy, and any bare
  filenames in a record's Links section are relative to that kit.

## Where the other decisions went

Of 52 entries across 19 kit-local logs, 37 were genuine architecture decisions and became
ADR-0001 through ADR-0037. The rest stayed in their kit because they are project-management
decisions — audit cadence, phase ordering, which sweep to run first — and mean nothing outside the
initiative that made them. Security audit runs keep their own `ADR-SEC-*` series, scoped to the run.

Records from ADR-0038 onward were written directly here rather than promoted from a kit log. The
twelve-factor audit, for instance, produced four decisions and no `decisions.md` — all four
constrain how the system is built, so none of them belonged in a kit.

## Records

| №                                                                                | Decision                                                               | Status       | Date       | Origin               |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------ | ---------- | -------------------- |
| [ADR-0001](./adr-0001-align-ts-path-aliases-to-repo-root.md)                     | Align TS Path Aliases to Repo Root                                     | Accepted     | 2025-02-14 | static checks        |
| [ADR-0002](./adr-0002-nodenext-specifier-strategy.md)                            | NodeNext Specifier Strategy                                            | Accepted     | 2025-02-14 | static checks        |
| [ADR-0003](./adr-0003-openapi-spec-consistency-check.md)                         | OpenAPI Spec Consistency Check                                         | Accepted     | 2025-02-14 | static checks        |
| [ADR-0004](./adr-0004-use-amqp-connection-manager.md)                            | Use `amqp-connection-manager` over raw `amqplib`                       | Accepted     | 2026-04-20 | rabbitmq             |
| [ADR-0005](./adr-0005-topic-exchange-with-parking-lot-dlx.md)                    | Topic exchange `lakira.jobs` with parking-lot DLX                      | Accepted     | 2026-04-20 | rabbitmq             |
| [ADR-0006](./adr-0006-separate-publisher-and-consumer-connections.md)            | Separate publisher and consumer connections                            | Accepted     | 2026-04-20 | rabbitmq             |
| [ADR-0007](./adr-0007-processed-messages-table-for-idempotency.md)               | `processed_messages` table for idempotency                             | Accepted     | 2026-04-20 | rabbitmq             |
| [ADR-0008](./adr-0008-hash-reset-tokens-never-store-raw.md)                      | Store SHA-256 hash of reset token, never raw                           | Accepted     | 2026-04-24 | password-reset       |
| [ADR-0009](./adr-0009-identical-response-for-known-and-unknown-emails.md)        | Identical 200 response for known and unknown emails                    | Accepted     | 2026-04-24 | password-reset       |
| [ADR-0010](./adr-0010-email-adapter-selected-by-email-provider.md)               | `EmailSender` adapter selected by `EMAIL_PROVIDER` env, not `NODE_ENV` | Accepted     | 2026-04-24 | password-reset       |
| [ADR-0011](./adr-0011-where-the-canonical-ddd-layout-lives.md)                   | Where the canonical DDD layout lives                                   | **Proposed** | 2026-05-01 | saas-readiness       |
| [ADR-0012](./adr-0012-multi-tenancy-direction-for-the-saas-base.md)              | Multi-tenancy direction for the SaaS base                              | **Proposed** | 2026-05-01 | saas-readiness       |
| [ADR-0013](./adr-0013-three-bucket-audience-taxonomy.md)                         | Three-bucket audience taxonomy: `public/`, `admin/`, `shared/`         | Accepted     | 2026-05-01 | audience restructure |
| [ADR-0014](./adr-0014-preserve-feature-import-paths-via-aliases.md)              | Preserve `@/features/<feature>/*` import paths via tsconfig aliases    | Accepted     | 2026-05-01 | audience restructure |
| [ADR-0015](./adr-0015-defer-cross-feature-import-rewrite.md)                     | Defer rewrite of cross-feature imports to audience-prefixed paths      | Accepted     | 2026-05-01 | audience restructure |
| [ADR-0016](./adr-0016-require-admin-lives-under-shared-auth.md)                  | `requireAdmin` lives under `shared/auth/infrastructure/http/`          | Accepted     | 2026-05-01 | audience restructure |
| [ADR-0017](./adr-0017-email-verification-ttl-and-anti-enumeration.md)            | 24-hour TTL + anti-enumeration response shape                          | **Proposed** | 2026-05-02 | email verification   |
| [ADR-0018](./adr-0018-verification-middleware-not-applied-to-existing-routes.md) | Verification middleware is created but NOT applied to existing routes  | **Proposed** | 2026-05-02 | email verification   |
| [ADR-0019](./adr-0019-refresh-token-storage-and-rotation.md)                     | Refresh-token storage and rotation strategy                            | **Proposed** | 2026-05-02 | jwt                  |
| [ADR-0020](./adr-0020-jwt-verification-through-tokenprovider-port.md)            | Move JWT verification through the `TokenProvider` port                 | **Proposed** | 2026-05-02 | jwt                  |
| [ADR-0021](./adr-0021-sentry-init-lifecycle.md)                                  | Sentry init lifecycle: top of server.ts, env-gated                     | **Proposed** | 2026-05-02 | observability        |
| [ADR-0022](./adr-0022-transaction-port-consolidation.md)                         | Transaction port consolidation for metric slice                        | **Proposed** | 2026-05-03 | slice migration      |
| [ADR-0023](./adr-0023-cross-feature-metric-access-provider.md)                   | Cross-feature metric-access provider: single owner vs shared           | **Proposed** | 2026-05-03 | slice migration      |
| [ADR-0024](./adr-0024-app-name-centralization.md)                                | APP_NAME centralization strategy                                       | **Proposed** | 2026-05-03 | forkability          |
| [ADR-0025](./adr-0025-billingprovider-port-over-stripe-sdk.md)                   | BillingProvider port abstraction over direct Stripe SDK                | **Proposed** | 2026-05-03 | billing              |
| [ADR-0026](./adr-0026-subscription-attaches-to-organization.md)                  | Subscription attaches to Organization, not User                        | **Proposed** | 2026-05-03 | billing              |
| [ADR-0027](./adr-0027-asynclocalstorage-for-request-correlation.md)              | AsyncLocalStorage for request correlation, not cls-rtracer             | Accepted     | 2026-05-06 | observability        |
| [ADR-0028](./adr-0028-sensitive-key-pattern-out-of-envmanager.md)                | Move SENSITIVE_KEY_PATTERN out of envManager.ts                        | Accepted     | 2026-05-06 | observability        |
| [ADR-0029](./adr-0029-fk-cascade-behaviour-on-organization-id.md)                | FK cascade behavior on `organization_id`                               | Accepted     | 2026-05-11 | multi-tenancy        |
| [ADR-0030](./adr-0030-membership-role-replaces-users-role.md)                    | Membership.role enum lives on `memberships`, replaces `users.role`     | Accepted     | 2026-05-11 | multi-tenancy        |
| [ADR-0031](./adr-0031-invite-token-format-mirrors-password-reset.md)             | Invite-token format mirrors password-reset                             | Accepted     | 2026-05-11 | multi-tenancy        |
| [ADR-0032](./adr-0032-account-lockout-redis-sliding-window.md)                   | Account lockout: Redis sliding window vs express-brute                 | Accepted     | 2026-05-18 | production readiness |
| [ADR-0033](./adr-0033-centralize-analytics-env-reads.md)                         | Centralize analytics env reads through `envManager`                    | Accepted     | 2026-05-21 | observability        |
| [ADR-0034](./adr-0034-cors-origin-allowlist.md)                                  | CORS_ORIGIN accepts a comma-separated allowlist                        | Accepted     | 2026-05-22 | saas-readiness       |
| [ADR-0035](./adr-0035-tenant-scoped-cache-keys.md)                               | Tenant scoping is required on every cache key                          | Accepted     | 2026-06-05 | saas-readiness       |
| [ADR-0036](./adr-0036-refuse-production-unsafe-env-switches.md)                  | Production-unsafe env switches must be refused at schema layer         | Accepted     | 2026-06-05 | saas-readiness       |
| [ADR-0037](./adr-0037-resolve-canonical-ddd-layout-disagreement.md)              | Resolve the canonical-DDD-layout disagreement                          | **Proposed** | 2026-06-05 | saas-readiness       |
| [ADR-0038](./adr-0038-observability-stack-as-attached-backing-service.md)        | Observability stack attaches as a backing service, not a bundle        | **Proposed** | 2026-08-17 | twelve-factor        |
| [ADR-0039](./adr-0039-release-identity-and-immutable-artifacts.md)               | Every deploy carries a release identity; the built artefact ships      | **Proposed** | 2026-08-17 | twelve-factor        |
| [ADR-0040](./adr-0040-worker-process-deployment-topology.md)                     | The worker is a first-class process type with its own deployment       | **Proposed** | 2026-08-17 | twelve-factor        |
| [ADR-0041](./adr-0041-logs-as-event-streams-on-stdout.md)                        | Logs are an event stream on stdout; the app manages no log files       | Accepted     | 2026-08-17 | twelve-factor        |
| [ADR-0042](./adr-0042-vps-compose-deployment-topology.md)                        | Production and staging run as Compose stacks on a self-managed VPS     | Accepted     | 2026-09-01 | twelve-factor        |

## Adding one

Take the next free number, copy the shape of an existing record, and open with `Status: Proposed`.
Flip to `Accepted` in the same PR that implements it — a registry full of stale `Proposed` entries
is worse than no registry, because readers cannot tell intent from fact.
