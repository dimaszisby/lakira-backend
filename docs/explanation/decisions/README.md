# Architecture decision records

One decision per file, numbered globally and ordered by the date the decision was made.
Format: [Nygard ADR](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions).

## Reading these

- **Status is the first thing to check.** `Proposed` means the decision was written down but is
  **not implemented** — do not assume the code matches it. The Records table bolds `Proposed` and
  leaves `Accepted` plain, so how much of this registry is intent rather than fact is visible by
  scanning the column.
- **Records are immutable.** A decision that no longer holds is superseded by a new record, not
  edited. The `Related` line links the pair in both directions.
- **`Origin` points at the kit** the decision was made in, or at the audit that produced it —
  `twelve-factor` and `saas-readiness` are audit programmes, not kits. Those live under
  `docs/internal/` and are removed on fork; the record here is the durable copy, and any bare
  filenames in a record's Links section are relative to that kit.
- **New rows name the entry as well as the kit** — `rabbitmq D-03` rather than bare `rabbitmq`,
  so the reader lands on the decision instead of scanning a `decisions.md`. `D-NN` is the
  kit-local id introduced on 2026-09-19; see `.claude/rules/documentation.md`. Rows written
  before that keep the kit name alone and are **not** backfilled — they record what the entries
  were actually called at the time.

## Where the other decisions went

Of 52 entries across 19 kit-local logs, 37 were genuine architecture decisions and became
ADR-0001 through ADR-0037. The rest stayed in their kit because they are project-management
decisions — audit cadence, phase ordering, which sweep to run first — and mean nothing outside the
initiative that made them. Security audit runs keep their own `ADR-SEC-*` series, scoped to the run.

ADR-0038 to ADR-0042 were written directly here rather than promoted from a kit log. The
twelve-factor audit, for instance, produced four decisions and no `decisions.md` — all four
constrain how the system is built, so none of them belonged in a kit. From ADR-0043 on, records are
promoted from kit `D-NN` entries again (ADR-0043 from `registration-session`, ADR-0044 from
`feature-boundaries`).

## Records

