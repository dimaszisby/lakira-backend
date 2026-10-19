import { describe, it, expect } from "@jest/globals";
import * as Sentry from "@sentry/node";
import {
  SENTRY_DATA_COLLECTION,
  SENTRY_SCRUB_HOOKS,
} from "@/utils/sentry-scrub.js";

/**
 * The hooks as the SDK runs them: a real client, the hook object `Sentry.init`
 * spreads, and a transport that keeps what would have been sent. Nothing global is
 * set, so no other test sees this client (D-14). Sentry 11: logs need no flag, and
 * spans are streamed, as `Sentry.init` pins them (sentry-11-data-collection D-03).
 */
function build() {
  const sent: string[] = [];
  const decoder = new TextDecoder();
  const client = new Sentry.NodeClient({
    dsn: "https://public@sentry.example/1",
    integrations: [],
    stackParser: Sentry.defaultStackParser,
    tracesSampleRate: 1,
    traceLifecycle: "stream",
    dataCollection: SENTRY_DATA_COLLECTION,
    transport: (options) =>
      Sentry.createTransport(options, async (request) => {
        sent.push(
          typeof request.body === "string"
            ? request.body
            : decoder.decode(request.body),
        );
        return { statusCode: 200 };
      }),
    ...SENTRY_SCRUB_HOOKS,
  });
  client.init();
  const scope = new Sentry.Scope();
  scope.setClient(client);
  return { client, scope, sent: () => sent.join("\n") };
}

describe("SENTRY_SCRUB_HOOKS through the SDK", () => {
  it("scrubs an error event before the transport sees it", async () => {
    const { client, scope, sent } = build();

    client.captureException(
      new Error(
        "connect postgres://app:s3cretpw@db/lakira for alice@example.com",
      ),
      undefined,
      scope,
    );
    await client.flush(2_000);

    expect(sent()).toContain("postgres://[credentials]@db/lakira");
    expect(sent()).toContain("[email]");
    expect(sent()).not.toContain("s3cretpw");
    expect(sent()).not.toContain("alice@example.com");
  });

  it("scrubs a log and its parameters before the transport sees it", async () => {
    const { client, scope, sent } = build();

    Sentry.logger.info(
      Sentry.logger.fmt`login for ${"alice@example.com"}`,
      { "url.full": "https://u:s3cretpw@h.example/x?q=1" },
      { scope },
    );
    await client.flush(2_000);

    expect(sent()).toContain("login for [email]");
    expect(sent()).toContain("https://[credentials]@h.example/x");
    expect(sent()).not.toContain("s3cretpw");
    expect(sent()).not.toContain("alice@example.com");
  });

  it("scrubs a streamed span before the transport sees it", async () => {
    const { client, scope, sent } = build();

    Sentry.withScope(scope, () =>
      Sentry.startSpan(
        {
          name: "POST https://u:s3cretpw@mail.example/send?to=alice@example.com",
          op: "http.client",
          attributes: {
            "url.full":
              "https://u:s3cretpw@mail.example/send?to=alice@example.com",
            "url.query": "to=alice@example.com",
            "http.request.header.authorization": ["Bearer abcDEF123456.xyz"],
            "client.address": "203.0.113.9",
          },
        },
        () => undefined,
      ),
    );
    await client.flush(2_000);

    expect(sent()).toContain("https://[credentials]@mail.example/send");
    expect(sent()).not.toContain("s3cretpw");
    expect(sent()).not.toContain("alice@example.com");
    expect(sent()).not.toContain("abcDEF123456");
    expect(sent()).not.toContain("203.0.113.9");
  });

  it("sends a database span's operation and never its statement", async () => {
    const { client, scope, sent } = build();
    const email = "alice@example.com";
    const statement = `SELECT "id" FROM "users" WHERE "email" = '${email}'`;

    Sentry.withScope(scope, () =>
      Sentry.startSpan(
        {
          name: statement,
          op: "db",
          attributes: {
            "db.system": "postgresql",
            "db.operation.name": "SELECT",
            "db.query.text": statement,
          },
        },
        () => undefined,
      ),
    );
    await client.flush(2_000);

    expect(sent()).toContain('"db.system"');
    expect(sent()).toContain('"name":"SELECT"');
    expect(sent()).not.toContain("alice@example.com");
    expect(sent()).not.toContain("db.query.text");
  });
});
