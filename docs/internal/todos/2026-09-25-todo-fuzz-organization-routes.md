# Todo — the `Organizations` routes are never contract-fuzzed

- **Status:** Open
- **Created:** 2026-09-25
- **Owner:** unassigned
- **Origin:** found by the `list-user-organizations` kit, whose new route the gate did not select

---

## What

`tests/contract/schemathesis/scripts/run-local.js` passes `--include-tag` for each tag in
`DEFAULT_TAGS`:

```
Auth,Analytics,Metrics,Metric Logs,Metric Settings,Metric Categories,Trends
```

`Organizations` is not in it, so none of its 6 operations is fuzzed:

- `GET /organizations`
- `POST /organizations/{id}/invites`
- `GET /organizations/{id}/members`
- `POST /invites/accept`
- `PATCH /memberships/{id}`
- `DELETE /memberships/{id}`

`contract:local:gate` reports **37 of 47 selected**. The other 4 unselected operations are
`Admin` (1, excluded on purpose: no admin role in the seeded fixtures) and `Dummy Data` (3, no
recorded reason).

No reason is recorded for leaving `Organizations` out. The tag list was written on 2026-01-14
(`8acac3e`), and the organization routes arrived on 2026-05-17 (`f6b62e3`, #47), so it looks like
an omission rather than a decision.

## Why it is not a one-line fix

Adding the tag fuzzes routes that act on seeded data or send mail. `DELETE /memberships/{id}` and
`PATCH /memberships/{id}` need seeded membership ids in `tests/contract/hooks/seeded_ids.py`, or
every case is a 404. `POST /organizations/{id}/invites` sends through the configured
`EmailSender`. `POST /invites/accept` needs a real token or only exercises the 400 path. Each needs
a seeding or skip decision, and the gate's `Selected` figure and runtime will change.

## Suggested approach

Start with the read-only pair, `GET /organizations` and `GET /organizations/{id}/members`, using
`SCHEMATHESIS_LOCAL_ENDPOINTS`, or split the tag. Decide the write routes one at a time. Record
the new `Selected` figure in `docs/reference/api/README.md`.
