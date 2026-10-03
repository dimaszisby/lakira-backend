import {
  OpenAPIRegistry,
  extendZodWithOpenApi,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { APP_DISPLAY_NAME } from "@/config/app-name.js";

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
        description: "Rate limit exceeded",
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
