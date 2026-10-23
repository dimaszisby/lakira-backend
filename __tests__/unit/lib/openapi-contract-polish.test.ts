import { describe, it, expect } from "@jest/globals";
import { getOpenApiDocumentation } from "@/lib/openapi/openapi-docs.js";
import { envelopeStatus } from "@/shared/utils/error-envelope.js";

// Kit openapi-contract-polish (B-47, audit S14): the probes, the error
// envelope's status, and the 413 and 415 every body can trigger.
const METHODS = [
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "head",
  "options",
  "trace",
] as const;

type Operation = {
  tags?: string[];
  security?: unknown[];
  requestBody?: unknown;
  responses: Record<string, unknown>;
};

const operations = () => {
  const document = getOpenApiDocumentation();
  const paths = (document.paths ?? {}) as Record<
    string,
    Partial<Record<(typeof METHODS)[number], Operation>>
  >;
  return Object.entries(paths).flatMap(([route, item]) =>
    METHODS.flatMap((method) => {
      const operation = item[method];
      return operation
        ? [{ name: `${method.toUpperCase()} ${route}`, operation }]
        : [];
    }),
  );
};

const find = (name: string) => {
  const found = operations().find((o) => o.name === name);
  if (!found) throw new Error(`${name} is not in the spec`);
  return found.operation;
};

describe("OpenAPI: the probes (D-01)", () => {
  it.each(["GET /health", "GET /ready"])(
    "documents %s under Health, unauthenticated, with no 429",
    (name) => {
      const operation = find(name);
      expect(operation.tags).toEqual(["Health"]);
      expect(operation.security).toBeUndefined();
      expect(operation.responses["200"]).toBeDefined();
      expect(operation.responses["429"]).toBeUndefined();
    },
  );

  it("documents /ready's 503, the probe document outside the envelope", () => {
    expect(find("GET /ready").responses["503"]).toBeDefined();
  });
});

describe("OpenAPI: the error envelope's status (D-02)", () => {
  it("is an enum in every error component, matching envelopeStatus", () => {
    const responses = getOpenApiDocumentation().components
      ?.responses as unknown as Record<
      string,
      {
        content: {
          "application/json": {
            schema: { properties: { status: { enum?: string[] } } };
          };
        };
      }
    >;
    const codes: Record<string, number> = {
      BadRequestError: 400,
      UnauthorizedError: 401,
      ForbiddenError: 403,
      NotFoundError: 404,
      ConflictError: 409,
      PayloadTooLargeError: 413,
      UnsupportedMediaTypeError: 415,
      TooManyRequestsError: 429,
      InternalServerError: 500,
    };
    expect(Object.keys(responses).sort()).toEqual(Object.keys(codes).sort());
    for (const [name, code] of Object.entries(codes)) {
      const status =
        responses[name].content["application/json"].schema.properties.status;
      expect({ name, enum: status.enum }).toEqual({
        name,
        enum: [envelopeStatus(code)],
      });
    }
  });

  it("is an enum in RateLimitError, the schema of a limiter's own 429", () => {
    const schema = (
      getOpenApiDocumentation().components?.schemas as Record<
        string,
        { properties: { status: { enum?: string[] } } }
      >
    ).RateLimitError;
    expect(schema.properties.status.enum).toEqual([envelopeStatus(429)]);
  });
});

describe("OpenAPI: 413 and 415 (D-03)", () => {
  it("are documented on every operation that takes a body", () => {
    const withBody = operations().filter(({ operation }) =>
      Boolean(operation.requestBody),
    );
    expect(withBody.length).toBeGreaterThan(20);
    const missing = withBody
      .filter(
        ({ operation }) =>
          !operation.responses["413"] || !operation.responses["415"],
      )
      .map(({ name }) => name);
    expect(missing).toEqual([]);
  });

  it("are not documented on an operation without a body", () => {
    const extra = operations()
      .filter(({ operation }) => !operation.requestBody)
      .filter(
        ({ operation }) =>
          operation.responses["413"] || operation.responses["415"],
      )
      .map(({ name }) => name);
    expect(extra).toEqual([]);
  });

  it("point at the shared components", () => {
    const login = find("POST /auth/login");
    expect(login.responses["413"]).toEqual({
      $ref: "#/components/responses/PayloadTooLargeError",
    });
    expect(login.responses["415"]).toEqual({
      $ref: "#/components/responses/UnsupportedMediaTypeError",
    });
  });
});
