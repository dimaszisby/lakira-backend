import { authHeader, buildUserPayload } from "../helpers/test-utils.js";
import { appWith } from "../helpers/app-with.js";
import { buildAuthFeature } from "@/features/auth/feature.js";
import {
  EmailMessage,
  EmailSender,
} from "@/features/auth/application/ports/EmailSender.js";
import { APP_SHORT_NAME } from "@/config/app-name.js";

/**
 * #308 (audit 2026-11-14, Y6), ADR-0097: a password reset or change ends every
 * session the user had. A refresh cookie issued before it answers 401; the
 * session that changed the password continues on the cookie it is sent back.
 */

const REFRESH_COOKIE_NAME = `${APP_SHORT_NAME}_refresh`;
const NEW_PASSWORD = "BrandNewPass123!";

class CapturingEmailSender implements EmailSender {
  public messages: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.messages.push(message);
  }
}

let sender: CapturingEmailSender;
let api: ReturnType<typeof appWith>;

beforeEach(() => {
  sender = new CapturingEmailSender();
  api = appWith({ auth: buildAuthFeature({ emailSender: sender }) });
});

const refreshCookieOf = (res: {
  headers: Record<string, unknown>;
}): string | undefined => {
  const cookies = (res.headers["set-cookie"] as string[] | undefined) ?? [];
  const match = cookies
    .map((c) => c.match(new RegExp(`^${REFRESH_COOKIE_NAME}=([^;]+)`)))
    .find(Boolean);
  return match?.[1];
};

const refreshWith = (cookie: string) =>
  api
    .post("/api/v1/auth/refresh")
    .set("Cookie", `${REFRESH_COOKIE_NAME}=${cookie}`);

/** Registers, then logs in again: two sessions, as two devices would hold. */
const userWithTwoSessions = async () => {
  const payload = buildUserPayload();
  const registered = await api.post("/api/v1/auth/register").send(payload);
  expect(registered.status).toBe(201);
  const loggedIn = await api
    .post("/api/v1/auth/login")
    .send({ email: payload.email, password: payload.password });
  expect(loggedIn.status).toBe(200);

  return {
    payload,
    accessToken: registered.body.data.token as string,
    cookieA: refreshCookieOf(registered) as string,
    cookieB: refreshCookieOf(loggedIn) as string,
  };
};

const resetTokenFor = async (email: string): Promise<string> => {
  const forgot = await api.post("/api/v1/auth/forgot-password").send({ email });
  expect(forgot.status).toBe(200);
  const message = sender.messages.find((m) => /reset/i.test(m.subject));
  const match = message?.text.match(/[?&]token=([^&\s"]+)/);
  if (!match) throw new Error("No password-reset link was sent");
  return decodeURIComponent(match[1]);
};

/** `POST /auth/change-password` (credential-changes D-01), with the right current password. */
const changePassword = (accessToken: string, currentPassword: string) =>
  api
    .post("/api/v1/auth/change-password")
    .set("Authorization", authHeader(accessToken))
    .send({
      currentPassword,
      password: NEW_PASSWORD,
      passwordConfirmation: NEW_PASSWORD,
    });

describe("A password change ends every other session (ADR-0097)", () => {
  it("revokes every earlier refresh cookie and sends this session a new one", async () => {
    const { payload, accessToken, cookieA, cookieB } =
      await userWithTwoSessions();

    const changed = await changePassword(accessToken, payload.password);

    expect(changed.status).toBe(200);
    const cookieC = refreshCookieOf(changed);
    expect(cookieC).toBeDefined();
    expect([cookieA, cookieB]).not.toContain(cookieC);

    expect((await refreshWith(cookieA)).status).toBe(401);
    expect((await refreshWith(cookieB)).status).toBe(401);

    const continued = await refreshWith(cookieC as string);
    expect(continued.status).toBe(200);
    expect(continued.body.data.token).toBeTruthy();
  });

  it("ends only that user's sessions: another user's cookie still refreshes", async () => {
    const changer = await userWithTwoSessions();
    const bystander = await userWithTwoSessions();

    await changePassword(changer.accessToken, changer.payload.password).expect(
      200,
    );

    expect((await refreshWith(changer.cookieA)).status).toBe(401);
    expect((await refreshWith(bystander.cookieA)).status).toBe(200);
    expect((await refreshWith(bystander.cookieB)).status).toBe(200);
  });

  it("a refused change ends no session", async () => {
    const { accessToken, cookieA } = await userWithTwoSessions();

    const refused = await changePassword(accessToken, "not-the-password");

    expect(refused.status).toBe(400);
    expect(refreshCookieOf(refused)).toBeUndefined();
    expect((await refreshWith(cookieA)).status).toBe(200);
  });

  it("a profile change ends no session and sets no cookie", async () => {
    const { accessToken, cookieA } = await userWithTwoSessions();

    const changed = await api
      .put("/api/v1/auth/profile")
      .set("Authorization", authHeader(accessToken))
      .send({ isPublicProfile: false });

    expect(changed.status).toBe(200);
    expect(refreshCookieOf(changed)).toBeUndefined();
    expect((await refreshWith(cookieA)).status).toBe(200);
  });

  it("leaves an access token already issued valid until it expires (the accepted window)", async () => {
    const { payload, accessToken } = await userWithTwoSessions();

    await changePassword(accessToken, payload.password).expect(200);

    const profile = await api
      .get("/api/v1/auth/profile")
      .set("Authorization", authHeader(accessToken));
    expect(profile.status).toBe(200);
  });
});

describe("A password reset ends every session (ADR-0097)", () => {
  it("revokes every refresh cookie, and the new password logs in", async () => {
    const { payload, cookieA, cookieB } = await userWithTwoSessions();
    const token = await resetTokenFor(payload.email);

    const reset = await api.post("/api/v1/auth/reset-password").send({
      token,
      password: NEW_PASSWORD,
      passwordConfirmation: NEW_PASSWORD,
    });
    expect(reset.status).toBe(200);

    expect((await refreshWith(cookieA)).status).toBe(401);
    expect((await refreshWith(cookieB)).status).toBe(401);

    const login = await api
      .post("/api/v1/auth/login")
      .send({ email: payload.email, password: NEW_PASSWORD });
    expect(login.status).toBe(200);
  });

  it("a reset refused for its token ends no session", async () => {
    const { cookieA } = await userWithTwoSessions();

    const reset = await api.post("/api/v1/auth/reset-password").send({
      token: "not-a-real-token",
      password: NEW_PASSWORD,
      passwordConfirmation: NEW_PASSWORD,
    });
    expect(reset.status).toBe(400);

    expect((await refreshWith(cookieA)).status).toBe(200);
  });
});
