import { describe, it, expect } from "@jest/globals";
import { scrubSentryEvent } from "@/utils/sentry-scrub.js";

describe("scrubSentryEvent", () => {
  it("redacts credential headers but keeps ordinary ones", () => {
    const event = scrubSentryEvent({
      request: {
        headers: {
          authorization: "Bearer eyJhbGciOi...",
          cookie: "lakira_refresh=abc123",
          "content-type": "application/json",
          "user-agent": "jest/1.0",
        },
      },
    });

    expect(event.request!.headers).toEqual({
      authorization: "***REDACTED***",
      cookie: "***REDACTED***",
      "content-type": "application/json",
      "user-agent": "jest/1.0",
    });
  });

  it("drops the cookies collection entirely", () => {
    const event = scrubSentryEvent({
      request: { cookies: { lakira_refresh: "abc123" } },
    });

    expect(event.request).not.toHaveProperty("cookies");
  });

  it("redacts secrets in the request body while keeping the rest", () => {
    const event = scrubSentryEvent({
      request: {
        data: {
          email: "user@example.com",
          password: "Password123!",
          passwordConfirmation: "Password123!",
        },
      },
    });

    expect(event.request!.data).toEqual({
      email: "user@example.com",
      password: "***REDACTED***",
      passwordConfirmation: "***REDACTED***",
    });
  });

  // This is the path sendDefaultPii:false does NOT cover — see D-02.
  it("redacts secrets passed explicitly via extra", () => {
    const event = scrubSentryEvent({
      extra: { refreshToken: "raw-secret", attemptCount: 3 },
    });

    expect(event.extra).toEqual({
      refreshToken: "***REDACTED***",
      attemptCount: 3,
    });
  });

  it("redacts nested secrets in contexts", () => {
    const event = scrubSentryEvent({
      contexts: { session: { userId: "user-1", accessToken: "jwt-abc" } },
    });

    expect(event.contexts).toEqual({
      session: { userId: "user-1", accessToken: "***REDACTED***" },
    });
  });

  it("passes through an event with nothing to scrub", () => {
    expect(scrubSentryEvent({})).toEqual({});
  });
});
