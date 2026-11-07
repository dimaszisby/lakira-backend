import { describe, it, expect } from "@jest/globals";
import { buildAmqpUrl } from "@/shared/infrastructure/queue/RabbitMQConnection.js";

/**
 * Kit log-redaction-coverage, D-17 (register row B-21). The user and password
 * were interpolated as they are, so a password holding "@" or "/" built a URL
 * that named the wrong host or none.
 */
const FIELDS = {
  RABBITMQ_URL: undefined,
  RABBITMQ_USER: "svc",
  RABBITMQ_PASSWORD: "p@ss/w:rd",
  RABBITMQ_HOST: "queue.example",
  RABBITMQ_PORT: 5672,
  RABBITMQ_VHOST: "/",
};

describe("buildAmqpUrl", () => {
  it("encodes the user and the password, so they read back whole", () => {
    const url = new URL(buildAmqpUrl({ ...FIELDS, RABBITMQ_USER: "s@vc" }));

    expect(decodeURIComponent(url.username)).toBe("s@vc");
    expect(decodeURIComponent(url.password)).toBe("p@ss/w:rd");
    expect(url.hostname).toBe("queue.example");
    expect(url.port).toBe("5672");
  });

  it("encodes a vhost other than /", () => {
    const url = new URL(buildAmqpUrl({ ...FIELDS, RABBITMQ_VHOST: "app/v1" }));

    expect(url.pathname).toBe("/app%2Fv1");
  });

  it("returns RABBITMQ_URL as given when it is set", () => {
    const given = "amqp://u:p@other.example:5673/vh";

    expect(buildAmqpUrl({ ...FIELDS, RABBITMQ_URL: given })).toBe(given);
  });
});
