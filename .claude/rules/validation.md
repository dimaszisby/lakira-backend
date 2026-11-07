---
paths:
  - "src/**/*schema*.ts"
  - "src/constants/zod/**"
  - "src/shared/middleware/validation.ts"
  - "src/shared/utils/zod-error-formatter.ts"
---

# Validation — Zod Schemas

## Schema File Convention

Each feature's HTTP layer has a `schema.zod.ts` file defining request validation schemas.

## Reusable Base Rules (`src/constants/zod/zod-rules.ts`)

Atomic field validators use `z` prefix:

- `zUUID`, `zEmail`, `zPassword`, `zUsername` — user fields
- `zMetricName`, `zMetricDescription`, `zMetricDefaultUnit` — metric fields
- `zGoalEnabled`, `zGoalType`, `zGoalValue` — metric settings
- `zPositiveFloat`, `zLogType` — metric log fields
- `zDateOptional`, `zISODateTime`, `zISODate`, `zISOTime` — date/time

Composite request schemas use descriptive names (no `z` prefix):

- `createUserBody`, `updateMetricSchema`, `listMetricsQuery`

## Error Messages (`src/constants/zod/zod-messages.ts`)

All Zod error messages are centralized in `ZodMessages` object, organized by domain:

- `ZodMessages.common.*` — shared (UUID, date)
- `ZodMessages.user.*` — auth-related
- `ZodMessages.metric.*` — metric fields
- `ZodMessages.metricSettings.*` — settings fields
- `ZodMessages.metricLog.*` — log fields

Always reference `ZodMessages` instead of inline error strings.

## Validation Middleware

`validate(schema)` from `src/shared/middleware/validation.ts`:

- Accepts a schema bag `{ body?, query?, params? }` or a single `ZodTypeAny`
- Parses input and attaches result to `req.validated`
- On failure: returns 400 with field-level errors via `formatZodIssues()`

The project is on zod 4 and answers in zod 3's words (ADR-0083):

- **Every parse passes `{ error: zod3Messages }`** (`src/shared/utils/zod3-messages.ts`):
  `validate`, `pickValidated` and `buildEnv` do. A new parse site that leaves it out answers in
  zod 4's wording. A message set in the schema still wins
- `formatZodIssues` names the fields of a union's closest object option rather than the union
  itself, and keeps only the type error of a field that failed its type
- **A default a transform follows is `.prefault(...)`**: zod 4's `.default` returns its value
  without parsing it. A `.default` inside `.optional()` still applies in zod 4, so an update
  schema takes the undefaulted object (`zDisplayOptionsObject`), never a defaulted one made optional
- A union that includes `z.undefined()` is not an optional key in zod 4; add `.optional()`

## OpenAPI Integration

- `extendZodWithOpenApi(z)` must be called before defining schemas
- Chain `.openapi({ format, pattern, example })` on Zod schemas for OpenAPI metadata
- A request UUID is `.guid()` (zod 3's check; zod 4's `.uuid()` follows RFC 9562), plus `.regex()`
  with the explicit pattern for OpenAPI 3.1, and `format: "uuid"` in `.openapi()`, which `.guid()`
  does not emit
- Generated spec: `docs/reference/api/lakira-backend-openapi.json`
