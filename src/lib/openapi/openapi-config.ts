import {
  OpenAPIRegistry,
  extendZodWithOpenApi,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { APP_DISPLAY_NAME, APP_SHORT_NAME } from "@/config/app-name.js";

extendZodWithOpenApi(z);

export const registry = new OpenAPIRegistry();

export const registerSchema = registry.register.bind(registry);

export const registerPath = registry.registerPath.bind(registry);

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: `${APP_DISPLAY_NAME} API`,
    version: "1.0.0",
    description: `API documentation for the ${APP_DISPLAY_NAME} application.`,
  },
  servers: [
    {
      url: "/api/v1",
      description: "Development server",
    },
  ],
  tags: [
    {
      name: "Auth",
      description: "User authentication and authorization operations",
    },
    {
      name: "Metric Categories",
      description: "Operations related to metric categories",
    },
    {
      name: "Metrics",
      description: "Operations related to user metrics",
    },
    {
      name: "Metric Logs",
      description: "Operations related to logging metric data",
    },
    {
      name: "Metric Settings",
      description: "Operations related to user-specific metric settings",
    },
    {
      name: "Trends",
      description: "Operations related to data trends and analysis",
    },
    {
      name: "Analytics",
      description: "Visualization and dashboard analytics endpoints",
    },
    {
      name: "Admin",
      description:
        "Organization admin/owner surface. Excluded from the default contract-test tag set — these routes require an elevated role the seeded fixtures do not hold.",
    },
  ],
  components: {
    // Response headers a client depends on, declared once and referenced by the
    // routes that send them (kit error-envelope-residuals, D-09). Until 2026-10-14
    // the spec declared no response header at all. Each is `required` because the
    // route sends it on every response that names it; the contract gate's
    // response_headers_conformance check holds the spec to that.
    headers: {
      RefreshCookie: {
        description:
          `Sets the \`${APP_SHORT_NAME}_refresh\` cookie to a new opaque refresh token. ` +
          "The cookie is `HttpOnly` and `SameSite=Strict`, scoped to `Path=/api/v1/auth/refresh`, " +
          "with `Max-Age` set to the refresh token's lifetime. `Secure` is added in staging and production. " +
          "A browser sends it to `POST /auth/refresh` only; script cannot read it.",
        required: true,
        schema: { type: "string" },
        example: `${APP_SHORT_NAME}_refresh=dGVzdC1yZWZyZXNoLXRva2Vu; Max-Age=604800; Path=/api/v1/auth/refresh; HttpOnly; SameSite=Strict`,
      },
      ClearedRefreshCookie: {
        description:
          `Clears the \`${APP_SHORT_NAME}_refresh\` cookie: an empty value with an expiry in the past, ` +
          "on the same `Path=/api/v1/auth/refresh`, `HttpOnly` and `SameSite=Strict`.",
        required: true,
        schema: { type: "string" },
        example: `${APP_SHORT_NAME}_refresh=; Path=/api/v1/auth/refresh; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Strict`,
      },
      ETag: {
        description:
          "A strong validator for the response body: a quoted digest that changes whenever the body does. " +
          "Send it back in `If-None-Match` to get a 304 when nothing changed.",
        required: true,
        schema: { type: "string" },
        example: '"mJ3k0sVw2xQ9uYtR1aBcDeFgHiJ"',
      },
      RetryAfter: {
        description:
          "How many seconds to wait before retrying. Every 429 carries it: each rate limiter sets it to the seconds left in its window, and a locked-out login to the lockout's length.",
        required: true,
        schema: { type: "integer", minimum: 0 },
        example: 900,
      },
      VisualizationCacheControl: {
        description:
          "Always `private, no-cache`: a client may store the response and must revalidate it with `If-None-Match` before each reuse.",
        required: true,
        schema: { type: "string" },
        example: "private, no-cache",
      },
    },
    securitySchemes: {
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "JWT authentication using a bearer token",
      },
    },
    // Every error body the API emits comes from `src/shared/utils/error-envelope.ts`
    // and has the shape `{ status, message, errors? }`. The components below
    // describe exactly that.
    //
    // Each declares `required` — before the C3 error-envelope work none did, and a
    // JSON Schema with no `required` and no `additionalProperties` validates `{}`
    // and `{"anything":1}` alike. Schemathesis's `response_schema_conformance`
    // check therefore passed trivially for all seven components across 46
    // operations: a gate that could not fail. `additionalProperties: false` is
    // deliberately *not* set — the handler appends `stack` in development, and
    // closing the schemas would make an additive change a breaking one.
    //
    // 405 is emitted by `method-guard.ts` and is deliberately undocumented: it is
    // only ever returned for a method/path pair that is not an operation in this
    // spec (TRACE anywhere, or e.g. DELETE /auth/login), so there is no operation
    // to hang the response on and Schemathesis never generates such a request. A
    // `MethodNotAllowedError` component would be unreferenced here and would
    // generate an unused type in lakira-frontend. The body it sends is the same
    // envelope as everything else.
    responses: {
      UnauthorizedError: {
        description: "Authentication required or invalid token",
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["status", "message"],
              properties: {
                status: { type: "string", example: "fail" },
                message: { type: "string", example: "Unauthorized" },
              },
            },
          },
        },
      },
      ForbiddenError: {
        description: "Access denied, insufficient permissions",
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["status", "message"],
              properties: {
                status: { type: "string", example: "fail" },
                message: { type: "string", example: "Forbidden" },
              },
            },
          },
        },
      },
      NotFoundError: {
        description: "Resource not found",
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["status", "message"],
              properties: {
                status: { type: "string", example: "fail" },
                message: { type: "string", example: "Resource not found" },
              },
            },
          },
        },
      },
      BadRequestError: {
        description: "Invalid request payload or parameters",
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["status", "message"],
              properties: {
                status: { type: "string", example: "fail" },
                message: { type: "string", example: "Validation failed" },
                // `field` — not `path`. The emitter
                // (`zod-error-formatter.ts`) produces a dotted string such as
                // "body.name", which is what a form needs; this component used
                // to declare `path: string[]`, a key no response has ever
                // carried. lakira-frontend generated its types from that and
                // typed a property that is always undefined.
                errors: {
                  description:
                    "Field-level detail. Present only for validation and body-shape failures.",
                  type: "array",
                  items: {
                    type: "object",
                    required: ["field", "message"],
                    properties: {
                      field: { type: "string", example: "body.name" },
                      message: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      InternalServerError: {
        description: "Internal server error",
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["status", "message"],
              properties: {
                status: { type: "string", example: "error" },
                message: { type: "string", example: "Internal Server Error" },
              },
            },
          },
        },
      },
      ConflictError: {
        description: "Resource conflict (duplicate or already exists)",
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["status", "message"],
              properties: {
                status: { type: "string", example: "fail" },
                message: { type: "string", example: "Resource already exists" },
              },
            },
          },
        },
      },
      // Every limiter answers through the shared envelope (ADR-0057). Until
      // 2026-10-03 this documented `status` as the number 429.
      TooManyRequestsError: {
        description:
          "Rate limit exceeded. Any operation can return this: an app-wide limit applies to every request, and some operations have a stricter limit of their own.",
        headers: {
          "Retry-After": { $ref: "#/components/headers/RetryAfter" },
        },
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["status", "message"],
              properties: {
                status: { type: "string", example: "fail" },
                message: {
                  type: "string",
                  example: "Too many requests, please try again later.",
                },
              },
            },
          },
        },
      },
    },
  },
};
