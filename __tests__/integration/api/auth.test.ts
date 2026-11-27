import {
  api,
  buildUserPayload,
  createTestUser,
  authHeader,
} from "../helpers/test-utils.js";
import { models } from "@/infrastructure/db/models.js";

describe("Auth API", () => {
  it("registers a new user", async () => {
    const payload = buildUserPayload();
    const res = await api.post("/api/v1/auth/register").send(payload);

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("success");
    expect(res.body.message).toBe("User created successfully");
    expect(res.body.data).toHaveProperty("token");
    expect(res.body.data.user).toMatchObject({
      email: payload.email,
      username: payload.username,
    });
  });

  // #311 (audit 2026-11-14, Y11; ADR-0101): the username names the user's
  // organization, which the invite email quotes, so it is a handle, not a sentence.
  it("refuses a username that is not a handle, at registration and on a change", async () => {
    const lure = "Your invoice is overdue, pay at example.test";
    const registered = await api
      .post("/api/v1/auth/register")
      .send(buildUserPayload({ username: lure }));
    expect(registered.status).toBe(400);
    expect(registered.body.errors).toEqual([
      {
        field: "username",
        message:
          "Username may contain only letters, digits, '.', '_' and '-', and needs a letter or digit",
      },
    ]);

    const { token } = await createTestUser();
    const changed = await api
      .put("/api/v1/auth/profile")
      .set("Authorization", authHeader(token))
      .send({ username: "a".repeat(51) });
    expect(changed.status).toBe(400);
    expect(changed.body.errors).toEqual([
      {
        field: "username",
        message: "Username must be at most 50 characters",
      },
    ]);
  });

  // A username from before the rule, sent back unchanged, is no change (#311).
  it("saves a profile that sends back a username from before the rule", async () => {
    const { token, user } = await createTestUser();
    await models.User.update(
      { username: "John Smith" },
      { where: { id: user.id } },
    );

    const res = await api
      .put("/api/v1/auth/profile")
      .set("Authorization", authHeader(token))
      .send({ username: "John Smith", isPublicProfile: false });

    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({
      username: "John Smith",
      isPublicProfile: false,
    });
  });

  it("prevents duplicate registrations", async () => {
    const payload = buildUserPayload();
    await api.post("/api/v1/auth/register").send(payload);

    const res = await api.post("/api/v1/auth/register").send(payload);

    expect(res.status).toBe(409);
    expect(res.body.status).toBe("fail");
  });

  it("logs in an existing user", async () => {
    const payload = buildUserPayload();
    await api.post("/api/v1/auth/register").send(payload);

    const res = await api.post("/api/v1/auth/login").send({
      email: payload.email,
      password: payload.password,
    });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(res.body.data).toHaveProperty("token");
    expect(res.body.data.user.email).toBe(payload.email);
  });

  it("rejects invalid login attempts", async () => {
    const res = await api.post("/api/v1/auth/login").send({
      email: "missing@example.com",
      password: "WrongPassword",
    });

    expect(res.status).toBe(401);
    expect(res.body.status).toBe("fail");
  });

  it("returns the authenticated profile", async () => {
    const { token, payload } = await createTestUser();

    const res = await api
      .get("/api/v1/auth/profile")
      .set("Authorization", authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(res.body.data.email).toBe(payload.email);
  });

  it("blocks profile access without a token", async () => {
    const res = await api.get("/api/v1/auth/profile");
    expect(res.status).toBe(401);
    expect(res.body.status).toBe("fail");
  });

  it("updates the authenticated profile", async () => {
    const { token } = await createTestUser();
    const res = await api
      .put("/api/v1/auth/profile")
      .set("Authorization", authHeader(token))
      .send({
        username: "updated-username",
        isPublicProfile: false,
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(res.body.message).toBe("Profile updated successfully");
    expect(res.body.data.user.username).toBe("updated-username");
    expect(res.body.data.user.isPublicProfile).toBe(false);
  });

  it("ignores unknown fields in profile updates", async () => {
    const { token } = await createTestUser();

    const updateRes = await api
      .put("/api/v1/auth/profile")
      .set("Authorization", authHeader(token))
      .send({
        username: "still-user",
        role: "admin",
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.status).toBe("success");
    expect(updateRes.body.data.user.role).toBeUndefined();
  });

  it("logs out an authenticated user", async () => {
    const { token } = await createTestUser();
    const res = await api
      .post("/api/v1/auth/logout")
      .set("Authorization", authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("success");
    expect(res.body.message).toBe("Logged out successfully");
    expect(res.body.data).toBeNull();
  });

  it("validates password mismatch during registration", async () => {
    const payload = buildUserPayload({
      password: "Password123!",
      passwordConfirmation: "Mismatch123!",
    });
    const res = await api.post("/api/v1/auth/register").send(payload);

    expect(res.status).toBe(400);
    expect(res.body.status).toBe("fail");
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        { field: "passwordConfirmation", message: "Passwords do not match" },
      ]),
    );
  });
});
