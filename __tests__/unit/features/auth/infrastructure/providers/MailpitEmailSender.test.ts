import { jest } from "@jest/globals";
import { MailpitEmailSender } from "@/features/auth/infrastructure/providers/MailpitEmailSender.js";
import AppError from "@/utils/AppError.js";

const MESSAGE = {
  to: "user@example.com",
  subject: "Verify your email",
  html: '<a href="http://localhost:3000/verify-email?token=abc">Verify</a>',
  text: "http://localhost:3000/verify-email?token=abc",
};

const build = (fetchImpl: jest.Mock<typeof fetch>) =>
  new MailpitEmailSender(
    "http://mailpit:8025",
    "noreply@example.com",
    fetchImpl as unknown as typeof fetch,
  );

describe("MailpitEmailSender", () => {
  it("posts the message to Mailpit's send API", async () => {
    const fetchImpl = jest
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("{}", { status: 200 }));

    await build(fetchImpl).send(MESSAGE);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toBe("http://mailpit:8025/api/v1/send");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      From: { Email: "noreply@example.com" },
      To: [{ Email: "user@example.com" }],
      Subject: "Verify your email",
      HTML: MESSAGE.html,
      Text: MESSAGE.text,
    });
  });

  it("throws when Mailpit answers with a non-2xx status", async () => {
    const fetchImpl = jest
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("bad request", { status: 400 }));

    await expect(build(fetchImpl).send(MESSAGE)).rejects.toThrow(AppError);
    await expect(build(fetchImpl).send(MESSAGE)).rejects.toThrow("HTTP 400");
  });

  it("throws when Mailpit is unreachable", async () => {
    const fetchImpl = jest
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError("fetch failed"));

    await expect(build(fetchImpl).send(MESSAGE)).rejects.toThrow(
      "Mailpit email send failed: fetch failed",
    );
  });
});
