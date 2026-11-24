import { authHeader, buildUserPayload } from "../helpers/test-utils.js";
import { appWith } from "../helpers/app-with.js";
import { buildAuthFeature } from "@/features/auth/feature.js";
import {
  EmailMessage,
  EmailSender,
} from "@/features/auth/application/ports/EmailSender.js";
import type { LockoutRedisClient } from "@/features/auth/infrastructure/http/attemptCounter.js";
import { models } from "@/infrastructure/db/models.js";

/**
 * #309 (audit 2026-11-14, Y7), kit `credential-changes`, Phase 1: the password
 * leaves `PUT /auth/profile` for `POST /auth/change-password`, which asks for the
 * current one (D-01) and bounds wrong guesses per user (D-04). AC-1 to AC-5.
 */

const NEW_PASSWORD = "BrandNewPass123!";

class CapturingEmailSender implements EmailSender {
  public messages: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.messages.push(message);
  }
}

/** The counters' store, in memory, so the 429 path runs without a Redis server. */
class InMemoryLockoutRedis implements LockoutRedisClient {
  readonly isOpen = true;
  private counts = new Map<string, number>();

  async get(key: string) {
    const count = this.counts.get(key);
    return count === undefined ? null : String(count);
  }
  async incr(key: string) {
    const next = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, next);
    return next;
  }
  async expire() {
    return true;
  }
  async del(key: string | string[]) {
    for (const k of Array.isArray(key) ? key : [key]) this.counts.delete(k);
    return 1;
  }
}

let sender: CapturingEmailSender;
let api: ReturnType<typeof appWith>;

beforeEach(() => {
  sender = new CapturingEmailSender();
  api = appWith({
    auth: buildAuthFeature({
      emailSender: sender,
      lockoutRedis: new InMemoryLockoutRedis(),
    }),
  });
});

const registered = async () => {
  const payload = buildUserPayload();
  const res = await api.post("/api/v1/auth/register").send(payload);
  expect(res.status).toBe(201);
  return { payload, accessToken: res.body.data.token as string };
};

const changePassword = (accessToken: string, body: Record<string, unknown>) =>
  api
    .post("/api/v1/auth/change-password")
    .set("Authorization", authHeader(accessToken))
    .send(body);

const login = (email: string, password: string) =>
  api.post("/api/v1/auth/login").send({ email, password });

describe("PUT /auth/profile refuses the credentials (AC-1)", () => {
  it.each([
    ["password", { password: NEW_PASSWORD }, /change-password/],
    ["email", { email: "elsewhere@example.com" }, /cannot be changed here/],
  ])(
    "a body carrying %s answers 400 on that field, and changes nothing",
    async (field, body, message) => {
      const { payload, accessToken } = await registered();

      const res = await api
        .put("/api/v1/auth/profile")
        .set("Authorization", authHeader(accessToken))
        .send(body);

      expect(res.status).toBe(400);
      expect(res.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field,
            message: expect.stringMatching(message),
          }),
        ]),
      );
      const user = await models.User.findOne({
        where: { email: payload.email },
      });
      expect(user).not.toBeNull();
      expect((await login(payload.email, payload.password)).status).toBe(200);
    },
  );

  it("still changes the username and the visibility", async () => {
    const { accessToken } = await registered();
    const username = `renamed${Date.now()}`;

    const res = await api
      .put("/api/v1/auth/profile")
      .set("Authorization", authHeader(accessToken))
      .send({ username, isPublicProfile: false });

    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({
      username,
      isPublicProfile: false,
    });
  });
});

