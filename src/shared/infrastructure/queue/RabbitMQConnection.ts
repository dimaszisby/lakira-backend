import amqp, { type AmqpConnectionManager } from "amqp-connection-manager";
import { env } from "@/config/envManager.js";
import type { Env } from "@/config/zodEnv.js";
import logger from "@/utils/logger.js";

let connection: AmqpConnectionManager | null = null;

type AmqpFields = Pick<
  Env,
  | "RABBITMQ_URL"
  | "RABBITMQ_USER"
  | "RABBITMQ_PASSWORD"
  | "RABBITMQ_HOST"
  | "RABBITMQ_PORT"
  | "RABBITMQ_VHOST"
>;

// The user and password are encoded, so one holding "@", "/" or ":" still names the
// right host (kit log-redaction-coverage, D-17).
export const buildAmqpUrl = (fields: AmqpFields): string => {
  if (fields.RABBITMQ_URL) return fields.RABBITMQ_URL;

  const user = encodeURIComponent(fields.RABBITMQ_USER);
  const password = encodeURIComponent(fields.RABBITMQ_PASSWORD);
  const vhost =
    fields.RABBITMQ_VHOST === "/"
      ? "/"
      : encodeURIComponent(fields.RABBITMQ_VHOST);
  return `amqp://${user}:${password}@${fields.RABBITMQ_HOST}:${fields.RABBITMQ_PORT}/${vhost}`;
};

export const connectRabbitMQ = (): AmqpConnectionManager => {
  if (connection) return connection;

  connection = amqp.connect([buildAmqpUrl(env)]);

  connection.on("connect", () => logger.info("[RABBITMQ] Connected."));
  connection.on("disconnect", ({ err }: { err?: Error }) =>
    logger.warn("[RABBITMQ] Disconnected.", { reason: err?.message }),
  );
  connection.on("connectFailed", ({ err }: { err?: Error }) =>
    logger.error("[RABBITMQ] Connection failed.", { reason: err?.message }),
  );

  return connection;
};

/**
 * Listens on a raw channel for the `error` amqplib emits when the broker closes it, a 406 from
 * a declaration with other arguments for one. `amqp-connection-manager` listens for the close,
 * and reopens the channel, but not for the error, and an `error` nobody listens to is thrown
 * inside amqplib's frame handling, which takes the whole connection down with it (audit
 * 2026-10-20 X63; ADR-0080). Every channel's `setup` calls this first.
 */
export const absorbChannelErrors = (
  channel: {
    on: (event: "error", listener: (error: unknown) => void) => unknown;
  },
  name: string,
): void => {
  channel.on("error", (error: unknown) => {
    logger.warn("[RABBITMQ] Channel closed by the broker.", {
      channel: name,
      error,
    });
  });
};

export const disconnectRabbitMQ = async (): Promise<void> => {
  if (!connection) return;
  try {
    await connection.close();
    connection = null;
    logger.info("[RABBITMQ] Connection closed.");
  } catch (error) {
    logger.error("[RABBITMQ] Error closing connection:", error);
  }
};

export const getRabbitMQConnection = (): AmqpConnectionManager | null =>
  connection;
