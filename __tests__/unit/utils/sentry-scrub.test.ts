import { describe, it, expect } from "@jest/globals";
import {
  scrubSentryEvent,
  scrubSentrySpan,
  scrubSentryTransaction,
  scrubText,
} from "@/utils/sentry-scrub.js";

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

// Kit log-redaction-coverage, D-12. Shapes follow @sentry/core's Event,
// Breadcrumb and SpanJSON types. The address sits where a list search, a
// Postgres message or an outgoing request would put it.
const EMAIL = "alice@example.com";
const TOKEN =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
const text = (value: unknown) => JSON.stringify(value);

describe("scrubSentryEvent: the places an address can ride in", () => {
  it("cuts the query string from the URL and drops query_string", () => {
    const event = scrubSentryEvent({
      request: {
        url: `https://api.example/api/v1/metrics?q=${encodeURIComponent(EMAIL)}`,
        query_string: `q=${encodeURIComponent(EMAIL)}`,
      },
    });

    expect(event.request!.url).toBe("https://api.example/api/v1/metrics");
    expect(event.request).not.toHaveProperty("query_string");
  });

  it("keeps a user's id and nothing else", () => {
    const event = scrubSentryEvent({
      user: {
        id: "u-1",
        email: EMAIL,
        username: "alice",
        ip_address: "203.0.113.9",
      },
    });

    expect(event.user).toEqual({ id: "u-1" });
  });

  it("drops a user that has no id", () => {
    const event = scrubSentryEvent({
      user: { email: EMAIL, ip_address: "203.0.113.9" },
    });

    expect(event).not.toHaveProperty("user");
  });

  it("cleans an address, a token and a URL query out of exception text and keeps the rest", () => {
    const event = scrubSentryEvent({
      message: `mail to ${EMAIL} failed`,
      exception: {
        values: [
          {
            type: "Error",
            value: `Key (email)=(${EMAIL}) already exists; token ${TOKEN}; see https://api.example/x?q=${EMAIL}&page=2 for more`,
          },
        ],
      },
    });

    const value = event.exception!.values![0].value;
    expect(value).toBe(
      "Key (email)=([email]) already exists; token [token]; see https://api.example/x for more",
    );
    expect(event.exception!.values![0].type).toBe("Error");
    expect(event.message).toBe("mail to [email] failed");
  });

  it("cleans breadcrumb messages and masks and trims their data", () => {
    const event = scrubSentryEvent({
      breadcrumbs: [
        {
          category: "console",
          level: "error",
          message: `lookup failed for ${EMAIL}`,
        },
        {
          category: "http",
          type: "http",
          data: {
            method: "POST",
            status_code: 500,
            url: `https://mail.example/send?to=${EMAIL}`,
            apiKey: "re_live_123",
          },
        },
      ],
    });

    expect(event.breadcrumbs![0]).toEqual({
      category: "console",
      level: "error",
      message: "lookup failed for [email]",
    });
    expect(event.breadcrumbs![1].data).toEqual({
      method: "POST",
      status_code: 500,
      url: "https://mail.example/send",
      apiKey: "***REDACTED***",
    });
  });

  it("leaves no trace of the address in the audit's five-place event", () => {
    const event = scrubSentryEvent({
      request: {
        url: `https://x/api/v1/metrics?q=${encodeURIComponent(EMAIL)}`,
        query_string: `q=${encodeURIComponent(EMAIL)}`,
        headers: { authorization: "Bearer t" },
        data: { password: "p" },
      },
      user: { email: EMAIL, ip_address: "1.2.3.4" },
      breadcrumbs: [{ message: `GET /metrics?q=${EMAIL}` }],
      exception: {
        values: [{ value: `Key (email)=(${EMAIL}) already exists.` }],
      },
    });

    expect(text(event)).not.toContain(EMAIL);
    expect(text(event)).not.toContain(encodeURIComponent(EMAIL));
    expect(text(event)).not.toContain("1.2.3.4");
  });
});

