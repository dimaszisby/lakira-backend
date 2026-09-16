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

export class RabbitMQPublisher implements MessageQueuePort {
  private channel: ChannelWrapper;

  constructor() {
    const connection = connectRabbitMQ();
    this.channel = connection.createChannel({
      name: "publisher",
      confirm: true,
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
      expiration:
        options.expirationMs === undefined
          ? undefined
          : String(options.expirationMs),
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
