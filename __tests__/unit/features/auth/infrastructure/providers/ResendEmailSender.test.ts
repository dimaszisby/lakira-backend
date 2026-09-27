import { jest } from "@jest/globals";
import { ResendEmailSender } from "@/features/auth/infrastructure/providers/ResendEmailSender.js";
import AppError from "@/utils/AppError.js";
import logger from "@/utils/logger.js";

const MESSAGE = {
  to: "someone@example.com",
  subject: "Reset your password",
  html: '<a href="http://localhost:3000/reset-password?token=abc">Reset</a>',
  text: "http://localhost:3000/reset-password?token=abc",
};

const loggerErrorSpy = jest
  .spyOn(logger, "error")
  .mockImplementation(() => logger);

const build = (result: { error: { message: string } | null }) => {
  const send = jest.fn(async () => result);
  const client = { emails: { send } } as any;
  const sut = new ResendEmailSender(
    "unused-key",
    "noreply@example.com",
    client,
  );
  return { sut, send };
};

describe("ResendEmailSender", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("sends through the Resend client", async () => {
    const { sut, send } = build({ error: null });

    await sut.send(MESSAGE);

    expect(send).toHaveBeenCalledWith({
      from: "noreply@example.com",
      to: "someone@example.com",
      subject: "Reset your password",
      html: MESSAGE.html,
      text: MESSAGE.text,
    });
    expect(loggerErrorSpy).not.toHaveBeenCalled();
  });

  it("throws on a failed send and logs no recipient or body (ADR-0049)", async () => {
    const { sut } = build({ error: { message: "rate limited" } });

    await expect(sut.send(MESSAGE)).rejects.toThrow(AppError);

    expect(loggerErrorSpy).toHaveBeenCalledTimes(1);
    const [, meta] = loggerErrorSpy.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
    ];
    expect(meta).toEqual({
      subject: "Reset your password",
      error: "rate limited",
    });
    expect(JSON.stringify(meta)).not.toContain("someone@example.com");
    expect(JSON.stringify(meta)).not.toContain("token=");
  });
});