| №                                                                                | Decision                                                                   | Status                 | Date       | Origin                            |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------- | ---------- | --------------------------------- |
| [ADR-0001](./adr-0001-align-ts-path-aliases-to-repo-root.md)                     | Align TS Path Aliases to Repo Root                                         | Accepted               | 2025-02-14 | static checks                     |
| [ADR-0002](./adr-0002-nodenext-specifier-strategy.md)                            | NodeNext Specifier Strategy                                                | Accepted               | 2025-02-14 | static checks                     |
| [ADR-0003](./adr-0003-openapi-spec-consistency-check.md)                         | OpenAPI Spec Consistency Check                                             | Accepted               | 2025-02-14 | static checks                     |
| [ADR-0004](./adr-0004-use-amqp-connection-manager.md)                            | Use `amqp-connection-manager` over raw `amqplib`                           | Accepted               | 2026-04-20 | rabbitmq                          |
| [ADR-0005](./adr-0005-topic-exchange-with-parking-lot-dlx.md)                    | Topic exchange `lakira.jobs` with parking-lot DLX                          | Accepted               | 2026-04-20 | rabbitmq                          |
| [ADR-0006](./adr-0006-separate-publisher-and-consumer-connections.md)            | Separate publisher and consumer connections                                | Accepted               | 2026-04-20 | rabbitmq                          |
| [ADR-0007](./adr-0007-processed-messages-table-for-idempotency.md)               | `processed_messages` table for idempotency                                 | Accepted               | 2026-04-20 | rabbitmq                          |
| [ADR-0008](./adr-0008-hash-reset-tokens-never-store-raw.md)                      | Store SHA-256 hash of reset token, never raw                               | Accepted               | 2026-04-24 | password-reset                    |
| [ADR-0009](./adr-0009-identical-response-for-known-and-unknown-emails.md)        | Identical 200 response for known and unknown emails                        | Accepted               | 2026-04-24 | password-reset                    |
| [ADR-0010](./adr-0010-email-adapter-selected-by-email-provider.md)               | `EmailSender` adapter selected by `EMAIL_PROVIDER` env, not `NODE_ENV`     | Accepted               | 2026-04-24 | password-reset                    |
| [ADR-0011](./adr-0011-where-the-canonical-ddd-layout-lives.md)                   | Where the canonical DDD layout lives                                       | **Proposed**           | 2026-05-01 | saas-readiness                    |
| [ADR-0012](./adr-0012-multi-tenancy-direction-for-the-saas-base.md)              | Multi-tenancy direction for the SaaS base                                  | Accepted               | 2026-05-01 | saas-readiness                    |
| [ADR-0013](./adr-0013-three-bucket-audience-taxonomy.md)                         | Three-bucket audience taxonomy: `public/`, `admin/`, `shared/`             | Accepted               | 2026-05-01 | audience restructure              |
| [ADR-0014](./adr-0014-preserve-feature-import-paths-via-aliases.md)              | Preserve `@/features/<feature>/*` import paths via tsconfig aliases        | Accepted               | 2026-05-01 | audience restructure              |
| [ADR-0015](./adr-0015-defer-cross-feature-import-rewrite.md)                     | Defer rewrite of cross-feature imports to audience-prefixed paths          | Accepted               | 2026-05-01 | audience restructure              |
| [ADR-0016](./adr-0016-require-admin-lives-under-shared-auth.md)                  | `requireAdmin` lives under `shared/auth/infrastructure/http/`              | Superseded by ADR-0030 | 2026-05-01 | audience restructure              |
| [ADR-0017](./adr-0017-email-verification-ttl-and-anti-enumeration.md)            | 24-hour TTL + anti-enumeration response shape                              | Accepted               | 2026-05-02 | email verification                |
| [ADR-0018](./adr-0018-verification-middleware-not-applied-to-existing-routes.md) | Verification middleware is created but NOT applied to existing routes      | Accepted               | 2026-05-02 | email verification                |
| [ADR-0019](./adr-0019-refresh-token-storage-and-rotation.md)                     | Refresh-token storage and rotation strategy                                | Accepted               | 2026-05-02 | jwt                               |
| [ADR-0020](./adr-0020-jwt-verification-through-tokenprovider-port.md)            | Move JWT verification through the `TokenProvider` port                     | Accepted               | 2026-05-02 | jwt                               |
| [ADR-0021](./adr-0021-sentry-init-lifecycle.md)                                  | Sentry init lifecycle: top of server.ts, env-gated                         | Accepted               | 2026-05-02 | observability                     |
| [ADR-0022](./adr-0022-transaction-port-consolidation.md)                         | Transaction port consolidation for metric slice                            | **Proposed**           | 2026-05-03 | slice migration                   |
| [ADR-0023](./adr-0023-cross-feature-metric-access-provider.md)                   | Cross-feature metric-access provider: single owner vs shared               | **Proposed**           | 2026-05-03 | slice migration                   |
| [ADR-0024](./adr-0024-app-name-centralization.md)                                | APP_NAME centralization strategy                                           | Accepted               | 2026-05-03 | forkability                       |
| [ADR-0025](./adr-0025-billingprovider-port-over-stripe-sdk.md)                   | BillingProvider port abstraction over direct Stripe SDK                    | **Proposed**           | 2026-05-03 | billing                           |
| [ADR-0026](./adr-0026-subscription-attaches-to-organization.md)                  | Subscription attaches to Organization, not User                            | **Proposed**           | 2026-05-03 | billing                           |
| [ADR-0027](./adr-0027-asynclocalstorage-for-request-correlation.md)              | AsyncLocalStorage for request correlation, not cls-rtracer                 | Accepted               | 2026-05-06 | observability                     |
| [ADR-0028](./adr-0028-sensitive-key-pattern-out-of-envmanager.md)                | Move SENSITIVE_KEY_PATTERN out of envManager.ts                            | Accepted               | 2026-05-06 | observability                     |
| [ADR-0029](./adr-0029-fk-cascade-behaviour-on-organization-id.md)                | FK cascade behavior on `organization_id`                                   | Accepted               | 2026-05-11 | multi-tenancy                     |
| [ADR-0030](./adr-0030-membership-role-replaces-users-role.md)                    | Membership.role enum lives on `memberships`, replaces `users.role`         | Accepted               | 2026-05-11 | multi-tenancy                     |
| [ADR-0031](./adr-0031-invite-token-format-mirrors-password-reset.md)             | Invite-token format mirrors password-reset                                 | Accepted               | 2026-05-11 | multi-tenancy                     |
| [ADR-0032](./adr-0032-account-lockout-redis-sliding-window.md)                   | Account lockout: Redis sliding window vs express-brute                     | Accepted               | 2026-05-18 | production readiness              |
| [ADR-0033](./adr-0033-centralize-analytics-env-reads.md)                         | Centralize analytics env reads through `envManager`                        | Accepted               | 2026-05-21 | observability                     |
| [ADR-0034](./adr-0034-cors-origin-allowlist.md)                                  | CORS_ORIGIN accepts a comma-separated allowlist                            | Accepted               | 2026-05-22 | saas-readiness                    |
| [ADR-0035](./adr-0035-tenant-scoped-cache-keys.md)                               | Tenant scoping is required on every cache key                              | Accepted               | 2026-06-05 | saas-readiness                    |
| [ADR-0036](./adr-0036-refuse-production-unsafe-env-switches.md)                  | Production-unsafe env switches must be refused at schema layer             | Accepted               | 2026-06-05 | saas-readiness                    |
| [ADR-0037](./adr-0037-resolve-canonical-ddd-layout-disagreement.md)              | Resolve the canonical-DDD-layout disagreement                              | **Proposed**           | 2026-06-05 | saas-readiness                    |
| [ADR-0038](./adr-0038-observability-stack-as-attached-backing-service.md)        | Observability stack attaches as a backing service, not a bundle            | **Proposed**           | 2026-08-17 | twelve-factor                     |
| [ADR-0039](./adr-0039-release-identity-and-immutable-artifacts.md)               | Every deploy carries a release identity; the built artefact ships          | **Proposed**           | 2026-08-17 | twelve-factor                     |
| [ADR-0040](./adr-0040-worker-process-deployment-topology.md)                     | The worker is a first-class process type with its own deployment           | **Proposed**           | 2026-08-17 | twelve-factor                     |
| [ADR-0041](./adr-0041-logs-as-event-streams-on-stdout.md)                        | Logs are an event stream on stdout; the app manages no log files           | Accepted               | 2026-08-17 | twelve-factor                     |
| [ADR-0042](./adr-0042-vps-compose-deployment-topology.md)                        | Production and staging run as Compose stacks on a self-managed VPS         | Accepted               | 2026-09-01 | twelve-factor                     |
| [ADR-0043](./adr-0043-session-issuance-at-every-authenticated-entry-point.md)    | Session issuance belongs to every authenticated entry point                | Accepted               | 2026-09-20 | registration-session D-01         |
| [ADR-0044](./adr-0044-feature-boundaries-and-their-frozen-exceptions.md)         | Feature boundaries, and the exceptions that are frozen rather than blessed | Accepted               | 2026-09-23 | feature-boundaries D-02/D-03/D-06 |

