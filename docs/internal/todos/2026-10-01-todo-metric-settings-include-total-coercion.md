# Todo — `GET /metric-settings` treats `includeTotal=false` as true

- **Status:** Closed by #195 (`505a851`), branch `fix/query-values-mean-what-they-say`
  ([`query-values-mean-what-they-say`](../initiatives/query-values-mean-what-they-say/README.md),
  ADR-0075). Reproduced by a test first
- **Created:** 2026-10-01
- **Owner:** unassigned
- **Origin:** kit `list-cache-key-filters`, found while reading the settings list schema

---

## What

`metricSettingsCursorBase` (`src/features/public/metric-settings/infrastructure/http/schema.zod.ts`)
declares `includeTotal: z.coerce.boolean().default(false)`. `z.coerce.boolean` is
`Boolean(value)`, so every non-empty string is `true`. Probed on 2026-10-01: `"false"`, `"true"`
and `"0"` all parse to `true`. A client asking for no total still pays for the count query.

The metric and category list schemas use `strictBooleanQuery` for the same parameter.

## Suggested fix

Use `strictBooleanQuery` (as `metric/…/schema.zod.ts` does), add a schema unit test for `"false"`,
and regenerate the OpenAPI spec if the documented type changes.
