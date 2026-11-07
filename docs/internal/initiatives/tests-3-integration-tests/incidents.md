# Integration Tests Incidents

Use this log to capture flaky or failing integration-test behavior that escapes local verification or mainline CI. Every entry should document:

1. **Title & date**
2. **Detected by** (CI job, developer machine, contract stage, etc.)
3. **Impact/symptoms** (HTTP routes affected, stack traces)
4. **Root cause**
5. **Remediation** (code fixes, new suites, env changes)
6. **Follow-up** (checklist item, ADR, ticket link)

## Template

```md
## YYYY-MM-DD – <short summary>

- **Detected by:** (CI job / developer / contract suite)
- **Suites:** `__tests__/integration/...`
- **Logs:** `text ... `
- **Root cause:** <explain>
- **Remediation:** <code/docs/tests>
- **Follow-up:** <link to PR, checklist, ADR, TODO>
```

_No incidents logged yet._

## 2026-01-13 – Integration flake handling playbook published

- **Detected by:** Documentation review (no active incident)
- **Suites:** `__tests__/integration/**`
- **Logs:** _Process entry only; no runtime logs captured._
- **Root cause:** Previous phases lacked a documented response plan for intermittent CI flakes, leading to ad-hoc triage.
- **Remediation:** Established the following workflow:
  1. Retry the failing suite once locally using `npm run integration:local`; if the flake reproduces, capture logs/artifacts.
  2. If the failure disappears locally, re-run the CI job a single time and link artifacts in this log.
  3. After two consecutive failures, open an incident entry referencing the offending spec, owner, and remediation commit.
  4. Assign ownership to the feature DRI (@dimaspramudya) with Codex support for reproduction/migrations.
- **Follow-up:** Quarterly KPI reviews (first work week of Mar/Jun/Sep/Dec) examine flake counts + runtime deltas; notes captured in `docs/internal/initiatives/tests-3-integration-tests/metrics-tracker.md`.