## Adding one

Take the next free number — **ADR-0045** as of 2026-09-24 — copy the shape of an existing record, and open with `Status: Proposed`.
Flip to `Accepted` in the same PR that implements it — a registry full of stale `Proposed` entries
is worse than no registry, because readers cannot tell intent from fact.

**Most records arrive here by promotion, not by being written here first.** A decision taken inside
an initiative starts life as a `D-NN` entry in that kit's `decisions.md`, written at the moment the
decision is taken. It is promoted to this registry only if it would still matter to someone who
never saw the initiative — token hashing, FK cascade behaviour, port boundaries, queue topology.
Decisions that only coordinate the work stay in the kit. Promote at the end of the task, once it is
clear the decision survived implementation, and leave a pointer behind: the kit entry collapses to a
link, and this record becomes authoritative. The full rule is in
[`.claude/rules/documentation.md`](../../../.claude/rules/documentation.md).

A record written directly here — with no kit behind it — is normal too: ADR-0038 to ADR-0042 came
from an audit rather than a kit log. Name the audit in `Origin`.

**Status notes.** When a record's status changes long after it was written, the change is stated in
a dated `Status note` under the header, with the evidence — the decision itself is not edited. See
the 2026-09-24 notes on ADR-0012, 0016–0021 and 0024.
