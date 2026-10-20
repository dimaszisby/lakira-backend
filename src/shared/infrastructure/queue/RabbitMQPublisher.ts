import { randomUUID } from "crypto";
import type { ConfirmChannel } from "amqplib";
import type { ChannelWrapper } from "amqp-connection-manager";
import { connectRabbitMQ } from "./RabbitMQConnection.js";
import { assertTopology } from "./topology.js";
import { env } from "@/config/envManager.js";
import logger from "@/utils/logger.js";
import type {
  MessagePayload,
  MessageQueuePort,
  PublishOptions,
} from "@/shared/application/ports/MessageQueuePort.js";

// How long a publish may wait for the broker before it rejects. Without it, a publish
// made while the broker is unreachable waits for a reconnect that may never come,
// and the request waiting on it with it (durable-verification-email D-04).
export const PUBLISH_TIMEOUT_MS = 3_000;

export class RabbitMQPublisher implements MessageQueuePort {
  private channel: ChannelWrapper;

  constructor() {
    const connection = connectRabbitMQ();
    this.channel = connection.createChannel({
      name: "publisher",
      confirm: true,
      publishTimeout: PUBLISH_TIMEOUT_MS,
      setup: async (ch: ConfirmChannel) => {
        await assertTopology(ch);
        ch.on("return", (msg) => {
          logger.error("[RABBITMQ] Unroutable message returned.", {
            exchange: msg.fields.exchange,
            routingKey: msg.fields.routingKey,
            messageId: msg.properties.messageId,
          });
        });
      },
    });
  }

  isEnabled(): boolean {
    return env.RABBITMQ_ENABLED;
  }

  async publish(
    exchange: string,
    payload: MessagePayload,
    options: PublishOptions,
  ): Promise<void> {
    const messageId = options.messageId ?? randomUUID();
    const content = Buffer.from(JSON.stringify(payload));

    await this.channel.publish(exchange, options.routingKey, content, {
      persistent: true,
      mandatory: true,
      contentType: "application/json",
      messageId,
      headers: options.headers,
    });

    logger.info("[RABBITMQ] Published message.", {
      exchange,
      routingKey: options.routingKey,
      messageId,
    });
  }

  async close(): Promise<void> {
    await this.channel.close();
  }
}
