import { randomUUID } from "crypto";
import type { ConfirmChannel } from "amqplib";
import type { ChannelWrapper } from "amqp-connection-manager";
import { absorbChannelErrors, connectRabbitMQ } from "./RabbitMQConnection.js";
import { assertTopology } from "./topology.js";
import { env } from "@/config/envManager.js";
import logger from "@/utils/logger.js";
import {
  REQUEST_ID_HEADER,
  requestIdStorage,
} from "@/shared/middleware/request-id.js";
import type {
  MessagePayload,
  MessageQueuePort,
  PublishOptions,
} from "@/shared/application/ports/MessageQueuePort.js";

// How long a publish may wait for the broker before it rejects. Without it, a publish
// made while the broker is unreachable waits for a reconnect that may never come,
// and the request waiting on it with it (durable-verification-email D-04).
export const PUBLISH_TIMEOUT_MS = 3_000;

/**
 * The broker returned the message: no queue is bound for its routing key (ADR-0080). It was
 * confirmed anyway, so without this the caller's fallback never ran and the job was lost
 * (audit 2026-10-20 X64).
 */
export class UnroutableMessageError extends Error {
  constructor(
    readonly exchange: string,
    readonly routingKey: string,
  ) {
    super(
      `No queue is bound for routing key "${routingKey}" on exchange "${exchange}".`,
    );
    this.name = "UnroutableMessageError";
  }
}

export class RabbitMQPublisher implements MessageQueuePort {
  private channel: ChannelWrapper;
  // False from a channel error until the channel connects again (ADR-0080, D-01).
  private available = true;
  // Ids the broker returned, until the publish that sent each one reads it (D-02).
  private returned = new Set<string>();

  constructor() {
    const connection = connectRabbitMQ();
    this.channel = connection.createChannel({
      name: "publisher",
      confirm: true,
      publishTimeout: PUBLISH_TIMEOUT_MS,
      setup: async (ch: ConfirmChannel) => {
        absorbChannelErrors(ch, "publisher");
        // RabbitMQ sends basic.return before the confirm, so the publish sees it.
        ch.on("return", (msg) => {
          const { messageId } = msg.properties;
          if (typeof messageId === "string") this.returned.add(messageId);
          // `route`, not `routingKey`: a key ending in "key" is masked as a secret.
          logger.warn("[RABBITMQ] Unroutable message returned.", {
            exchange: msg.fields.exchange,
            route: msg.fields.routingKey,
            messageId,
          });
        });
        await assertTopology(ch);
      },
    });

    // A failed setup (a queue declared on the broker with other arguments) is emitted here.
    // With no listener it became an unhandled rejection and stopped the API (audit
    // 2026-10-20 X63). The callers already send in process when the queue is off.
    this.channel.on("error", (error: unknown) => {
      this.available = false;
      logger.error(
        "[RABBITMQ] Publisher channel failed; sending in process until it reconnects.",
        { channel: "publisher", error },
      );
    });
    this.channel.on("connect", () => {
      if (!this.available) {
        logger.info("[RABBITMQ] Publisher channel connected again.");
      }
      this.available = true;
    });
  }

  isEnabled(): boolean {
    return env.RABBITMQ_ENABLED && this.available;
  }

  async publish(
    exchange: string,
    payload: MessagePayload,
    options: PublishOptions,
  ): Promise<void> {
    const messageId = options.messageId ?? randomUUID();
    const content = Buffer.from(JSON.stringify(payload));
    // The job is handled under the id of the request that published it (audit N4). A header
    // the caller passes wins: a retry carries the id it was first published under.
    const requestId = requestIdStorage.getStore();
    const headers = requestId
      ? { [REQUEST_ID_HEADER]: requestId, ...options.headers }
      : options.headers;

    try {
      await this.channel.publish(exchange, options.routingKey, content, {
        persistent: true,
        mandatory: true,
        contentType: "application/json",
        messageId,
        headers,
      });
    } catch (error) {
      // A message returned and then timed out is not read below; drop its id here.
      this.returned.delete(messageId);
      throw error;
    }

    if (this.returned.delete(messageId)) {
      throw new UnroutableMessageError(exchange, options.routingKey);
    }

    logger.info("[RABBITMQ] Published message.", {
      exchange,
      route: options.routingKey,
      messageId,
    });
  }

  async close(): Promise<void> {
    await this.channel.close();
  }
}