describe("scrubSentrySpan and scrubSentryTransaction", () => {
  const httpSpan = () => ({
    span_id: "a1",
    trace_id: "t1",
    start_timestamp: 1,
    op: "http.client",
    description: `POST https://mail.example/send?to=${EMAIL}`,
    data: {
      "http.request.method": "POST",
      "url.full": `https://mail.example/send?to=${EMAIL}`,
      "url.query": `to=${EMAIL}`,
      "http.url": `https://mail.example/send?to=${EMAIL}`,
    },
  });

  const dbSpan = () => ({
    span_id: "b2",
    trace_id: "t1",
    start_timestamp: 1,
    op: "db",
    description: `SELECT "id" FROM "users" WHERE "email" = '${EMAIL}' LIMIT 1`,
    data: {
      "db.system": "postgresql",
      "db.statement": `SELECT "id" FROM "users" WHERE "email" = '${EMAIL}' LIMIT 1`,
      "db.query.text": `SELECT "id" FROM "users" WHERE "email" = '${EMAIL}' LIMIT 1`,
      "db.name": "app",
    },
  });

  it("trims a span's URLs and removes its query attributes", () => {
    const span = scrubSentrySpan(httpSpan());

    expect(span.description).toBe("POST https://mail.example/send");
    expect(span.data).toEqual({
      "http.request.method": "POST",
      "url.full": "https://mail.example/send",
      "http.url": "https://mail.example/send",
    });
    expect(span.op).toBe("http.client");
    expect(span.span_id).toBe("a1");
  });

  it("keeps a database span's operation and drops its statement", () => {
    const span = scrubSentrySpan(dbSpan());

    expect(span.description).toBe("SELECT");
    expect(span.data).toEqual({ "db.system": "postgresql", "db.name": "app" });
    expect(text(span)).not.toContain(EMAIL);
  });

  it("scrubs a transaction's request, user, trace data and every span", () => {
    const event = scrubSentryTransaction({
      type: "transaction",
      transaction: "GET /api/v1/metrics",
      request: {
        url: `https://x/api/v1/metrics?q=${EMAIL}`,
        query_string: `q=${EMAIL}`,
        headers: { cookie: "a=b" },
      },
      user: { id: "u-1", email: EMAIL },
      contexts: {
        trace: {
          op: "http.server",
          data: {
            "url.full": `https://x/api/v1/metrics?q=${EMAIL}`,
            "url.query": `q=${EMAIL}`,
            "http.target": `/api/v1/metrics?q=${EMAIL}`,
          },
        },
      },
      spans: [httpSpan(), dbSpan()],
    });

    expect(text(event)).not.toContain(EMAIL);
    expect(event.transaction).toBe("GET /api/v1/metrics");
    expect(event.user).toEqual({ id: "u-1" });
    expect(event.spans).toHaveLength(2);
    expect(event.spans![1].description).toBe("SELECT");
    expect(
      (event.contexts!.trace as { data: Record<string, unknown> }).data,
    ).toEqual({
      "url.full": "https://x/api/v1/metrics",
      "http.target": "/api/v1/metrics",
    });
  });
});

