# Vertical Slice Migration Ticket Triage

- Timestamp: 2025-12-02T14:20:00Z

## Tagging Instructions

- Use label `blocked-by-vertical-slice` (or equivalent in your tracker) for any ticket that must wait until its feature slice is ready.
- Reference the migration plan (`../plans/feature-vertical-slice-migration-plan.md`) in the ticket description so stakeholders understand the dependency.
- At grooming, confirm that owners listed in `domain-ownership-matrix.md` acknowledge the block and set a review date.

## Known Tickets/Docs to Flag

| Work Item                    | Location / Ticket Ref                                                                      | Blocking Reason                                                                                              | Required Phase            |
| ---------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------- |
| Endpoint Overhaul 19Jun2025  | `docs/internal/todos/endpoint_overhaul_19_jun_2025_backend_notes.md` (mirrors Jira EP-219) | Requires metric-log + metric-settings controllers to live inside their features before routes are flattened. | Phase 1 & 2 completion    |
| Metric Settings Loadout Cap  | `docs/internal/todos/metric_settings_overhaul_25_jun_2025.md` (mirrors Jira MS-104)        | New service logic should be implemented in the Metric Settings slice to reuse shared ports and caching.      | Phase 3 (metric settings) |
| Analytics Dashboards Refresh | Product backlog AN-88 (no doc yet)                                                         | Depends on metrics + logs slices exposing stable application ports.                                          | Phase 2                   |

## Follow-Up Actions

- [ ] For each ticket above, add the `blocked-by-vertical-slice` label and link back to this document.
- [ ] Update this list whenever new work collides with the migration plan.
- [ ] Remove the label once the relevant phase is marked complete in the checklist.
