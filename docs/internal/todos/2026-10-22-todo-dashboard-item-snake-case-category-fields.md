# Todo — The dashboard item's category fields are snake_case

- **Status:** Open
- **Created:** 2026-10-22
- **Owner:** unassigned
- **Origin:** [`v6-small-items`](../initiatives/v6-small-items/README.md), found while renaming the
  analytics domain's SQL-named bucket type. Register row B-87

---

## What

Each item of `GET /api/v1/analytics/dashboard` carries `category_name`, `category_icon` and
`category_color`, while every other field of the item, and of the API, is camelCase (`metricId`,
`lastLogAt`). The names come from the SQL row and run through `DashboardVizItem` in
`src/features/public/analytics/domain/types.ts`, the port, and the OpenAPI schema
(`src/lib/openapi/openapi-schemas.ts`), so the frontend reads them as published.

Renaming them changes the response, so it is a contract change for lakira-frontend, not polish.

## Done when

- The owner and the frontend decide whether to rename them (with a transition, or in one release
  both repos ship together) or keep them as documented exceptions
- If renamed: the domain type, the repository mapping and the OpenAPI schema change together, and
  the spec drift gate shows the new names
