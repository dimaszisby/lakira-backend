import { api, buildUserPayload, authHeader } from "../helpers/test-utils.js";
import { APP_SHORT_NAME } from "@/config/app-name.js";

const REFRESH_COOKIE_NAME = `${APP_SHORT_NAME}_refresh`;

const extractRefreshCookie = (res: any): string | undefined => {
  const cookies: string[] = res.headers["set-cookie"] ?? [];
  const match = cookies
    .map((c: string) => c.match(new RegExp(`^${REFRESH_COOKIE_NAME}=([^;]+)`)))
    .find(Boolean);
  return match?.[1];
};

const rawRefreshCookie = (res: any): string | undefined => {
  const cookies: string[] = res.headers["set-cookie"] ?? [];
  return cookies.find((c: string) => c.startsWith(`${REFRESH_COOKIE_NAME}=`));
};

// Attribute set of a Set-Cookie header, ignoring the value and the absolute
// Expires timestamp (which differs between two responses issued seconds apart).
// Max-Age survives, so an equal TTL is still compared.
const cookieAttributes = (raw: string): string[] =>
  raw
    .split(";")
    .slice(1)
    .map((part) => part.trim().toLowerCase())
    .filter((part) => !part.startsWith("expires="))
    .sort();

const registerUser = async () => {
  const payload = buildUserPayload();
  const registerRes = await api.post("/api/v1/auth/register").send(payload);
  return { registerRes, payload };
};

// Registration now issues its own session, so these tests no longer register
// and then log in purely to obtain a cookie — but the login path still needs
// exercising in its own right, so this helper stays honest about what it does.
const loginUser = async () => {
  const { payload } = await registerUser();
  const loginRes = await api.post("/api/v1/auth/login").send({
    email: payload.email,
    password: payload.password,
  });
  return { loginRes, payload };
};

describe("Auth Refresh Token Flow", () => {
  it("login sets a refresh token cookie", async () => {
    const { loginRes } = await loginUser();

    expect(loginRes.status).toBe(200);
    const cookie = extractRefreshCookie(loginRes);
    expect(cookie).toBeDefined();
    expect(cookie!.length).toBeGreaterThan(20);
  });

  it("POST /auth/refresh rotates the token and returns new access token", async () => {
    const { loginRes } = await loginUser();
    const cookie = extractRefreshCookie(loginRes)!;

    const refreshRes = await api
      .post("/api/v1/auth/refresh")
      .set("Cookie", `${REFRESH_COOKIE_NAME}=${cookie}`);

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.data).toHaveProperty("token");
    expect(refreshRes.body.data.token).toBeTruthy();

    const newCookie = extractRefreshCookie(refreshRes);
    expect(newCookie).toBeDefined();
    expect(newCookie).not.toBe(cookie);
  });

  it("reusing an already-rotated refresh token returns 401 and revokes family", async () => {
    const { loginRes } = await loginUser();
    const originalCookie = extractRefreshCookie(loginRes)!;

    const firstRefresh = await api
      .post("/api/v1/auth/refresh")
      .set("Cookie", `${REFRESH_COOKIE_NAME}=${originalCookie}`);
    expect(firstRefresh.status).toBe(200);

    const reuseRes = await api
      .post("/api/v1/auth/refresh")
      .set("Cookie", `${REFRESH_COOKIE_NAME}=${originalCookie}`);
    expect(reuseRes.status).toBe(401);

    const newCookie = extractRefreshCookie(firstRefresh)!;
    const familyRevokedRes = await api
      .post("/api/v1/auth/refresh")
      .set("Cookie", `${REFRESH_COOKIE_NAME}=${newCookie}`);
    expect(familyRevokedRes.status).toBe(401);
  });

  it("POST /auth/logout revokes the refresh token family", async () => {
    const { loginRes } = await loginUser();
    const cookie = extractRefreshCookie(loginRes)!;

    const logoutRes = await api
      .post("/api/v1/auth/logout")
      .set("Cookie", `${REFRESH_COOKIE_NAME}=${cookie}`);
    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body.message).toBe("Logged out successfully");

    const refreshAfterLogout = await api
      .post("/api/v1/auth/refresh")
      .set("Cookie", `${REFRESH_COOKIE_NAME}=${cookie}`);
    expect(refreshAfterLogout.status).toBe(401);
  });

  it("POST /auth/refresh with no token returns 401", async () => {
    const res = await api.post("/api/v1/auth/refresh");
    expect(res.status).toBe(401);
  });

  it("expired access token is rejected with 401", async () => {
    const res = await api
      .get("/api/v1/auth/profile")
      .set("Authorization", authHeader("expired.token.here"));
    expect(res.status).toBe(401);
  });

  it("POST /auth/refresh rejects Authorization header (cookie-only)", async () => {
    const { loginRes } = await loginUser();
    const cookie = extractRefreshCookie(loginRes)!;

    const refreshRes = await api
      .post("/api/v1/auth/refresh")
      .set("Authorization", `Bearer ${cookie}`);

    expect(refreshRes.status).toBe(401);
  });
});

describe("Registration issues a session", () => {
  it("register sets a refresh token cookie with login's attributes", async () => {
    const { registerRes } = await registerUser();
    expect(registerRes.status).toBe(201);

    const cookie = extractRefreshCookie(registerRes);
    expect(cookie).toBeDefined();
    expect(cookie!.length).toBeGreaterThan(20);

    // AC-1: not merely present — the same cookie contract login issues.
    const { loginRes } = await loginUser();
    expect(cookieAttributes(rawRefreshCookie(registerRes)!)).toEqual(
      cookieAttributes(rawRefreshCookie(loginRes)!),
    );
  });

  it("a register-issued cookie refreshes into a new access token", async () => {
    const { registerRes } = await registerUser();
    const cookie = extractRefreshCookie(registerRes)!;

    const refreshRes = await api
      .post("/api/v1/auth/refresh")
      .set("Cookie", `${REFRESH_COOKIE_NAME}=${cookie}`);

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.data.token).toBeTruthy();

    const rotated = extractRefreshCookie(refreshRes);
    expect(rotated).toBeDefined();
    expect(rotated).not.toBe(cookie);
  });
});
