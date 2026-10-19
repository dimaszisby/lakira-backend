import { describe, it, expect } from "@jest/globals";
import fs from "fs";
import path from "path";
import {
  scrubSentryEvent,
  scrubSentryLog,
  scrubSentrySpan,
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

  // This is the path no SDK setting covers: what the app passes itself — see D-02.
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

  // Kit log-redaction-coverage, D-16: a database error answers 500 and is
  // captured; Postgres quotes a submitted value in some messages.
  it("masks the quoted values of a Sequelize exception and no other", () => {
    const event = scrubSentryEvent({
      exception: {
        values: [
          {
            type: "SequelizeDatabaseError",
            value: 'invalid input syntax for type uuid: "not-a-uuid"',
          },
          { type: "Error", value: 'bad option "verbose"' },
        ],
      },
    });

    expect(event.exception!.values![0].value).toBe(
      'invalid input syntax for type uuid: "[value]"',
    );
    expect(event.exception!.values![1].value).toBe('bad option "verbose"');
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

// Sentry 11 streams spans: `beforeSendSpan` gets a StreamedSpanJSON, with the op as
// the `sentry.op` attribute and a name and attributes where 10 had a description and
// data (sentry-11-data-collection D-03).
describe("scrubSentrySpan", () => {
  const httpSpan = () => ({
    span_id: "a1",
    trace_id: "t1",
    start_timestamp: 1,
    name: `POST https://mail.example/send?to=${EMAIL}`,
    attributes: {
      "sentry.op": "http.client",
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
    name: `SELECT "id" FROM "users" WHERE "email" = '${EMAIL}' LIMIT 1`,
    attributes: {
      "sentry.op": "db",
      "db.system": "postgresql",
      "db.statement": `SELECT "id" FROM "users" WHERE "email" = '${EMAIL}' LIMIT 1`,
      "db.query.text": `SELECT "id" FROM "users" WHERE "email" = '${EMAIL}' LIMIT 1`,
      "db.name": "app",
    },
  });

  it("trims a span's URLs and removes its query attributes", () => {
    const span = scrubSentrySpan(httpSpan());

    expect(span.name).toBe("POST https://mail.example/send");
    expect(span.attributes).toEqual({
      "sentry.op": "http.client",
      "http.request.method": "POST",
      "url.full": "https://mail.example/send",
      "http.url": "https://mail.example/send",
    });
    expect(span.span_id).toBe("a1");
  });

  it("keeps a database span's operation and drops its statement", () => {
    const span = scrubSentrySpan(dbSpan());

    expect(span.name).toBe("SELECT");
    expect(span.attributes).toEqual({
      "sentry.op": "db",
      "db.system": "postgresql",
      "db.name": "app",
    });
    expect(text(span)).not.toContain(EMAIL);
  });

  it("masks a header attribute, now a list of values, by its name", () => {
    const span = scrubSentrySpan({
      name: "GET /api/v1/metrics",
      attributes: {
        "sentry.op": "http.server",
        "http.request.header.authorization": [`Bearer ${TOKEN}`],
        "http.request.header.cookie": ["lakira_refresh=abc123"],
        "http.request.header.accept": ["application/json"],
      },
    });

    expect(span.attributes).toEqual({
      "sentry.op": "http.server",
      "http.request.header.authorization": "***REDACTED***",
      "http.request.header.cookie": "***REDACTED***",
      "http.request.header.accept": ["application/json"],
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
      name: `INSERT INTO "users" ("email") VALUES ('${EMAIL}')`,
      attributes: {
        "db.system": "postgresql",
        "db.query.text": `… '${EMAIL}'`,
      },
    });

    expect(span).toEqual({
      name: "INSERT",
      attributes: { "db.system": "postgresql" },
    });
  });

  it("drops the client address and gives the same span on a second pass", () => {
    const first = scrubSentrySpan({
      name: "GET /api/v1/metrics?q=Alice",
      attributes: {
        "sentry.op": "http.server",
        "http.client_ip": "203.0.113.9",
        "client.address": "203.0.113.9",
        "http.route": "/api/v1/metrics",
      },
    });

    expect(first).toEqual({
      name: "GET /api/v1/metrics",
      attributes: {
        "sentry.op": "http.server",
        "http.route": "/api/v1/metrics",
      },
    });
    expect(scrubSentrySpan(structuredClone(first))).toEqual(first);
    const db = (name: string) =>
      scrubSentrySpan({ name, attributes: { "sentry.op": "db" } }).name;
    expect(db("")).toBe("DB");
    expect(db("DB")).toBe("DB");
  });
});

// Kit log-redaction-coverage, D-13 (audit 2026-10-12, W1). With tracing on, the
// SDK put the request's peer address on the root span under names the scrubber's
// list did not have.
describe("scrubSentrySpan: network addresses", () => {
  const ADDRESSES = ["203.0.113.9", "2001:db8::17", "::ffff:127.0.0.1"];

  // What the SDK's HTTP instrumentation sets at 10.69.0, plus the older
  // socket spellings OpenTelemetry used.
  const SDK_ADDRESS_KEYS = [
    "net.peer.ip",
    "net.host.ip",
    "net.sock.peer.addr",
    "net.sock.host.addr",
    "network.peer.address",
    "network.local.address",
    "http.client_ip",
    "client.address",
  ];

  // Host names, kept on purpose: they are how a trace is read.
  // `address` is Sentry 11's deprecated, namespace-less alias of `server.address`.
  const KEPT_HOST_KEYS = [
    "server.address",
    "address",
    "net.host.name",
    "net.peer.name",
  ];

  // The op attribute is set apart, so each case compares only what it put in.
  const scrubbed = (data: Record<string, unknown>) => {
    const { "sentry.op": _op, ...rest } = scrubSentrySpan({
      name: "GET /x",
      attributes: { "sentry.op": "http.server", ...data },
    }).attributes as Record<string, unknown>;
    return rest;
  };

  it.each(ADDRESSES)("drops every address attribute holding %s", (address) => {
    const data = scrubbed(
      Object.fromEntries(SDK_ADDRESS_KEYS.map((key) => [key, address])),
    );

    expect(data).toEqual({});
  });

  it("drops an address under a name it has never seen", () => {
    const data = scrubbed({
      "some.future.attribute": "203.0.113.9",
      "another.one": "2001:db8::17",
      "http.route": "/api/v1/metrics",
    });

    expect(data).toEqual({ "http.route": "/api/v1/metrics" });
  });

  it.each([
    ["with a port", "203.0.113.9:51234"],
    ["in brackets", "[2001:db8::17]"],
    ["in brackets with a port", "[2001:db8::17]:51234"],
    ["with a zone id", "fe80::1%eth0"],
    ["as a list", "203.0.113.9, 10.0.0.1"],
    ["with spaces around it", " 203.0.113.9 "],
  ])("drops an address written %s", (_shape, value) => {
    expect(scrubbed({ "some.future.attribute": value })).toEqual({});
  });

  it("masks an address inside an array, where there is no key to drop", () => {
    const data = scrubbed({ hops: ["203.0.113.9", "edge-1"] });

    expect(data).toEqual({ hops: ["***REDACTED***", "edge-1"] });
  });

  it("drops a known address key whatever its value looks like", () => {
    const data = scrubbed(
      Object.fromEntries(SDK_ADDRESS_KEYS.map((key) => [key, "unknown"])),
    );

    expect(data).toEqual({});
  });

  it("keeps what a trace is read by", () => {
    const kept = {
      "http.route": "/api/v1/metrics",
      "http.request.method": "GET",
      "http.response.status_code": 200,
      "server.address": "api.example.com",
      "net.host.name": "api.example.com",
      "net.peer.name": "mail.example.com",
      "net.host.port": 5000,
      "net.peer.port": 51234,
      "app.version": "1.2.3",
      "http.response_content_length": 1234,
    };

    expect(scrubbed({ ...kept, "net.peer.ip": "203.0.113.9" })).toEqual(kept);
  });

  it("gives the same span on a second pass", () => {
    const first = scrubSentrySpan({
      name: "GET /x",
      attributes: {
        "sentry.op": "http.server",
        "net.peer.ip": "203.0.113.9",
        hops: ["203.0.113.9"],
      },
    });

    expect(scrubSentrySpan(structuredClone(first))).toEqual(first);
  });

  it("cleans the trace data an error event carries", () => {
    const event = scrubSentryEvent({
      contexts: {
        trace: { data: { "net.peer.ip": "203.0.113.9", "http.route": "/x" } },
      },
    });

    expect(
      (event.contexts?.trace as { data: Record<string, unknown> }).data,
    ).toEqual({ "http.route": "/x" });
  });

  // An SDK upgrade that adds a spelling should fail here, not in an audit. The
  // SDK takes its attribute names from this package, as constants, so its own
  // source cannot be searched for them.
  it("knows every address-like attribute name the installed SDK defines", () => {
    const conventions = require("@sentry/conventions/attributes") as Record<
      string,
      unknown
    >;
    const names = [
      ...new Set(
        Object.values(conventions).filter(
          (value): value is string => typeof value === "string",
        ),
      ),
    ];
    const addressLike = names.filter((name) =>
      /(^|[._])(ip|addr|address|ip_address|client_ip)$/.test(name),
    );

    // The package was found and read: the two names the audit captured are there.
    expect(addressLike).toEqual(
      expect.arrayContaining(["net.peer.ip", "net.host.ip"]),
    );
    expect(addressLike.length).toBeGreaterThanOrEqual(10);
    for (const name of addressLike) {
      if (KEPT_HOST_KEYS.includes(name)) continue;
      // Not an address literal, so only the name can drop it.
      expect([name, scrubbed({ [name]: "unknown" })]).toEqual([name, {}]);
    }
  });
});

// What the review of D-13 found: an address also rides outside span attributes.
describe("scrubSentryEvent: addresses outside span attributes", () => {
  it("masks the address a socket error's context carries", () => {
    const event = scrubSentryEvent({
      contexts: {
        node_system_error: {
          errno: -61,
          code: "ECONNREFUSED",
          syscall: "connect",
          address: "10.0.0.5",
          port: 5432,
        },
      },
      extra: { upstream: { tried: ["10.0.0.5:5432", "db.internal"] } },
    });

    expect(event.contexts?.node_system_error).toEqual({
      errno: -61,
      code: "ECONNREFUSED",
      syscall: "connect",
      address: "[address]",
      port: 5432,
    });
    expect(event.extra).toEqual({
      upstream: { tried: ["[address]", "db.internal"] },
    });
  });

  it("masks an address in exception text and keeps the rest", () => {
    const event = scrubSentryEvent({
      exception: {
        values: [
          { type: "Error", value: "connect ECONNREFUSED 10.0.0.5:5432" },
          {
            type: "Error",
            value: "upstream [2001:db8::17]:443 timed out at 12:30:45.",
          },
        ],
      },
    });

    expect(event.exception?.values?.map((entry) => entry.value)).toEqual([
      "connect ECONNREFUSED [address]",
      "upstream [address] timed out at 12:30:45.",
    ]);
  });

  it("masks an address that is the host of a URL, on the event and on a span", () => {
    const event = scrubSentryEvent({
      request: {
        url: "http://203.0.113.9:5000/api/v1/metrics?q=x",
        headers: {
          host: "203.0.113.9:5000",
          "x-envoy-external-address": "198.51.100.7",
        },
      },
    });
    const span = scrubSentrySpan({
      name: "GET http://198.51.100.7/send",
      attributes: {
        "sentry.op": "http.client",
        "url.full": "http://198.51.100.7:8025/api/v1/send?x=1",
        "db.connection_string": "postgresql://10.0.0.5:5432/app",
        "http.url": "https://mail.example.com/send",
      },
    });

    expect(event.request).toEqual({
      url: "http://[address]/api/v1/metrics",
      headers: { host: "[address]", "x-envoy-external-address": "[address]" },
    });
    expect(span).toEqual({
      name: "GET http://[address]/send",
      attributes: {
        "sentry.op": "http.client",
        "url.full": "http://[address]/api/v1/send",
        "db.connection_string": "postgresql://[address]/app",
        "http.url": "https://mail.example.com/send",
      },
    });
  });

  it.each([
    "api.example.com",
    "v1.2.3",
    "12:30:45",
    "2026-10-13T12:30:45.000Z",
    "Foo::bar",
    "::",
    "deadbeef",
    "GET /api/v1/metrics/00000000-0000-4000-8000-000000000099",
  ])("leaves %s alone", (text) => {
    expect(scrubText(text)).toBe(text);
  });

  it("is the same on a second pass", () => {
    const once = scrubText(
      "connect ECONNREFUSED 10.0.0.5:5432, then [::1]:6379.",
    );

    expect(once).toBe("connect ECONNREFUSED [address], then [address].");
    expect(scrubText(once)).toBe(once);
  });
});

// W5 of audit-2026-10-12 and the review leftovers of D-12 (D-14).
describe("W5: userinfo, three more event fields and logs", () => {
  it.each([
    [
      "a postgres URL",
      "connect failed postgres://app:s3cretpw@db:5432/lakira",
      "connect failed postgres://[credentials]@db:5432/lakira",
    ],
    [
      "a redis URL with no user",
      "redis://:s3cretpw@cache.internal:6379 down",
      "redis://[credentials]@cache.internal:6379 down",
    ],
    [
      "an amqp URL with an address for a host",
      "amqp://guest:s3cretpw@10.0.0.5:5672",
      "amqp://[credentials]@[address]",
    ],
    [
      "an https URL",
      "fetch https://user:s3cretpw@api.example.com/v1?q=1 failed",
      "fetch https://[credentials]@api.example.com/v1 failed",
    ],
    [
      "a quoted email local part with a space",
      'from "a b"@example.com',
      "from [email]",
    ],
  ])("cleans %s in text", (_name, input, expected) => {
    expect(scrubText(input)).toBe(expected);
  });

  it("is the same on a second pass over userinfo", () => {
    const once = scrubText("postgres://app:pw@db/lakira");
    expect(scrubText(once)).toBe(once);
  });

  it("leaves a URL with no userinfo alone", () => {
    expect(scrubText("see https://api.example.com/v1/x")).toBe(
      "see https://api.example.com/v1/x",
    );
  });

  it("strips userinfo from the request URL and keeps its path", () => {
    const event = scrubSentryEvent({
      request: { url: "https://u:pw@h.example/api/v1/metrics/7?x=1" },
    });

    expect(event.request!.url).toBe(
      "https://[credentials]@h.example/api/v1/metrics/7",
    );
  });

  it("strips userinfo from a URL attribute", () => {
    const span = scrubSentrySpan({
      name: "GET https://u:pw@h.example/p",
      attributes: {
        "sentry.op": "http.client",
        "url.full": "https://u:pw@h.example/p?x=1",
      },
    });

    expect(span.name).toBe("GET https://[credentials]@h.example/p");
    expect(span.attributes!["url.full"]).toBe(
      "https://[credentials]@h.example/p",
    );
  });

  it("cleans the transaction name", () => {
    const event = scrubSentryEvent({
      transaction: `GET /api/v1/metrics?email=${EMAIL}`,
    });

    expect(event.transaction).toBe("GET /api/v1/metrics");
  });

  it("cleans tags as attribute data", () => {
    const event = scrubSentryEvent({
      tags: {
        who: EMAIL,
        url: "https://u:p@h.example/x?y=1",
        peer: "203.0.113.9",
        level: 3,
      },
    });

    expect(event.tags).toEqual({
      who: "[email]",
      url: "https://[credentials]@h.example/x",
      level: 3,
    });
  });

  it("cleans the logentry message and its parameters", () => {
    const event = scrubSentryEvent({
      logentry: {
        message: `user ${EMAIL} and %s`,
        params: [EMAIL, 7, { password: "pw" }],
      },
    });

    expect(event.logentry).toEqual({
      message: "user [email] and %s",
      params: ["[email]", 7, { password: "***REDACTED***" }],
    });
  });

  it("cleans a Sentry log's message and attributes", () => {
    // The SDK passes a parameterized message as a String object.
    const message = Object.assign(new String(`login ${EMAIL}`), {
      __sentry_template_string__: "login %s",
      __sentry_template_values__: [EMAIL],
    });
    const log = scrubSentryLog({
      level: "info",
      message,
      attributes: {
        "url.full": "https://u:p@h.example/x?y=1",
        "client.address": "203.0.113.9",
        note: `from ${EMAIL}`,
      },
    });

    expect(log.message).toBe("login [email]");
    expect(log.attributes).toEqual({
      "url.full": "https://[credentials]@h.example/x",
      note: "from [email]",
    });
  });

  // Accepted in D-14 rather than fixed. Changing one of these is a decision.
  it.each([
    ["a single-label domain (D-14)", "who: alice@localhost"],
    [
      "a name in a constraint message (D-14)",
      "Key (name)=(Alice Smith) exists",
    ],
    ["a key with no scheme in front (D-14)", "key sk_live_abcdefghijklmnop"],
  ])("keeps %s", (_name, input) => {
    expect(scrubText(input)).toBe(input);
  });
});
