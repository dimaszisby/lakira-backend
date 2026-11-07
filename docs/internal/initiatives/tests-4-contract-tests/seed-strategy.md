# Contract Test Seed Strategy – Lakira Backend

## Purpose

Provide a deterministic dataset for Postman/Newman and Schemathesis runs so assertions that depend on categories, metrics, and logs remain stable across local, CI, and staging environments.

## Seed Script Blueprint

- **Location:** `scripts/seed-contract-tests.ts` (Node/TypeScript, invoked via `npm run seed:contract-tests`).
- **Execution flow:**
  1. Loads `.env.test` via `dotenv -e .env.test -- …`.
  2. Truncates `metric_logs`, `metric_settings`, `metrics`, `metric_categories`, `users` within a single transaction.
  3. Creates deterministic fixtures:
     - **Users:** primary (`contract-primary@lakira.dev`, password `ContractPrimary!123`) and secondary (`contract-secondary@lakira.dev`, password `ContractSecondary!123`).
     - **Categories:** Revenue (`💰`, `#F59E0B`) and Productivity (`⚙️`, `#6366F1`).
     - **Metrics & Settings:**
       - Revenue metric (Monthly Recurring Revenue) with active goal/timeframe + alert configuration.
       - Productivity metric (Daily Active Builders) prioritized second on dashboard.
     - **Metric Logs:** two entries per metric (oldest + latest) to drive analytics stats, cache headers, and CRUD tests.
  4. Signs JWTs for each user and writes everything to `tmp/contract-seed.json`:
     ```json
     {
       "generatedAt": "2026-01-14T07:48:00.000Z",
       "primaryUser": {
         "id": "11111111-aaaa-4aaa-8aaa-000000000001",
         "email": "contract-primary@lakira.dev",
         "password": "ContractPrimary!123",
         "token": "..."
       },
       "secondaryUser": { "...": "..." },
       "categories": {
         "revenue": { "id": "…" },
         "productivity": { "id": "…" }
       },
       "metrics": {
         "revenue": {
           "id": "55555555-eeee-4eee-8eee-000000000005",
           "settingsId": "77777777-aaaa-4aaa-8aaa-000000000007",
           "latestLogId": "99999999-cccc-4ccc-8ccc-000000000009"
         },
         "productivity": { "...": "..." }
       }
     }
     ```
  5. (Planned) Wire this script into CI (`scripts/test-ci.sh`) before Newman executes so every run starts from the same dataset.
  6. Remember that generated JWTs expire in 7 days; rerun the seed command to refresh `contractAuthToken` before local Newman runs.

## Environment File Mapping

Use the seed output to populate Postman environments:

- `tests/contract/postman-newman/environments/lakira-local.postman_environment.json`
- `tests/contract/postman-newman/environments/lakira-staging.postman_environment.json`

Recommended variable names:

| Variable                        | Description                                                       |
| ------------------------------- | ----------------------------------------------------------------- |
| `baseUrl`                       | `http://localhost:4000/api/v1` (local) or staging URL placeholder |
| `contractAuthToken`             | Bearer token for `contract_primary`                               |
| `contractUserId`                | UUID for primary user                                             |
| `contractSecondaryUserId`       | UUID for empty-state testing                                      |
| `categoryRevenueId`             | Category ID                                                       |
| `categoryProductivityId`        | Category ID                                                       |
| `metricRevenueId`               | Metric ID used across metrics/logs/analytics collections          |
| `metricProductivityId`          | Another metric ID                                                 |
| `metricSettingsRevenueId`       | Metric settings ID for toggles                                    |
| `metricSettingsProductivityId`  | Secondary settings                                                |
| `metricLogRevenueLatestId`      | Latest log for deletion/detail tests                              |
| `metricLogProductivityLatestId` | Secondary log ID                                                  |

> Note: staging environment file should keep placeholder values (e.g., `"{{STAGING_CONTRACT_TOKEN}}"`) and rely on CI to inject actual tokens via Newman `--env-var`.

## Verification Steps

1. Run `npm run db:migrate:test`.
2. Execute `npm run seed:contract-tests` (writes `tmp/contract-seed.json`). This is automatically invoked when running `npm run test:contract:local` unless `SKIP_CONTRACT_SEED=true`.
3. Copy values into `tests/contract/postman-newman/environments/lakira-local.postman_environment.json`.
4. Provide staging placeholders / GitHub secrets for equivalent values.
5. (Once Newman scripts exist) run `npm run test:contract:local` to validate the seeded data drives dashboard + CRUD assertions.

## Future Enhancements

- Automate seeding inside `scripts/test-ci.sh` before Newman runs.
- Provide a Rollback script `npm run seed:contract-tests:reset` that truncates tables without reseeding.
- Mirror seeds (or a subset) in staging using a secure deploy step to keep analytics payloads consistent for CI.
