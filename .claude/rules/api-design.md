---
paths:
  - "src/features/**/http/**"
  - "src/shared/middleware/**"
---

# API Design Patterns

## Route Definition

Each feature owns its Express router via a factory function:

```typescript
function createMyRouter(feature: MyFeature): Router {
  const controller = createMyController(feature);
  const router = Router();
  router.use(authMiddleware);
  router.post(
    "/",
    userRateLimiter,
    requireJsonObjectBody(),
    validate(createSchema),
    controller.create,
  );
  router.all("/", methodNotAllowed(["POST", "GET"]));
  return router;
}
```

Export the factory, not an instance: `src/app.ts` calls `createMyRouter(feature)` at mount time,
and importing a feature must construct nothing (ADR-0045, ADR-0072).

## Middleware Pipeline Order

1. `authMiddleware` — JWT authentication and org membership (sets `req.user`, `req.organizationId`,
   `req.membership`); usually `router.use(authMiddleware)` so it runs before anything else
2. Per-route rate limiter where needed (e.g. `userRateLimiter`)
3. `requireJsonObjectBody()` — for routes that take a JSON body
4. `validate(schema)` — Zod validation
5. Controller handler (wrapped in `catchAsync()`)
6. `methodNotAllowed([...methods])` — 405 for unsupported methods
7. App-level `notFoundHandler` — JSON 404 for any route nothing matched
8. Global `errorHandler` — catches all thrown errors; framework client errors (oversized body,
   bad charset, undecodable path parameter) keep their 4xx instead of becoming a 500

## Request Types

- `AuthRequest` (`src/types/request.context.ts`) extends Express Request with `user?: UserDomain`,
  `organizationId?` and `membership?`. `validated?: unknown` is added to every Express `Request` in
  `src/types/express-aug.d.ts`
- Always use `assertAuthenticated(req)` from `src/utils/auth-guards.ts` to narrow `req.user`
- Access validated data from `req.validated`, not `req.body` / `req.query` / `req.params`

## Response Format

**Success** — return it. Use `successResponse()` from `src/utils/response-formatter.ts`:

```json
{ "status": "success", "message": "...", "data": { ... }, "success": true }
```

