import type { Channel, ConsumeMessage } from "amqplib";
import type { ChannelWrapper } from "amqp-connection-manager";
import { connectRabbitMQ } from "./RabbitMQConnection.js";
import { assertTopology } from "./topology.js";
import { env } from "@/config/envManager.js";
import logger from "@/utils/logger.js";

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
  prefetch?: number;
}

export class RabbitMQConsumer {
  private channel: ChannelWrapper;
  private consumerTag: string | null = null;
  private inFlight = 0;
  private drainResolvers: Array<() => void> = [];

  constructor(private readonly options: ConsumerOptions) {
    const prefetch = options.prefetch ?? env.RABBITMQ_PREFETCH;
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
        });
      },
    });
  }

  private dispatch(ch: Channel, msg: ConsumeMessage): void {
    this.inFlight++;

    const retryCount = parseInt(
      (msg.properties.headers?.["x-retry-count"] as string) || "0",
      10,
    );

    this.options
      .handler(msg, { queue: this.options.queue })
      .then(() => {
        ch.ack(msg);
        logger.info("[RABBITMQ] Message acked.", {
          messageId: msg.properties.messageId,
          queue: this.options.queue,
        });
      })
      .catch((error: Error) => {
        logger.error("[RABBITMQ] Handler failed — sending to parking.", {
          messageId: msg.properties.messageId,
          queue: this.options.queue,
          retryCount,
          error: error.message,
        });
        // nack without requeue → DLX routes to parking lot
        ch.nack(msg, false, false);
      })
      .finally(() => {
        this.inFlight--;
        if (this.inFlight === 0) {
          this.drainResolvers.forEach((resolve) => resolve());
          this.drainResolvers = [];
        }
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
