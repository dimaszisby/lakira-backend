import { randomUUID } from "node:crypto";
import type { Channel, ConsumeMessage } from "amqplib";
import { absorbChannelErrors, connectRabbitMQ } from "./RabbitMQConnection.js";
import { ReopeningChannel } from "./ReopeningChannel.js";
import { assertRetryTier, assertTopology, retryQueueFor } from "./topology.js";
import {
  RETRY_COUNT_HEADER,
  decideOnFailure,
  readRetryCount,
} from "./retryPolicy.js";
import { env } from "@/config/envManager.js";
import logger from "@/utils/logger.js";
import {
  REQUEST_ID_HEADER,
  REQUEST_ID_PATTERN,
  requestIdStorage,
} from "@/shared/middleware/request-id.js";
import type {
  MessagePayload,
  MessageQueuePort,
} from "@/shared/application/ports/MessageQueuePort.js";
import type { MessageHandler } from "@/shared/application/ports/MessageHandlerPort.js";
import type { JobSlots } from "./JobSlots.js";

/**
 * The id a job is handled under: the publishing request's, when the header holds one the HTTP
 * middleware would honour, otherwise a minted one (audit 2026-10-20 N4). Held to the same
 * pattern, so a header cannot write arbitrary text onto the worker's log lines.
 */
const requestIdOf = (msg: ConsumeMessage): string => {
  const header: unknown = msg.properties.headers?.[REQUEST_ID_HEADER];
  return typeof header === "string" && REQUEST_ID_PATTERN.test(header)
    ? header
    : randomUUID();
};

export interface ConsumerOptions {
  queue: string;
  handler: MessageHandler;
  /** Republishes a failed message to the queue's retry queue. */
  publisher: MessageQueuePort;
  /**
   * The worker's slots, shared by every consumer it holds: a job runs only
   * when one is free, so jobs never outnumber the pool's connections (ADR-0100).
   * Required, so no consumer can be built without them.
   */
  slots: JobSlots;
  prefetch?: number;
  /** Retries before parking. 0 parks on the first failure. */
  maxRetries?: number;
  /** Delay before the first retry; doubles with each one, up to MAX_RETRY_DELAY_MS. */
  retryBaseDelayMs?: number;
}

export class RabbitMQConsumer {
  private channel: ReopeningChannel<Channel>;
  // The consumer is registered on the raw channel, which the wrapper does not
  // track, so only that channel can cancel it (worker-cancel-and-one-connection-per-job D-01).
  private consumerChannel: Channel | null = null;
  private consumerTag: string | null = null;
  private stopping = false;
  private inFlight = 0;
  private drainResolvers: Array<() => void> = [];
  // Aborted by cancel(): a message still waiting for a slot then goes back to
  // the queue unstarted, and the drain does not wait on it (ADR-0100).
  private readonly stop = new AbortController();
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;

  constructor(private readonly options: ConsumerOptions) {
    // No more held than could run: a message prefetched past the slots only
    // waits here, unacked, where another worker cannot take it (ADR-0100).
    const prefetch = Math.min(
      options.prefetch ?? env.RABBITMQ_PREFETCH,
      options.slots.size,
    );
    this.maxRetries = options.maxRetries ?? env.RABBITMQ_MAX_RETRIES;
    this.retryBaseDelayMs =
      options.retryBaseDelayMs ?? env.RABBITMQ_RETRY_BASE_DELAY_MS;
    // Opened again when the broker closes it; the library alone would wait for a
    // reconnect that never comes while the connection stays up (ADR-0102).
    this.channel = new ReopeningChannel<Channel>(connectRabbitMQ(), {
      name: `consumer:${options.queue}`,
      setup: async (ch) => {
        absorbChannelErrors(ch, `consumer:${options.queue}`);
        await assertTopology(ch);
        // A reconnect or a reopen during the drain re-runs setup: it must not consume again.
        if (this.stopping) return;
        await ch.prefetch(prefetch);
        // A message delivered on this channel and still waiting for a slot
        // when the channel closes was requeued by the broker with it: it must
        // not run here, where its ack can no longer land (ADR-0100).
        const channelGone = new AbortController();
        ch.once("close", () =>
          channelGone.abort(new Error("consumer channel closed")),
        );

        const { consumerTag } = await ch.consume(
          options.queue,
          (msg) => {
            if (!msg) {
              this.onBrokerCancel(ch);
              return;
            }
            this.dispatch(ch, msg, channelGone.signal);
          },
          { noAck: false },
        );

        // cancel() ran while consume was pending: it had no tag to cancel.
        if (this.stopping) {
          await ch.cancel(consumerTag);
          return;
        }
        this.consumerChannel = ch;
        this.consumerTag = consumerTag;
        logger.info("[RABBITMQ] Consumer registered.", {
          queue: options.queue,
          consumerTag,
          prefetch,
          maxRetries: this.maxRetries,
        });
      },
      // A failed setup is emitted here; with no listener it took the worker down (audit
      // 2026-10-20 X63). The broker closes such a channel, and it is reopened (ADR-0102).
      onError: (error) => {
        logger.error(
          "[RABBITMQ] Consumer channel failed; consuming nothing until it reopens.",
          { queue: options.queue, error },
        );
      },
      // Its consumer went with the channel; cancel() has nothing left to cancel.
      onLost: () => {
        this.consumerChannel = null;
        this.consumerTag = null;
      },
    });
  }

