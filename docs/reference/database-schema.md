# Database schema

PostgreSQL. Managed by Sequelize migrations in `src/migrations/`.

**As of migration `20260816000001-drop-duplicate-org-fks-and-orphan-enums.cjs` (27 applied).**
Verified by introspecting a migrated database (re-checked 2026-09-24), not by reading migration files.

All timestamps are `timestamptz`. `created_at` / `updated_at` default to `now()`.
Tables with `deleted_at` are Sequelize-paranoid (soft delete).

> Regenerate the ground truth for this document with:
>
> ```bash
> docker compose up -d db && npm run db:migrate:test
> docker exec postgres_db psql -U lakira_user -d lakira_test_db -c '\d+ <table>'
> ```

---

## Tenancy model

`organizations` is the unit of isolation. Every domain table carries a
`organization_id uuid NOT NULL`, and `memberships` joins users to organizations with a role.
A user may belong to several organizations with a different role in each — which is why role
lives on the join, not on `users`.

```
users ──< memberships >── organizations
                              │
                              ├──< metrics ──< metric_logs
                              │        └─────< metric_settings
                              ├──< metric_categories
                              └──< organization_invites
```

---

## Identity & access

### `users`

| Column                      | Type         | Null | Default              | Notes               |
| --------------------------- | ------------ | ---- | -------------------- | ------------------- |
| `id`                        | uuid         | no   | `uuid_generate_v4()` | PK                  |
| `username`                  | varchar(255) | no   |                      | unique              |
| `email`                     | varchar(255) | no   |                      | unique              |
| `password`                  | varchar(255) | no   |                      | bcrypt hash         |
| `is_public_profile`         | boolean      | no   | `true`               |                     |
| `email_verified_at`         | timestamptz  | yes  |                      | null until verified |
| `created_at` / `updated_at` | timestamptz  | no   | `now()`              |                     |
| `deleted_at`                | timestamptz  | yes  |                      | soft delete         |

There is **no `role` column** — it was dropped in `20260516000001`. Roles live on `memberships`.

### `organizations`

| Column                      | Type         | Null | Default             | Notes           |
| --------------------------- | ------------ | ---- | ------------------- | --------------- |
| `id`                        | uuid         | no   | `gen_random_uuid()` | PK              |
| `name`                      | varchar(100) | no   |                     |                 |
| `slug`                      | varchar(100) | no   |                     | unique; indexed |
| `created_at` / `updated_at` | timestamptz  | no   | `now()`             |                 |
| `deleted_at`                | timestamptz  | yes  |                     | soft delete     |

### `memberships`

| Column                      | Type        | Null | Default             | Notes                          |
| --------------------------- | ----------- | ---- | ------------------- | ------------------------------ |
| `id`                        | uuid        | no   | `gen_random_uuid()` | PK                             |
| `user_id`                   | uuid        | no   |                     | → `users` **CASCADE**          |
| `organization_id`           | uuid        | no   |                     | → `organizations` **CASCADE**  |
| `role`                      | varchar(20) | no   |                     | `owner` \| `admin` \| `member` |
| `status`                    | varchar(20) | no   | `'active'`          |                                |
| `joined_at`                 | timestamptz | no   | `now()`             |                                |
| `created_at` / `updated_at` | timestamptz | no   | `now()`             |                                |

Unique on `(user_id, organization_id)` — one membership per user per organization.

### `organization_invites`

| Column            | Type         | Null | Default             | Notes                            |
| ----------------- | ------------ | ---- | ------------------- | -------------------------------- |
| `id`              | uuid         | no   | `gen_random_uuid()` | PK                               |
| `organization_id` | uuid         | no   |                     | → `organizations` **CASCADE**    |
| `email`           | varchar(255) | no   |                     | invitee                          |
| `role`            | varchar(20)  | no   |                     | role granted on accept           |
| `token_hash`      | char(64)     | no   |                     | unique; SHA-256 of the raw token |
| `expires_at`      | timestamptz  | no   |                     |                                  |
| `accepted_at`     | timestamptz  | yes  |                     | null while pending               |

---

## Tokens

All three token tables store **only a SHA-256 hash**. The raw token exists in the delivery
email and nowhere else, so a database compromise does not yield usable tokens.

### `refresh_tokens`

| Column            | Type         | Null | Default | Notes                       |
| ----------------- | ------------ | ---- | ------- | --------------------------- |
| `id`              | uuid         | no   |         | PK                          |
| `user_id`         | uuid         | no   |         | → `users` **CASCADE**       |
| `family_id`       | uuid         | no   |         | rotation family; indexed    |
| `token_hash`      | varchar(64)  | no   |         | unique                      |
| `issued_at`       | timestamptz  | no   | `now()` |                             |
| `expires_at`      | timestamptz  | no   |         |                             |
| `revoked_at`      | timestamptz  | yes  |         |                             |
| `replaced_by_id`  | uuid         | yes  |         | → `refresh_tokens` SET NULL |
| `user_agent`      | varchar(512) | yes  |         |                             |
| `ip`              | varchar(45)  | yes  |         | fits IPv6                   |
| `organization_id` | uuid         | yes  |         | → `organizations` SET NULL  |

`family_id` + `replaced_by_id` implement rotation with reuse detection: presenting an already
replaced token means the family is compromised and the whole family is revoked.

### `password_reset_tokens` · `email_verification_tokens`

