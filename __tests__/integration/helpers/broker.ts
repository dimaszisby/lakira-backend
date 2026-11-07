import { connectRabbitMQ } from "@/shared/infrastructure/queue/RabbitMQConnection.js";

/**
 * Waits until the shared RabbitMQ connection is up, or rejects after `timeoutMs`.
 *
 * `AmqpConnectionManager.connect()` waits for the next `connect` event. With
 * `RABBITMQ_ENABLED=true` in the environment, the app's own publisher opens the connection
 * first, and `connect()` then waits for an event that never comes: every queue suite timed
 * out locally. CI runs them with the flag off and was not affected (queue-failure-paths,
 * Discovered). Rejecting rather than retrying keeps Jest from hanging when no broker is
 * reachable.
 */
export const awaitBroker = async (timeoutMs: number): Promise<void> => {
  const connection = connectRabbitMQ();
  if (connection.isConnected()) return;
  await connection.connect({ timeout: timeoutMs });
};
