import { describe, it, expect } from "@jest/globals";
import { getOpenApiDocumentation } from "@/lib/openapi/openapi-docs.js";

// Kit error-envelope-residuals, D-08. The app-wide limiter sits in front of every
// router, and the spec documented its 429 on 7 of 47 operations
// (SaaS-readiness caveat C3, audit-2026-10-10 V5).
const SHARED_429 = { $ref: "#/components/responses/TooManyRequestsError" };
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

type Responses = Record<string, { $ref?: string; description?: string }>;

const operations = () => {
  const document = getOpenApiDocumentation();
  const paths = (document.paths ?? {}) as Record<
    string,
    Partial<Record<(typeof METHODS)[number], { responses: Responses }>>
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

describe("OpenAPI: the 429 every operation can answer", () => {
  it("is documented on every operation", () => {
    const all = operations();
    expect(all.length).toBeGreaterThan(40);
    const missing = all
      .filter(({ operation }) => !operation.responses["429"])
      .map(({ name }) => name);
    expect(missing).toEqual([]);
  });

  it("is the shared response where an operation wrote none", () => {
    const login = operations().find((o) => o.name === "POST /auth/login");
    expect(login?.operation.responses["429"]).toEqual(SHARED_429);
  });

  it("leaves an operation's own description alone", () => {
    const register = operations().find((o) => o.name === "POST /auth/register");
    expect(register?.operation.responses["429"].description).toContain(
      "RATE_LIMIT_REGISTER_IP_MAX",
    );
  });

  it("says in the shared response that any operation can return it", () => {
    const document = getOpenApiDocumentation();
    const shared = (
      document.components?.responses as Record<string, { description: string }>
    ).TooManyRequestsError;
    expect(shared.description).toMatch(/any operation/i);
  });
});
