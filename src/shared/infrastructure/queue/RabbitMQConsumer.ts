import type { Channel, ConsumeMessage } from "amqplib";
import type { ChannelWrapper } from "amqp-connection-manager";
import { connectRabbitMQ } from "./RabbitMQConnection.js";
import { assertTopology, retryQueueFor } from "./topology.js";
import {
  RETRY_COUNT_HEADER,
  decideOnFailure,
  readRetryCount,
} from "./retryPolicy.js";
import { env } from "@/config/envManager.js";
import logger from "@/utils/logger.js";
import type {
  MessagePayload,
  MessageQueuePort,
} from "@/shared/application/ports/MessageQueuePort.js";

export interface MessageContext {
  /** The queue this consumer reads; handlers need it to record processed messages. */
  queue: string;
}

export type MessageHandler = (
  msg: ConsumeMessage,
  context: MessageContext,
) => Promise<void>;

export interface ConsumerOptions {
  queue: string;
  handler: MessageHandler;
  /** Republishes a failed message to the queue's retry queue. */
  publisher: MessageQueuePort;
  prefetch?: number;
  /** Retries before parking. 0 parks on the first failure. */
  maxRetries?: number;
  /** Delay before the first retry; doubles with each one, up to MAX_RETRY_DELAY_MS. */
  retryBaseDelayMs?: number;
}

export class RabbitMQConsumer {
  private channel: ChannelWrapper;
  private consumerTag: string | null = null;
  private inFlight = 0;
  private drainResolvers: Array<() => void> = [];
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;

  constructor(private readonly options: ConsumerOptions) {
    const prefetch = options.prefetch ?? env.RABBITMQ_PREFETCH;
    this.maxRetries = options.maxRetries ?? env.RABBITMQ_MAX_RETRIES;
    this.retryBaseDelayMs =
      options.retryBaseDelayMs ?? env.RABBITMQ_RETRY_BASE_DELAY_MS;
    const connection = connectRabbitMQ();

    this.channel = connection.createChannel({
      name: `consumer:${options.queue}`,
      setup: async (ch: Channel) => {
        await assertTopology(ch);
        await ch.prefetch(prefetch);

        const { consumerTag } = await ch.consume(
          options.queue,
          (msg) => {
            if (!msg) return;
            this.dispatch(ch, msg);
          },
          { noAck: false },
        );

        this.consumerTag = consumerTag;
        logger.info("[RABBITMQ] Consumer registered.", {
          queue: options.queue,
          consumerTag,
          prefetch,
          maxRetries: this.maxRetries,
        });
      },
    });
  }

  private dispatch(ch: Channel, msg: ConsumeMessage): void {
    this.inFlight++;

    const retryCount = readRetryCount(msg.properties.headers);

    this.options
      .handler(msg, { queue: this.options.queue })
      .then(() => {
        ch.ack(msg);
        logger.info("[RABBITMQ] Message acked.", {
          messageId: msg.properties.messageId,
          queue: this.options.queue,
        });
      })
      .catch((error: unknown) => this.onFailure(ch, msg, retryCount, error))
      .catch((error: unknown) => {
        // The channel closed under an ack or nack. The broker redelivers the message,
        // so log rather than let the rejection take the worker down.
        logger.error("[RABBITMQ] Could not settle message.", {
          messageId: msg.properties.messageId,
          queue: this.options.queue,
          error: error instanceof Error ? error.message : String(error),
        });
      })
      .finally(() => {
        this.inFlight--;
        if (this.inFlight === 0) {
          this.drainResolvers.forEach((resolve) => resolve());
          this.drainResolvers = [];
        }
      });
  }

  private async onFailure(
    ch: Channel,
    msg: ConsumeMessage,
    retryCount: number,
    error: unknown,
  ): Promise<void> {
    const decision = decideOnFailure({
      error,
      retryCount,
      maxRetries: this.maxRetries,
      baseDelayMs: this.retryBaseDelayMs,
    });
    const context = {
      messageId: msg.properties.messageId,
      queue: this.options.queue,
      retryCount,
      error: error instanceof Error ? error.message : String(error),
    };

    if (decision.action === "park") {
      logger.error("[RABBITMQ] Handler failed — sending to parking.", {
        ...context,
        reason: decision.reason,
      });
      // nack without requeue → DLX routes to parking lot
      ch.nack(msg, false, false);
      return;
    }

    const { messageId } = msg.properties;
    if (typeof messageId !== "string" || messageId.length === 0) {
      // The publisher would mint an id, giving the retry an identity the original never had
      // and slipping past the idempotency guard's refusal of unidentifiable messages.
      logger.error(
        "[RABBITMQ] Handler failed on a message with no messageId — sending to parking.",
        context,
      );
      ch.nack(msg, false, false);
      return;
    }

    // Publish, then ack. A crash between the two leaves a duplicate, which the idempotency
    // guard absorbs (ADR-0007); ack-then-publish would lose the message instead.
    try {
      await this.options.publisher.publish(
        "",
        JSON.parse(msg.content.toString()) as MessagePayload,
        {
          routingKey: retryQueueFor(this.options.queue),
          messageId: msg.properties.messageId,
          headers: {
            ...msg.properties.headers,
            [RETRY_COUNT_HEADER]: decision.nextRetryCount,
          },
          expirationMs: decision.delayMs,
        },
      );
    } catch (publishError) {
      // Never requeue: headers cannot change on redelivery, so that would loop forever.
      logger.error("[RABBITMQ] Retry publish failed — sending to parking.", {
        ...context,
        publishError:
          publishError instanceof Error
            ? publishError.message
            : String(publishError),
      });
      ch.nack(msg, false, false);
      return;
    }

    ch.ack(msg);
    logger.warn("[RABBITMQ] Handler failed — retry scheduled.", {
      ...context,
      nextRetryCount: decision.nextRetryCount,
      delayMs: decision.delayMs,
    });
  }

  async cancel(): Promise<void> {
    if (!this.consumerTag) return;
    try {
      await this.channel.cancel(this.consumerTag);
      logger.info("[RABBITMQ] Consumer cancelled.", {
        queue: this.options.queue,
      });
    } catch {
      // channel may already be closed during hard shutdown
    }
  }

  async drain(timeoutMs = 30_000): Promise<void> {
    if (this.inFlight === 0) return;

    return new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        logger.warn("[RABBITMQ] Drain timeout — forcing shutdown.", {
          queue: this.options.queue,
          inFlight: this.inFlight,
        });
        resolve();
      }, timeoutMs);

      this.drainResolvers.push(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  async close(): Promise<void> {
    await this.cancel();
    await this.drain();
    await this.channel.close();
  }
}