  /**
   * The broker cancelled the consumer: its queue was deleted. The channel stays open, so
   * nothing would reopen it, and the worker would consume nothing from the queue (#312).
   * Closing the channel hands it to the reopen, whose setup declares the queue again.
   */
  private onBrokerCancel(ch: Channel): void {
    if (this.stopping) return;
    if (this.consumerChannel === ch) {
      this.consumerChannel = null;
      this.consumerTag = null;
    }
    logger.warn("[RABBITMQ] Consumer cancelled by the broker; reopening.", {
      queue: this.options.queue,
    });
    ch.close().catch((error: unknown) => {
      logger.warn(
        "[RABBITMQ] Could not close a cancelled consumer's channel.",
        {
          queue: this.options.queue,
          error,
        },
      );
    });
  }

  private dispatch(
    ch: Channel,
    msg: ConsumeMessage,
    channelGone: AbortSignal,
  ): void {
    requestIdStorage.run(requestIdOf(msg), () =>
      this.handle(ch, msg, channelGone),
    );
  }

  private handle(
    ch: Channel,
    msg: ConsumeMessage,
    channelGone: AbortSignal,
  ): void {
    this.inFlight++;

    const retryCount = readRetryCount(msg.properties.headers);

    this.runInSlot(ch, msg, retryCount, channelGone)
      .catch((error: unknown) => {
        // The channel closed under an ack or nack. The broker redelivers the message,
        // so log rather than let the rejection take the worker down.
        logger.error("[RABBITMQ] Could not settle message.", {
          messageId: msg.properties.messageId,
          queue: this.options.queue,
          error,
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

  /**
   * Waits for one of the worker's slots, runs the handler, frees the slot as
   * soon as the handler settles (its transaction has committed or rolled
   * back), then acks the message or hands the failure to onFailure.
   */
  private async runInSlot(
    ch: Channel,
    msg: ConsumeMessage,
    retryCount: number,
    channelGone: AbortSignal,
  ): Promise<void> {
    const { slots } = this.options;
    if (slots.running >= slots.size) {
      logger.debug("[RABBITMQ] Message waiting for a job slot.", {
        queue: this.options.queue,
        running: slots.running,
        waiting: slots.waiting + 1,
      });
    }

    let release: () => void;
    try {
      // One signal per message, so waiters add no listeners to a shared one.
      release = await slots.acquire(
        AbortSignal.any([this.stop.signal, channelGone]),
      );
    } catch {
      if (channelGone.aborted) {
        // The broker requeued it when the channel closed; a new channel
        // delivers it again.
        logger.debug(
          "[RABBITMQ] Message dropped unstarted: its channel closed.",
          {
            messageId: msg.properties.messageId,
            queue: this.options.queue,
          },
        );
        return;
      }
      // Stopping. It never started, so it goes back to the queue as it came,
      // with no retry counted; the broker delivers it again later.
      ch.nack(msg, false, true);
      logger.info("[RABBITMQ] Message returned unstarted at shutdown.", {
        messageId: msg.properties.messageId,
        queue: this.options.queue,
      });
      return;
    }

    let failure: { error: unknown } | null = null;
    try {
      await this.options.handler(msg, { queue: this.options.queue });
    } catch (error) {
      failure = { error };
    } finally {
      release();
    }

    if (failure) {
      await this.onFailure(ch, msg, retryCount, failure.error);
      return;
    }
    ch.ack(msg);
    logger.info("[RABBITMQ] Message acked.", {
      messageId: msg.properties.messageId,
      queue: this.options.queue,
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
      error,
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
    // The message waits in the queue of its delay, declared first: the publisher marks
    // it mandatory, so a missing queue would return it (ADR-0073).
    try {
      await assertRetryTier(ch, this.options.queue, decision.delayMs);
      await this.options.publisher.publish(
        "",
        JSON.parse(msg.content.toString()) as MessagePayload,
        {
          routingKey: retryQueueFor(this.options.queue, decision.delayMs),
          messageId: msg.properties.messageId,
          headers: {
            ...msg.properties.headers,
            [RETRY_COUNT_HEADER]: decision.nextRetryCount,
          },
        },
      );
    } catch (publishError) {
      // Never requeue: headers cannot change on redelivery, so that would loop forever.
      logger.error("[RABBITMQ] Retry publish failed — sending to parking.", {
        ...context,
        publishError,
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
    this.stopping = true;
    // No reopen during the drain: it would declare the topology and consume nothing.
    this.channel.stopReopening();
    this.stop.abort(new Error("consumer stopping"));
    const ch = this.consumerChannel;
    const tag = this.consumerTag;
    this.consumerChannel = null;
    this.consumerTag = null;
    if (!ch || !tag) return;
    try {
      await ch.cancel(tag);
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

  async close(drainTimeoutMs?: number): Promise<void> {
    await this.cancel();
    await this.drain(drainTimeoutMs);
    await this.channel.close();
  }
}
