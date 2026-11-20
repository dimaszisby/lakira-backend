import request from "../helpers/request.js";
import app from "@/server.js";

const uniqueSuffix = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe("e2e: auth golden path", () => {
  const api = request(app);

  it("registers → logs in → calls a protected endpoint → logs out", async () => {
    const suffix = uniqueSuffix();
    const payload = {
      username: `e2e_user_${suffix}`,
      email: `e2e_user_${suffix}@example.com`,
      password: "Password123!",
      passwordConfirmation: "Password123!",
    };

    const registerRes = await api
      .post("/api/v1/auth/register")
      .send(payload)
      .expect(201);
    expect(registerRes.body.status).toBe("success");
    expect(registerRes.body.data.user.email).toBe(payload.email);

    const loginRes = await api
      .post("/api/v1/auth/login")
      .send({ email: payload.email, password: payload.password })
      .expect(200);
    expect(loginRes.body.status).toBe("success");
    const token: string = loginRes.body.data.token;
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(0);

    const profileRes = await api
      .get("/api/v1/auth/profile")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(profileRes.body.status).toBe("success");
    expect(profileRes.body.data.email).toBe(payload.email);

    const logoutRes = await api
      .post("/api/v1/auth/logout")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(logoutRes.body.status).toBe("success");
    expect(logoutRes.body.message).toBe("Logged out successfully");
  });
});