**Errors** — throw them. Domain and application code throws a `DomainError` subclass
(`ValidationError`, `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `ConflictError`);
HTTP-facing infrastructure code may `throw new AppError(message, statusCode)`. The global
`errorHandler` maps a kind to its status and renders the single envelope through `sendError()` in
`src/shared/utils/error-envelope.ts`. Do not hand-format an error body in a controller.

```json
// 4xx — the caller's fault
{ "status": "fail", "message": "...", "errors": [{ "field": "body.name", "message": "..." }] }

// 5xx — ours; the message is replaced with "Something went wrong!" except in development and test
{ "status": "error", "message": "..." }
```

`status` is always derived from the status code, never passed in. `errors` appears only where
there is field-level detail, and `field` is a dotted path (`"body.name"`), never an array of
segments. This is what the OpenAPI `BadRequestError` component documents.

Rate limits answer the same way: `429 {"status": "fail", "message": "..."}` with the `RateLimit-*`
headers. A new limiter goes in `src/shared/middleware/rate-limiter.ts` and spreads
`limitExceeded(message, logLine)` into its options; it never sets its own `message` or `handler`
(ADR-0057). The one body outside the envelope is the readiness probe's
`503 {"status": "degraded", "checks": {...}}`, which is a probe document, not an error.

There is no `errorResponse()` helper. One existed in `response-formatter.ts` with zero callers
and a body shape incompatible with everything the API actually sent; it was removed rather than
wired in (C3, `docs/internal/todos/2026-09-01-todo-error-envelope.md`).

## Response caching

- A cache key generator reads the request through `pickValidated(schema)(req)` — the value the
  handler queries with — never raw `req.query`. Express nests `?filter[name]=x` as
  `req.query.filter.name`, so a key built from `req.query["filter[name]"]` silently drops the
  filter (audit R2; kit `list-cache-key-filters`). Every field that changes the result is a
  segment. Examples: `src/features/public/metric/infrastructure/http/cache-keys.ts`,
  `…/metric-settings/infrastructure/http/cache-keys.ts`
- Keys are tenant-scoped through `buildCursorCacheKey` (ADR-0035), which requires an
  organization: a key generator calls `assertAuthenticated(req)` first, and its throw makes
  `cacheMiddleware` skip the cache (`architecture-boundaries` D-03). Bump the feature's
  `*_CURSOR_VERSION` when a key's meaning changes, so entries written under the old key are never
  read. It encodes every string segment, so free text cannot stand for another segment, a
  search for `_` is not the empty sentinel, and `*` never reaches a key; an id or a number comes
  out unchanged, so an invalidation pattern naming one still matches (ADR-0075). The metric-log
  keys are in `…/metric-log/infrastructure/http/cache-keys.ts`; a single resource's key names
  every value the handler checks it against, as the single-log key names its metric
- A list's `includeTotal` is `zStrictBooleanQuery` from `src/constants/zod/zod-rules.ts`: only
  `true` or `false`. `z.coerce.boolean()` reads `"false"` as true; never use it for a query value
- `cacheMiddleware` stores a response only when its status is 200, because a hit is always
  replayed as a 200. Errors are never cached (audit S1: a 404 was stored and came back as a 200).
  Do not put it on a route whose success status is anything else
- One cache layer per route: do not wrap a route in `cacheMiddleware` when its repository already
  caches (metric-category's list, through `CachedMetricCategoryRepository`). Writes invalidate the
  list namespace as `cursor:<feature>:v*:<user>:org:<org>:*`

## HTTP Status Codes

- **200**: Successful GET/PUT/DELETE
- **201**: Resource created (POST)
- **400**: Validation error, malformed JSON
- **401**: Missing or invalid JWT
- **404**: Resource not found
- **405**: Method not allowed
- **409**: Conflict (duplicate unique constraint)
- **413**: Request body larger than `REQUEST_BODY_LIMIT`
- **415**: Unsupported request charset or content encoding. The spec generator adds 413 and 415
  to every operation with a request body, so a `registerPath` call never writes them
  (`openapi-contract-polish` D-03)
- **429**: Rate limit exceeded. The spec generator adds this response to every operation
  (`getOpenApiDocumentation`), so a `registerPath` call writes a 429 only when the route has a
  limiter of its own and the text should name it. The `Health` probes are the exception: they run
  ahead of the limiter (D-01)
- **500**: Internal server error

A response header a client depends on is declared in the spec from the shared components in
`src/lib/openapi/openapi-config.ts` (`components.headers`): a route that sets or clears the
refresh cookie, or sends an `ETag`, points at one with `$ref`. A header marked `required` must be
on every response of that status, or the contract gate fails. A route that answers 304 documents
it with no body, and the `If-None-Match` request header that produces it.

## Error Handling

- Domain and application code throws a `DomainError` subclass, which says what went wrong, not
  which status to answer (ADR-0068); lint refuses `AppError` there. Middleware, controllers and
  other infrastructure may throw `AppError(message, statusCode)`
- Async handlers must be wrapped with `catchAsync()` from `src/utils/catch-async.ts`
- Global `errorHandler` dispatches: `ZodError` → 400, `AppError` → its status, `DomainError` → by
  kind (`validation` 400, `unauthorized` 401, `forbidden` 403, `not_found` 404, `conflict` 409),
  `UniqueConstraintError` → 409
- Development and test: the real message, and in development the stack trace; staging and
  production: a 5xx message is replaced with "Something went wrong!" (`error-envelope-residuals`
  D-10)

## Body Enforcement

- `requireJsonObjectBody` middleware rejects scalar payloads on POST/PUT/PATCH (must be plain object)
