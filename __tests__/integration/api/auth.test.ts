import {
  api,
  buildUserPayload,
  createTestUser,
  authHeader,
} from "../helpers/test-utils.js";

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