Same shape: `id`, `user_id` (**CASCADE**), `token_hash` (unique), `expires_at`, `used_at`,
timestamps. Both are indexed on `(user_id, used_at)` for the "is there a live token" lookup.
`password_reset_tokens.token_hash` is `varchar(64)`; `email_verification_tokens.token_hash` is
`char(64)` — a cosmetic inconsistency, both hold the same hex digest.

---

## Domain

### `metrics`

| Column               | Type         | Null | Default              | Notes                                       |
| -------------------- | ------------ | ---- | -------------------- | ------------------------------------------- |
| `id`                 | uuid         | no   | `uuid_generate_v4()` | PK                                          |
| `user_id`            | uuid         | no   |                      | → `users` **CASCADE**                       |
| `organization_id`    | uuid         | no   |                      | → `organizations` **RESTRICT**              |
| `category_id`        | uuid         | yes  |                      | → `metric_categories` SET NULL              |
| `original_metric_id` | uuid         | yes  |                      | → `metrics` SET NULL (public-metric copies) |
| `name`               | varchar(255) | no   |                      |                                             |
| `description`        | text         | yes  |                      |                                             |
| `default_unit`       | varchar(255) | no   |                      |                                             |
| `is_public`          | boolean      | no   | `true`               |                                             |
| `deleted_at`         | timestamptz  | yes  |                      | soft delete                                 |

Unique on `(user_id, lower(name)) WHERE deleted_at IS NULL` — names are case-insensitively
unique per user, and a soft-deleted metric frees its name.

### `metric_categories`

`id`, `user_id` (**CASCADE**), `organization_id` (**RESTRICT**), `name` varchar(255),
`color` varchar(255) default `'#E897A3'`, `icon` varchar(255) default `'📁'`, `deleted_at`.

Unique on `(user_id, lower(name)) WHERE deleted_at IS NULL`.
Also carries a trigram GIN index on `name` for fuzzy search.

### `metric_logs`

| Column            | Type                    | Null | Default              | Notes                          |
| ----------------- | ----------------------- | ---- | -------------------- | ------------------------------ |
| `id`              | uuid                    | no   | `uuid_generate_v4()` | PK                             |
| `metric_id`       | uuid                    | no   |                      | → `metrics` **CASCADE**        |
| `organization_id` | uuid                    | no   |                      | → `organizations` **RESTRICT** |
| `log_value`       | double precision        | no   |                      |                                |
| `type`            | `enum_metric_logs_type` | no   | `'manual'`           | `manual` \| `automatic`        |
| `logged_at`       | timestamptz             | no   | `now()`              |                                |

Unique on `(metric_id, logged_at)` — one reading per metric per instant.
Indexed for time-series reads, including a BRIN index on `logged_at`.

### `metric_settings`

One row per metric (unique on `metric_id`, → `metrics` **CASCADE**). Goal, time-frame, alert,
and display configuration:

| Column                         | Type                             | Null | Default                                                                      |
| ------------------------------ | -------------------------------- | ---- | ---------------------------------------------------------------------------- |
| `goal_enabled`                 | boolean                          | no   | `false`                                                                      |
| `goal_type`                    | `enum_metric_settings_goal_type` | yes  | `cumulative` \| `incremental`                                                |
| `goal_value`                   | double precision                 | yes  |                                                                              |
| `time_frame_enabled`           | boolean                          | no   | `false`                                                                      |
| `start_date` / `deadline_date` | date                             | yes  |                                                                              |
| `alert_enabled`                | boolean                          | no   | `false`                                                                      |
| `alert_thresholds`             | integer                          | yes  | `80`                                                                         |
| `is_achieved` / `is_active`    | boolean                          | no   | `false` / `true`                                                             |
| `display_options`              | jsonb                            | no   | `{"color":"#E897A3","priority":1,"chartType":"line","showOnDashboard":true}` |

---

## System

### `processed_messages`

RabbitMQ idempotency ledger. `message_id` varchar(36) **PK**, `queue` varchar(255),
`processed_at` timestamptz, `organization_id` uuid nullable (→ `organizations` SET NULL, so a
deleted organization cannot break message replay).

### `SequelizeMeta`

Migration bookkeeping. Do not modify by hand.

---

## Delete behaviour

Deleting a **user** cascades to their memberships, tokens, metrics, and categories.

Deleting an **organization** is deliberately hard:

| Referencing table                                                | On delete    | Rationale                                                                                                                                                     |
| ---------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `metrics`, `metric_logs`, `metric_settings`, `metric_categories` | **RESTRICT** | Domain data is meaningless without its org, and a single mistake must not erase a paying customer's history. Hard-deleting an org requires an explicit purge. |
| `memberships`, `organization_invites`                            | **CASCADE**  | Bookkeeping with no standalone value.                                                                                                                         |
| `refresh_tokens`, `processed_messages`                           | **SET NULL** | Must survive so sessions and message replay do not break.                                                                                                     |

Full rationale: [ADR-0029](../explanation/decisions/adr-0029-fk-cascade-behaviour-on-organization-id.md)
(originally ADR-001 in the multi-tenancy kit).

---

## Known schema defects

None open. The two found while writing this page — duplicate `organization_id` foreign keys on
the four metric tables, and the orphaned `enum_users_role` / `enum_metric_log_type` types — were
removed by `20260816000001-drop-duplicate-org-fks-and-orphan-enums.cjs`, and introspection on
2026-09-24 confirms one foreign key per table and only `enum_metric_logs_type` and
`enum_metric_settings_goal_type` remaining.
