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
