import fs from "fs";
import path from "path";
import {
  api,
  authHeader,
  buildUserPayload,
  createCategory,
  createMetric,
  createTestUser,
} from "../helpers/test-utils.js";
import { APP_SHORT_NAME } from "@/config/app-name.js";

/**
 * Register row B-13 (kit error-envelope-residuals, D-09). The spec declares the
 * response headers of seven operations. The contract gate holds a response to
 * them, but it never reaches a success on `POST /auth/refresh` or
 * `POST /auth/switch-org` (it has no refresh cookie and no second organization),
 * and it never sends `If-None-Match`. This sends each request for real and checks
 * the response carries every header the spec says that status has.
 */
type Header = { $ref?: string; required?: boolean };
type Spec = {
  paths: Record<
    string,
    Record<
      string,
      { responses: Record<string, { headers?: Record<string, Header> }> }
    >
  >;
  components: { headers: Record<string, Header> };
};

const ROOT = path.resolve(__dirname, "../../..");
const { name: packageName } = JSON.parse(
  fs.readFileSync(path.join(ROOT, "package.json"), "utf-8"),
) as { name: string };
const spec = JSON.parse(
  fs.readFileSync(
    path.join(ROOT, "docs/reference/api", `${packageName}-openapi.json`),
    "utf-8",
  ),
) as Spec;

const REFRESH_COOKIE_NAME = `${APP_SHORT_NAME}_refresh`;

/** The header names the spec marks required on this operation's response. */
const requiredHeaders = (
  method: string,
  route: string,
  status: number,
): string[] => {
  const declared = spec.paths[route][method].responses[String(status)].headers;
  return Object.entries(declared ?? {})
    .filter(([, header]) => {
      const name = header.$ref?.split("/").pop();
      return (name ? spec.components.headers[name] : header).required === true;
    })
    .map(([name]) => name.toLowerCase());
};

const expectDeclaredHeaders = (
  res: { status: number; headers: Record<string, unknown> },
  method: string,
  route: string,
  status: number,
) => {
  expect(res.status).toBe(status);
  const required = requiredHeaders(method, route, status);
  expect(required.length).toBeGreaterThan(0);
  for (const name of required) expect(res.headers[name]).toBeDefined();
};

const refreshCookie = (res: { headers: Record<string, unknown> }) =>
  ((res.headers["set-cookie"] as string[] | undefined) ?? []).find((cookie) =>
    cookie.startsWith(`${REFRESH_COOKIE_NAME}=`),
  );

const organizationIdOf = (token: string): string =>
  JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf-8"))
    .organizationId;

describe("the response headers the spec declares are sent", () => {
  it("POST /auth/register, login, refresh and switch-org set the refresh cookie", async () => {
    const payload = buildUserPayload();
    const registered = await api.post("/api/v1/auth/register").send(payload);
    expectDeclaredHeaders(registered, "post", "/auth/register", 201);
    expect(refreshCookie(registered)).toMatch(/HttpOnly/i);

    const loggedIn = await api
      .post("/api/v1/auth/login")
      .send({ email: payload.email, password: payload.password });
    expectDeclaredHeaders(loggedIn, "post", "/auth/login", 200);
    const cookie = refreshCookie(loggedIn) as string;
    expect(cookie).toContain("Path=/api/v1/auth/refresh");
    expect(cookie).toMatch(/SameSite=Strict/i);

    const refreshed = await api
      .post("/api/v1/auth/refresh")
      .set("Cookie", cookie.split(";")[0]);
    expectDeclaredHeaders(refreshed, "post", "/auth/refresh", 200);
    expect(refreshCookie(refreshed)).toBeDefined();

    const token = loggedIn.body.data.token as string;
    const switched = await api
      .post("/api/v1/auth/switch-org")
      .set("Authorization", authHeader(token))
      .send({ organizationId: organizationIdOf(token) });
    expectDeclaredHeaders(switched, "post", "/auth/switch-org", 200);
    expect(refreshCookie(switched)).toBeDefined();
  });

  it("POST /auth/logout clears it", async () => {
    const { token } = await createTestUser();

    const res = await api
      .post("/api/v1/auth/logout")
      .set("Authorization", authHeader(token));

    expectDeclaredHeaders(res, "post", "/auth/logout", 200);
    expect(refreshCookie(res)).toMatch(new RegExp(`^${REFRESH_COOKIE_NAME}=;`));
  });

  it.each(["/analytics/dashboard", "/analytics/metrics/{metricId}"])(
    "GET %s sends the validator on the 200 and on the 304",
    async (route) => {
      const { token } = await createTestUser();
      const { category } = await createCategory(token);
      const { metric } = await createMetric(token, { categoryId: category.id });
      const url = `/api/v1${route.replace("{metricId}", metric.id)}`;
      const query = {
        start: "2025-05-01T00:00:00.000Z",
        end: "2025-05-08T00:00:00.000Z",
        bucket: "1d",
        tz: "UTC",
      };

      const first = await api
        .get(url)
        .set("Authorization", authHeader(token))
        .query(query);
      expectDeclaredHeaders(first, "get", route, 200);
      expect(first.headers["cache-control"]).toBe("private, no-cache");

      const second = await api
        .get(url)
        .set("Authorization", authHeader(token))
        .set("If-None-Match", first.headers.etag)
        .query(query);
      expectDeclaredHeaders(second, "get", route, 304);
      expect(second.text).toBe("");
    },
  );
});
