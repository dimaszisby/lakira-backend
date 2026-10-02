import {
  api,
  buildUserPayload,
  createTestUser,
  authHeader,
} from "../helpers/test-utils.js";
import { models } from "@/infrastructure/db/models.js";
import {
  buildAuthFeature,
  type AuthFeatureOverrides,
} from "@/features/auth/feature.js";
import { overrideAuthFeatureForTest } from "@/features/auth/infrastructure/http/controller.js";
import {
  EmailMessage,
  EmailSender,
} from "@/features/auth/application/ports/EmailSender.js";
import { drainBackgroundTasks } from "@/utils/background-tasks.js";

class CapturingEmailSender implements EmailSender {
  public messages: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.messages.push(message);
  }
}

// Holds every send until `release()`, so the email is still in flight when
// the response arrives, however slow the machine is.
class GatedEmailSender extends CapturingEmailSender {
  public release!: () => void;
  private gate = new Promise<void>((resolve) => {
    this.release = resolve;
  });

  async send(message: EmailMessage): Promise<void> {
    await this.gate;
    await super.send(message);
  }
}

const installGatedSender = () => {
  const sender = new GatedEmailSender();
  overrideAuthFeatureForTest(buildAuthFeature({ emailSender: sender }));
  return sender;
};

// Starts a drain, proves it is still waiting, then releases the email.
const expectDrainWaitsFor = async (sender: GatedEmailSender) => {
  expect(sender.messages).toHaveLength(0);

  let drained = false;
  const drain = drainBackgroundTasks().then(() => {
    drained = true;
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(drained).toBe(false);

  sender.release();
  await drain;
  expect(sender.messages).toHaveLength(1);
};

const installCapturingSender = (overrides?: AuthFeatureOverrides) => {
  const sender = new CapturingEmailSender();
  overrideAuthFeatureForTest(
    buildAuthFeature({ emailSender: sender, ...overrides }),
  );
  return sender;
};

const restoreFeature = () => {
  overrideAuthFeatureForTest(buildAuthFeature());
};

const extractTokenFromLink = (link: string): string => {
  const match = link.match(/[?&]token=([^&\s"<]+)/);
  if (!match) throw new Error(`No token in link: ${link}`);
  return decodeURIComponent(match[1]);
};

// The email is sent after the response; draining waits for exactly that work
// instead of guessing how long it takes.
const waitForEmail = async (
  sender: CapturingEmailSender,
): Promise<EmailMessage> => {
  await drainBackgroundTasks();
  if (sender.messages.length === 0) throw new Error("No email was sent");
  return sender.messages[0];
};

const assertNoEmailSent = async (
  sender: CapturingEmailSender,
): Promise<void> => {
  await drainBackgroundTasks();
  expect(sender.messages).toHaveLength(0);
};

describe("Email verification API", () => {
  afterEach(() => {
    restoreFeature();
  });

  describe("POST /auth/register → triggers verification email", () => {
    it("sends a verification email after registration", async () => {
      const sender = installCapturingSender();
      const payload = buildUserPayload();

      const res = await api.post("/api/v1/auth/register").send(payload);
      expect(res.status).toBe(201);

      const email = await waitForEmail(sender);
      expect(email.to).toBe(payload.email);
      expect(email.subject).toMatch(/verify/i);
      expect(email.text).toContain("?token=");
    });

    it("stores a hashed token row after registration", async () => {
      const sender = installCapturingSender();
      const payload = buildUserPayload();

      await api.post("/api/v1/auth/register").send(payload);
      await waitForEmail(sender);

      const tokens = await models.EmailVerificationToken.findAll({
        where: { usedAt: null },
      });
      expect(tokens).toHaveLength(1);
      expect(tokens[0].tokenHash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe("POST /auth/verify-email", () => {
    it("verifies the email, marks token used, and sets email_verified_at", async () => {
      const sender = installCapturingSender();
      const payload = buildUserPayload();

      const regRes = await api.post("/api/v1/auth/register").send(payload);
      expect(regRes.status).toBe(201);
      const email = await waitForEmail(sender);
      const rawToken = extractTokenFromLink(email.text);

      const verifyRes = await api
        .post("/api/v1/auth/verify-email")
        .send({ token: rawToken });

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.status).toBe("success");
      expect(verifyRes.body.data).toBeNull();

      const tokenRow = await models.EmailVerificationToken.findOne({
        order: [["createdAt", "DESC"]],
      });
      expect(tokenRow?.usedAt).not.toBeNull();

      const userRow = await models.User.findOne({
        where: { email: payload.email },
      });
      expect(userRow?.emailVerifiedAt).not.toBeNull();
    });

    it("returns 400 on second use of the same token (anti-enumeration same body)", async () => {
      const sender = installCapturingSender();
      const payload = buildUserPayload();

      await api.post("/api/v1/auth/register").send(payload);
      const email = await waitForEmail(sender);
      const rawToken = extractTokenFromLink(email.text);

      await api.post("/api/v1/auth/verify-email").send({ token: rawToken });

      const second = await api
        .post("/api/v1/auth/verify-email")
        .send({ token: rawToken });

      expect(second.status).toBe(400);
      expect(second.body.message).toBe(
        "Verification link is invalid or has expired.",
      );
    });

    it("returns 400 for an unknown token", async () => {
      installCapturingSender();
      const res = await api
        .post("/api/v1/auth/verify-email")
        .send({ token: "this-was-never-issued" });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe(
        "Verification link is invalid or has expired.",
      );
    });

    it("returns 400 for an expired token", async () => {
      const sender = installCapturingSender();
      const payload = buildUserPayload();

      await api.post("/api/v1/auth/register").send(payload);
      const email = await waitForEmail(sender);
      const rawToken = extractTokenFromLink(email.text);

      await models.EmailVerificationToken.update(
        { expiresAt: new Date(Date.now() - 60 * 1000) },
        { where: {} },
      );

      const res = await api
        .post("/api/v1/auth/verify-email")
        .send({ token: rawToken });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe(
        "Verification link is invalid or has expired.",
      );
    });

    it("rejects non-POST methods with 405", async () => {
      const res = await api.get("/api/v1/auth/verify-email");
      expect(res.status).toBe(405);
    });

    it("validates empty token", async () => {
      installCapturingSender();
      const res = await api
        .post("/api/v1/auth/verify-email")
        .send({ token: "" });
      expect(res.status).toBe(400);
    });
  });

  describe("background work is drainable (ADR-0054)", () => {
    it("drain waits for the verification email started by register", async () => {
      const sender = installGatedSender();

      const res = await api
        .post("/api/v1/auth/register")
        .send(buildUserPayload());
      expect(res.status).toBe(201);

      await expectDrainWaitsFor(sender);
    });

    it("drain waits for the verification email started by resend", async () => {
      const capturing = installCapturingSender();
      const { token } = await createTestUser();
      await waitForEmail(capturing);

      const sender = installGatedSender();
      const res = await api
        .post("/api/v1/auth/resend-verification")
        .set("Authorization", authHeader(token));
      expect(res.status).toBe(200);

      await expectDrainWaitsFor(sender);
    });
  });

  describe("POST /auth/resend-verification", () => {
    it("requires JWT — returns 401 without auth", async () => {
      const res = await api.post("/api/v1/auth/resend-verification");
      expect(res.status).toBe(401);
    });

    it("returns 200 and sends a fresh token for unverified user", async () => {
      const sender = installCapturingSender();
      const { token } = await createTestUser();
      await waitForEmail(sender);
      sender.messages = [];

      const res = await api
        .post("/api/v1/auth/resend-verification")
        .set("Authorization", authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("success");
      expect(res.body.message).toMatch(/unverified/i);

      const email = await waitForEmail(sender);
      expect(email.text).toContain("?token=");
    });

    it("returns 200 silently for already-verified user", async () => {
      const sender = installCapturingSender();
      const { token, payload } = await createTestUser();
      await waitForEmail(sender);
      const rawToken = extractTokenFromLink(sender.messages[0].text);
      await api.post("/api/v1/auth/verify-email").send({ token: rawToken });

      sender.messages = [];
      const res = await api
        .post("/api/v1/auth/resend-verification")
        .set("Authorization", authHeader(token));

      expect(res.status).toBe(200);
      await assertNoEmailSent(sender);
    });

    it("revokes prior token when resending", async () => {
      const sender = installCapturingSender();
      const { token } = await createTestUser();
      await waitForEmail(sender);

      sender.messages = [];
      await api
        .post("/api/v1/auth/resend-verification")
        .set("Authorization", authHeader(token));
      await waitForEmail(sender);

      const tokens = await models.EmailVerificationToken.findAll({
        order: [["createdAt", "ASC"]],
      });
      expect(tokens.length).toBeGreaterThanOrEqual(2);
      const allButLast = tokens.slice(0, -1);
      expect(allButLast.every((t) => t.usedAt !== null)).toBe(true);
    });

    it("rejects non-POST methods with 405", async () => {
      const res = await api.get("/api/v1/auth/resend-verification");
      expect(res.status).toBe(405);
    });
  });
});
