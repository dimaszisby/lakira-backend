import { describe, it, expect } from "@jest/globals";
import * as Sentry from "@sentry/node";
import { SENTRY_SCRUB_HOOKS } from "@/utils/sentry-scrub.js";

/**
 * The hooks as the SDK runs them: a real client, the hook object `Sentry.init`
 * spreads, and a transport that keeps what would have been sent. Nothing global is
 * set, so no other test sees this client (D-14).
 */
function build() {
  const sent: string[] = [];
  const decoder = new TextDecoder();
  const client = new Sentry.NodeClient({
    dsn: "https://public@sentry.example/1",
    integrations: [],
    stackParser: Sentry.defaultStackParser,
    enableLogs: true,
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
});