// Added after review: the shapes a first version let through.
describe("scrubText", () => {
  it.each([
    ["an accented local part", "mail josé@example.com now", "mail [email] now"],
    ["an accented domain", "to user@münchen.de.", "to [email]."],
    ["an apostrophe", "from o'brien@example.com", "from [email]"],
    ["a quoted local part", 'from "john.doe"@example.com', "from [email]"],
    ["an encoded at sign", "q=x alice%40example.com", "q=x [email]"],
    [
      "an uppercase scheme",
      "see HTTPS://api.example/x?q=Alice ok",
      "see HTTPS://api.example/x ok",
    ],
    [
      "a quoted path with a query",
      'GET "/api/x?q=Alice Smith" failed',
      'GET "/api/x Smith" failed',
    ],
    ["a host with no scheme", "at api.example/x?q=Alice", "at api.example/x"],
    [
      "a bearer token",
      "sent Bearer abcDEF123456.xyz ok",
      "sent Bearer [token] ok",
    ],
    [
      "a token with an empty signature",
      `t ${TOKEN.split(".").slice(0, 2).join(".")}. end`,
      "t [token] end",
    ],
  ])("cleans %s", (_name, input, expected) => {
    expect(scrubText(input)).toBe(expected);
  });

  it.each([
    "duplicate key value violates unique constraint",
    "Cannot read properties of undefined (reading 'id')",
    "C:\\Users\\app\\dist\\server.js:12:3",
    "is it ready? yes",
    "application/json; charset=utf-8",
  ])("leaves ordinary text alone: %s", (input) => {
    expect(scrubText(input)).toBe(input);
  });

  it("is the same on a second pass", () => {
    const once = scrubText(`Key (email)=(${EMAIL}) at https://x/y?q=1`);
    expect(scrubText(once)).toBe(once);
  });

  it("stays fast on a long run that never completes a match", () => {
    const hostile = `${"a".repeat(200_000)} ${"http://".repeat(20_000)}`;
    const started = Date.now();
    scrubText(hostile);
    expect(Date.now() - started).toBeLessThan(1_000);
  });
});

describe("scrubSentryEvent: what review found", () => {
  it("cleans the raw arguments a console breadcrumb keeps", () => {
    const event = scrubSentryEvent({
      breadcrumbs: [
        {
          category: "console",
          message: `lookup ${EMAIL}`,
          data: {
            arguments: ["lookup", EMAIL, { to: EMAIL, apiKey: "k" }],
            logger: "console",
          },
        },
      ],
    });

    expect(event.breadcrumbs![0].data).toEqual({
      arguments: [
        "lookup",
        "[email]",
        { to: "[email]", apiKey: "***REDACTED***" },
      ],
      logger: "console",
    });
  });

  it("cuts the query string from a referer and keeps other headers", () => {
    const event = scrubSentryEvent({
      request: {
        headers: {
          referer: `https://app.example/metrics?search=${EMAIL}`,
          origin: "https://app.example",
          "user-agent": "Mozilla/5.0 (X11; Linux x86_64)",
          accept: "application/json, text/plain, */*",
        },
      },
    });

    expect(event.request!.headers).toEqual({
      referer: "https://app.example/metrics",
      origin: "https://app.example",
      "user-agent": "Mozilla/5.0 (X11; Linux x86_64)",
      accept: "application/json, text/plain, */*",
    });
  });
});

describe("scrubSentrySpan: what review found", () => {
  it("recognises a database span by its attributes when it has no op", () => {
    const span = scrubSentrySpan({
      description: `INSERT INTO "users" ("email") VALUES ('${EMAIL}')`,
      data: { "db.system": "postgresql", "db.statement": `… '${EMAIL}'` },
    });

    expect(span).toEqual({
      description: "INSERT",
      data: { "db.system": "postgresql" },
    });
  });

  it("drops the client address and gives the same span on a second pass", () => {
    const first = scrubSentrySpan({
      op: "http.server",
      description: "GET /api/v1/metrics?q=Alice",
      data: {
        "http.client_ip": "203.0.113.9",
        "client.address": "203.0.113.9",
        "http.route": "/api/v1/metrics",
      },
    });

    expect(first).toEqual({
      op: "http.server",
      description: "GET /api/v1/metrics",
      data: { "http.route": "/api/v1/metrics" },
    });
    expect(scrubSentrySpan(structuredClone(first))).toEqual(first);
    expect(scrubSentrySpan({ op: "db", description: "" }).description).toBe(
      "DB",
    );
    expect(scrubSentrySpan({ op: "db", description: "DB" }).description).toBe(
      "DB",
    );
  });
});
