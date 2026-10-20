import { describe, it, expect, afterEach, jest } from "@jest/globals";
import {
  EMAIL_SEND_TIMEOUT_MS,
  TimeoutEmailSender,
} from "@/features/auth/infrastructure/providers/TimeoutEmailSender.js";
import type {
  EmailMessage,
  EmailSender,
} from "@/features/auth/application/ports/EmailSender.js";

jest.mock("@/utils/logger.js", () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const MESSAGE: EmailMessage = {
  to: "someone@example.com",
  subject: "Subject",
  html: "<p>body</p>",
  text: "body",
};

const sender = (send: EmailSender["send"]): EmailSender => ({ send });

// worker-cancel-and-one-connection-per-job D-03. The queued email is sent inside
// the job's transaction, so a send that never settles holds a connection until
// it is abandoned.
describe("TimeoutEmailSender", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("bounds a send at ten seconds", () => {
    expect(EMAIL_SEND_TIMEOUT_MS).toBe(10_000);
  });

  it("passes a send that settles in time through", async () => {
    const inner = jest.fn<EmailSender["send"]>(async () => undefined);
    const sut = new TimeoutEmailSender(sender(inner), 1_000);

    await sut.send(MESSAGE);

    expect(inner).toHaveBeenCalledWith(MESSAGE);
  });

  it("passes a failed send's error through", async () => {
    const failure = new Error("provider refused");
    const sut = new TimeoutEmailSender(
      sender(async () => {
        throw failure;
      }),
      1_000,
    );

    await expect(sut.send(MESSAGE)).rejects.toBe(failure);
  });

  it("rejects a send that has not settled by the bound", async () => {
    jest.useFakeTimers();
    const sut = new TimeoutEmailSender(
      sender(() => new Promise<void>(() => undefined)),
      1_000,
    );

    const sending = sut.send(MESSAGE);
    const outcome = expect(sending).rejects.toThrow(
      "Email send did not finish within 1000 ms",
    );
    await jest.advanceTimersByTimeAsync(1_000);

    await outcome;
  });

  it("leaves no timer behind after a send in time", async () => {
    jest.useFakeTimers();
    const sut = new TimeoutEmailSender(
      sender(async () => undefined),
      1_000,
    );

    await sut.send(MESSAGE);

    expect(jest.getTimerCount()).toBe(0);
  });
});
