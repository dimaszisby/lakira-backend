import { env } from "@/config/envManager.js";
import { api, authHeader, createTestUser } from "../helpers/test-utils.js";

/**
 * C3 residuals 1 and 2 (docs/internal/initiatives/error-envelope-residuals).
 * Before the fix, an unknown route answered with Express's HTML 404, and an
 * oversized body or unsupported charset answered with a masked 500 that was
 * also reported to Sentry. Every one of these must now be the JSON envelope.
 */
describe("error envelope residuals", () => {
  describe("unknown routes", () => {
    it.each([
      ["get", "/does-not-exist"],
      ["post", "/does-not-exist"],
      ["put", "/does-not-exist"],
      ["patch", "/does-not-exist"],
      ["delete", "/does-not-exist"],
      ["get", "/api/v1/does-not-exist"],
      // A known path with a method it does not serve.
      ["delete", "/api/v1/health"],
    ] as const)(
      "%s %s answers with the JSON 404 envelope",
      async (method, url) => {
        const res = await api[method](url);

        expect(res.status).toBe(404);
        expect(res.headers["content-type"]).toMatch(/^application\/json/);
        expect(res.body).toEqual({
          status: "fail",
          message: "Route not found",
        });
      },
    );
  });

  // Discovered in review (kit D-04): Express raises a URIError with status 400
  // but no `expose` when a path parameter is not valid percent-encoding, and it
  // used to become a masked 500 and a Sentry event. Only reachable behind auth,
  // because the guard runs before the router decodes the parameter.
  // Out of scope (plan): an unknown path under an authenticated router answers
  // 401 before routing can find nothing. Pinned so a change is deliberate.
  it("answers an unknown path under an authenticated router with 401", async () => {
    const res = await api.get("/api/v1/metrics/nope/deeper");

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ status: "fail" });
  });

  describe("undecodable path parameters", () => {
    it("answers with a 400 envelope that does not echo the parameter", async () => {
      const { token } = await createTestUser();

      const res = await api
        .get("/api/v1/metrics/%zz/trends")
        .set("Authorization", authHeader(token));

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ status: "fail", message: "Malformed URL" });
    });
  });

  describe("body-parser client errors", () => {
    it("answers an oversized body with 413", async () => {
      // Twice the limit; the assertion below keeps that true if the default moves.
      expect(env.REQUEST_BODY_LIMIT).toBe("1mb");
      const oversized = JSON.stringify({
        padding: "x".repeat(2 * 1024 * 1024),
      });

      const res = await api
        .post("/api/v1/auth/login")
        .set("Content-Type", "application/json")
        .send(oversized);

      expect(res.status).toBe(413);
      expect(res.body).toEqual({
        status: "fail",
        message: "request entity too large",
      });
    });

    it("answers an unsupported charset with 415", async () => {
      const res = await api
        .post("/api/v1/auth/login")
        .set("Content-Type", "application/json; charset=koi8-r")
        .send('{"email":"a@example.com","password":"x"}');

      expect(res.status).toBe(415);
      expect(res.body).toEqual({
        status: "fail",
        message: 'unsupported charset "KOI8-R"',
      });
    });
  });
});
