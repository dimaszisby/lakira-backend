import { jest } from "@jest/globals";
import {
  isLoopbackUrl,
  warnWhenEmailChangeUrlIsLocal,
} from "@/config/frontend-urls.js";

// Kit credential-changes, D-07 and D-10.
describe("isLoopbackUrl", () => {
  it.each([
    "http://localhost:3000/confirm-email-change",
    "http://LOCALHOST/x",
    "https://app.localhost/x",
    "http://127.0.0.1:3000/x",
    "http://127.10.0.2/x",
    "http://[::1]:3000/x",
  ])("is true for %s", (url) => {
    expect(isLoopbackUrl(url)).toBe(true);
  });

  it.each([
    "https://app.example.com/confirm-email-change",
    "https://localhost.example.com/x",
    "http://10.0.0.1/x",
    "not a url",
  ])("is false for %s", (url) => {
    expect(isLoopbackUrl(url)).toBe(false);
  });
});

describe("warnWhenEmailChangeUrlIsLocal", () => {
  const LOCAL = "http://localhost:3000/confirm-email-change";

  it("warns in staging, naming the variable and not the URL", () => {
    const warn = jest.fn<(message: string) => void>();

    expect(warnWhenEmailChangeUrlIsLocal("staging", LOCAL, warn)).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("FRONTEND_EMAIL_CHANGE_URL");
    expect(warn.mock.calls[0][0]).not.toContain("localhost:3000");
  });

  it.each(["development", "test", "production"])(
    "stays quiet in %s",
    (nodeEnv) => {
      const warn = jest.fn<(message: string) => void>();

      expect(warnWhenEmailChangeUrlIsLocal(nodeEnv, LOCAL, warn)).toBe(false);
      expect(warn).not.toHaveBeenCalled();
    },
  );

  it("stays quiet in staging on a real host", () => {
    const warn = jest.fn<(message: string) => void>();

    expect(
      warnWhenEmailChangeUrlIsLocal(
        "staging",
        "https://staging.example.com/confirm-email-change",
        warn,
      ),
    ).toBe(false);
  });
});