describe("POST /auth/change-password (AC-2, AC-3)", () => {
  it("with the current password: 200, a new cookie, and the new password logs in", async () => {
    const { payload, accessToken } = await registered();

    const res = await changePassword(accessToken, {
      currentPassword: payload.password,
      password: NEW_PASSWORD,
      passwordConfirmation: NEW_PASSWORD,
    });

    expect(res.status).toBe(200);
    expect(res.headers["set-cookie"]).toEqual(
      expect.arrayContaining([expect.stringMatching(/_refresh=/)]),
    );
    expect((await login(payload.email, NEW_PASSWORD)).status).toBe(200);
    expect((await login(payload.email, payload.password)).status).toBe(401);
  });

  it("a wrong current password answers 400 on the field, never 401, and changes nothing", async () => {
    const { payload, accessToken } = await registered();

    const res = await changePassword(accessToken, {
      currentPassword: "not-the-password",
      password: NEW_PASSWORD,
      passwordConfirmation: NEW_PASSWORD,
    });

    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual([
      {
        field: "currentPassword",
        message: "Current password is incorrect",
      },
    ]);
    expect((await login(payload.email, payload.password)).status).toBe(200);
  });

  it("a new password equal to the current one answers 400 on password", async () => {
    const { payload, accessToken } = await registered();

    const res = await changePassword(accessToken, {
      currentPassword: payload.password,
      password: payload.password,
      passwordConfirmation: payload.password,
    });

    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual([
      expect.objectContaining({ field: "password" }),
    ]);
  });

  it("a mismatched confirmation answers 400 before anything is checked", async () => {
    const { accessToken } = await registered();

    const res = await changePassword(accessToken, {
      currentPassword: "anything",
      password: NEW_PASSWORD,
      passwordConfirmation: "SomethingElse123!",
    });

    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "passwordConfirmation" }),
      ]),
    );
  });

  it("needs a session", async () => {
    const res = await api.post("/api/v1/auth/change-password").send({
      currentPassword: "x",
      password: NEW_PASSWORD,
      passwordConfirmation: NEW_PASSWORD,
    });

    expect(res.status).toBe(401);
  });
});

describe("Wrong current passwords are bounded per user (AC-4)", () => {
  it("after 5 wrong ones the route answers 429 with Retry-After, and login is unaffected", async () => {
    const { payload, accessToken } = await registered();
    const wrong = {
      currentPassword: "not-the-password",
      password: NEW_PASSWORD,
      passwordConfirmation: NEW_PASSWORD,
    };

    for (let i = 0; i < 5; i += 1) {
      expect((await changePassword(accessToken, wrong)).status).toBe(400);
    }

    const blocked = await changePassword(accessToken, {
      ...wrong,
      currentPassword: payload.password,
    });
    expect(blocked.status).toBe(429);
    expect(blocked.headers["retry-after"]).toBe("900");

    // A typo in settings never blocks signing in.
    expect((await login(payload.email, payload.password)).status).toBe(200);
  });

  it("parallel guesses cannot outrun the limit: at most 5 are judged", async () => {
    const { accessToken } = await registered();
    const wrong = {
      currentPassword: "not-the-password",
      password: NEW_PASSWORD,
      passwordConfirmation: NEW_PASSWORD,
    };

    const statuses = (
      await Promise.all(
        Array.from({ length: 10 }, () => changePassword(accessToken, wrong)),
      )
    ).map((res) => res.status);

    expect(statuses.filter((s) => s === 400)).toHaveLength(5);
    expect(statuses.filter((s) => s === 429)).toHaveLength(5);
  });

  it("counts per user: one user's misses do not block another", async () => {
    const first = await registered();
    const second = await registered();
    const wrong = {
      currentPassword: "not-the-password",
      password: NEW_PASSWORD,
      passwordConfirmation: NEW_PASSWORD,
    };
    for (let i = 0; i < 5; i += 1) {
      await changePassword(first.accessToken, wrong);
    }

    const res = await changePassword(second.accessToken, {
      ...wrong,
      currentPassword: second.payload.password,
    });

    expect(res.status).toBe(200);
  });
});

describe("A password change spends reset links sent before it (AC-5)", () => {
  it("a reset link from before the change no longer sets a password", async () => {
    const { payload, accessToken } = await registered();
    await api
      .post("/api/v1/auth/forgot-password")
      .send({ email: payload.email })
      .expect(200);
    const link = sender.messages.find((m) => /reset/i.test(m.subject))?.text;
    const token = decodeURIComponent(
      (link?.match(/[?&]token=([^&\s"]+)/) ?? [])[1] ?? "",
    );
    expect(token).not.toBe("");

    await changePassword(accessToken, {
      currentPassword: payload.password,
      password: NEW_PASSWORD,
      passwordConfirmation: NEW_PASSWORD,
    }).expect(200);

    const reset = await api.post("/api/v1/auth/reset-password").send({
      token,
      password: "ThirdPassword123!",
      passwordConfirmation: "ThirdPassword123!",
    });
    expect(reset.status).toBe(400);
    expect((await login(payload.email, NEW_PASSWORD)).status).toBe(200);
  });
});
