import fs from "fs";
import path from "path";

/**
 * Register row B-13 (kit error-envelope-residuals, D-09). The spec is a contract
 * another repository generates types from, and it declared no response header at
 * all: five auth routes set or clear the refresh cookie, and both analytics routes
 * send a validator and answer 304. This reads the committed spec, which
 * `docs:openapi:check` keeps equal to what the generator writes.
 */
type Header = { $ref?: string; required?: boolean; description?: string };
type Response = {
  $ref?: string;
  description?: string;
  headers?: Record<string, Header>;
  content?: unknown;
};
type Operation = {
  parameters?: { name: string; in: string; required?: boolean }[];
  responses: Record<string, Response>;
};
type Spec = {
  paths: Record<string, Record<string, Operation>>;
  components: {
    headers?: Record<string, Header>;
    responses?: Record<string, Response>;
  };
};

// Named after the package, as scripts/openapi-spec-path.js names it; that module is
// ESM-only, so the name is read here.
const ROOT = path.resolve(__dirname, "../..");
const { name: packageName } = JSON.parse(
  fs.readFileSync(path.join(ROOT, "package.json"), "utf-8"),
) as { name: string };
const spec = JSON.parse(
  fs.readFileSync(
    path.join(ROOT, "docs/reference/api", `${packageName}-openapi.json`),
    "utf-8",
  ),
) as Spec;

const ref = (name: string) => ({ $ref: `#/components/headers/${name}` });

describe("response headers in the OpenAPI spec", () => {
  it.each([
    ["/auth/register", "201"],
    ["/auth/login", "200"],
    ["/auth/refresh", "200"],
    ["/auth/switch-org", "200"],
  ])("POST %s declares the refresh cookie it sets", (route, status) => {
    expect(spec.paths[route].post.responses[status].headers).toEqual({
      "Set-Cookie": ref("RefreshCookie"),
    });
  });

  it("POST /auth/logout declares the Set-Cookie that clears it", () => {
    expect(spec.paths["/auth/logout"].post.responses["200"].headers).toEqual({
      "Set-Cookie": ref("ClearedRefreshCookie"),
    });
  });

  it("describes the cookie by name, with the attributes a client depends on", () => {
    const cookie = spec.components.headers?.RefreshCookie;

    expect(cookie?.required).toBe(true);
    expect(cookie?.description).toMatch(/`\w[\w-]*_refresh`/);
    expect(cookie?.description).toContain("HttpOnly");
    expect(cookie?.description).toContain("SameSite=Strict");
    expect(cookie?.description).toContain("/api/v1/auth/refresh");
  });

  describe.each(["/analytics/dashboard", "/analytics/metrics/{metricId}"])(
    "GET %s",
    (route) => {
      const validator = {
        ETag: ref("ETag"),
        "Cache-Control": ref("VisualizationCacheControl"),
      };

      it("declares the validator on the 200", () => {
        expect(spec.paths[route].get.responses["200"].headers).toEqual(
          validator,
        );
      });

      it("declares a 304 with the same headers and no body", () => {
        const notModified = spec.paths[route].get.responses["304"];

        expect(notModified.headers).toEqual(validator);
        expect(notModified.content).toBeUndefined();
      });

      it("declares the optional If-None-Match request header", () => {
        expect(spec.paths[route].get.parameters).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ name: "If-None-Match", in: "header" }),
          ]),
        );
        expect(
          spec.paths[route].get.parameters?.find(
            (parameter) => parameter.name === "If-None-Match",
          )?.required,
        ).not.toBe(true);
      });
    },
  );

  it("declares a response header on those seven operations and no other, 429s aside", () => {
    const withHeaders = Object.entries(spec.paths).flatMap(([route, item]) =>
      Object.entries(item)
        .filter(([, operation]) =>
          Object.entries(operation.responses ?? {}).some(
            ([status, response]) => status !== "429" && response.headers,
          ),
        )
        .map(([method]) => `${method.toUpperCase()} ${route}`),
    );

    expect(withHeaders.sort()).toEqual([
      "GET /analytics/dashboard",
      "GET /analytics/metrics/{metricId}",
      "POST /auth/login",
      "POST /auth/logout",
      "POST /auth/refresh",
      "POST /auth/register",
      "POST /auth/switch-org",
    ]);
  });

  // Register row B-27 (kit release-and-retry-after, D-02). Every path that answers 429
  // sends Retry-After: express-rate-limit sets it on every limiter, and the login lockout
  // sets it itself. The spec did not say so.
  describe("429 responses", () => {
    const resolve = (response: Response): Response => {
      const name = response.$ref?.replace("#/components/responses/", "");
      return name ? (spec.components.responses?.[name] ?? {}) : response;
    };
    const tooManyRequests = Object.entries(spec.paths).flatMap(
      ([route, item]) =>
        Object.entries(item)
          .filter(([, operation]) => operation.responses?.["429"])
          .map(
            ([method, operation]) =>
              [
                `${method.toUpperCase()} ${route}`,
                resolve(operation.responses["429"]),
              ] as const,
          ),
    );

    it("are declared on every operation", () => {
      const operations = Object.values(spec.paths).flatMap((item) =>
        Object.values(item),
      );
      expect(tooManyRequests).toHaveLength(operations.length);
    });

    it.each(tooManyRequests)("%s declares Retry-After", (_name, response) => {
      expect(response.headers).toEqual({ "Retry-After": ref("RetryAfter") });
    });

    it("describes Retry-After as a required number of seconds", () => {
      const header = spec.components.headers?.RetryAfter as Header & {
        schema?: { type?: string; minimum?: number };
      };

      expect(header?.required).toBe(true);
      expect(header?.schema).toEqual({ type: "integer", minimum: 0 });
      expect(header?.description).toMatch(/seconds/);
    });
  });
});
