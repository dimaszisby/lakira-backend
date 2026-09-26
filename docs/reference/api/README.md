# API reference

The OpenAPI 3.1 contract is **generated from the Zod schemas that validate live requests**, so
the document and the runtime cannot disagree about shapes.

|                    |                                                                |
| ------------------ | -------------------------------------------------------------- |
| Spec               | [`lakira-backend-openapi.json`](./lakira-backend-openapi.json) |
| Swagger UI         | `GET /api/v1/docs`                                             |
| Raw spec over HTTP | `GET /api/v1/docs/openapi.json`                                |
| Base path          | `/api/v1`                                                      |
| Auth               | `Authorization: Bearer <access token>`                         |

Both docs endpoints require authentication unless `SWAGGER_REQUIRE_AUTH=false`.

## Do not hand-edit the spec

`lakira-backend-openapi.json` is a build artifact. A `.claude/hooks/protect-files.sh` guard
blocks writes to it, and CI fails if it drifts from what the generator produces.

Change the source instead:

| To change                              | Edit                                 |
| -------------------------------------- | ------------------------------------ |
| a request/response shape               | `src/lib/openapi/openapi-schemas.ts` |
| which paths and operations exist       | `src/lib/openapi/openapi-docs.ts`    |
| title, servers, tags, security schemes | `src/lib/openapi/openapi-config.ts`  |

Then regenerate:

```bash
npm run docs:openapi:generate   # writes + normalises the spec
npm run docs:openapi:check      # regenerates and fails if the result differs from HEAD
```

`docs:openapi:check` runs in CI. Committing a schema change without regenerating fails the build.
Full workflow: [`../../how-to/development/regenerate-the-openapi-spec.md`](../../how-to/development/regenerate-the-openapi-spec.md).

## Coverage

**47 documented operations** (counted from the committed spec on 2026-09-25) across `Auth` (11),
`Organizations` (6), `Metric Categories` (5), `Metrics` (5), `Metric Logs` (6), `Metric Settings`
(7), `Dummy Data` (3), `Analytics` (2), `Trends` (1) and `Admin` (1).

Two routes are served but intentionally absent from the spec. Separately, the local contract run
fuzzes only the tags in `DEFAULT_TAGS` (`tests/contract/schemathesis/scripts/run-local.js`), so
three documented tags are never fuzzed: `Admin` (1), `Organizations` (6) and `Dummy Data` (3). That
is why the gate reports 37 of 47 operations selected.

| Route                              | Why                                                                                                                                                                                |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/health`               | liveness probe, not part of the API contract                                                                                                                                       |
| `GET /api/v1/ready`                | readiness probe — pings Postgres and Redis                                                                                                                                         |
| `GET /api/v1/admin/_ping`          | documented under the `Admin` tag, which is **excluded from the contract-test tag set** — the seeded fixtures hold no admin role, so fuzzing it would only produce 403s             |
| `Organizations` tag (6 operations) | no recorded reason; the tag list predates the organization routes. Covered by integration tests only. Tracked in `docs/internal/todos/2026-09-25-todo-fuzz-organization-routes.md` |
| `Dummy Data` tag (3 operations)    | no recorded reason                                                                                                                                                                 |

## Known gaps

- ~~Error responses are under-specified.~~ Closed by caveat C3 (`75cfdaa`, #79): every operation
  now documents its `4xx`/`5xx` responses with the single error envelope. Kept here as history.
- Request validation is done by **Zod middleware**, not by the spec at runtime. The spec is
  generated _from_ the validators; it does not enforce anything itself. (`express-openapi-validator`
  was a declared dependency with zero imports and has been removed.)

## Contract testing

The spec is the input to Schemathesis property-based fuzzing in `tests/contract/schemathesis/`,
which runs in CI against a live server.
See [`../../how-to/testing/`](../../how-to/testing/).
