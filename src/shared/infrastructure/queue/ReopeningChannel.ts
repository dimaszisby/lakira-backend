import type {
  AmqpConnectionManager,
  ChannelWrapper,
} from "amqp-connection-manager";
import type { Channel } from "amqplib";
import logger from "@/utils/logger.js";

// The first wait before a channel the broker closed is reopened, doubled on each
// attempt up to the cap (ADR-0102).
export const REOPEN_BASE_DELAY_MS = 1_000;
export const REOPEN_MAX_DELAY_MS = 30_000;
// How long a channel must stay up before its next close waits only the base delay
// again. A channel that sets up and is closed again at once keeps backing off.
export const REOPEN_STABLE_MS = 30_000;

type Connection = Pick<AmqpConnectionManager, "createChannel" | "isConnected">;

export interface ReopeningChannelOptions<C extends Channel> {
  name: string;
  confirm?: boolean;
  publishTimeout?: number;
  /** Run on every raw channel this opens, as `CreateChannelOpts.setup`. */
  setup: (ch: C) => Promise<void>;
  /** A wrapper's `error`: a setup that failed. */
  onError: (error: unknown) => void;
  /** A wrapper's `connect`: setup finished on a new raw channel. */
  onConnect?: () => void;
  /** The raw channel closed, for any reason but `close()`. */
  onLost?: () => void;
  baseDelayMs?: number;
  maxDelayMs?: number;
  stableMs?: number;
}

/**
 * A channel that is opened again when the broker closes it (#312, ADR-0102).
 *
 * `amqp-connection-manager` runs a channel's setup again only when the whole connection
 * reconnects. A channel the broker closes on its own, after a refused declaration or at
 * runtime, leaves the connection up, so no setup came again: the worker consumed nothing and
 * the publisher waited out its timeout on every publish (audit 2026-11-14 Y61). The library
 * has no public way to set one channel up again, so this replaces the wrapper.
 *
 * After a close it waits, then opens a new wrapper only if the connection is up and no setup
 * has run since: on a connection loss the library's own reconnect sets the current wrapper up
 * again, and this does nothing.
 */
export class ReopeningChannel<C extends Channel> {
  private wrapper: ChannelWrapper;
  // The raw channel the current wrapper's setup last ran on, until it closes.
  private raw: C | null = null;
  // Each wrapper's setup knows its own; a setup from a replaced wrapper closes its channel.
  private generation = 0;
  private closing = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private delayMs: number;
  // When the current channel last connected, for the stability window.
  private connectedAt: number | null = null;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly stableMs: number;

  constructor(
    private readonly connection: Connection,
    private readonly options: ReopeningChannelOptions<C>,
  ) {
    this.baseDelayMs = options.baseDelayMs ?? REOPEN_BASE_DELAY_MS;
    this.maxDelayMs = options.maxDelayMs ?? REOPEN_MAX_DELAY_MS;
    this.stableMs = options.stableMs ?? REOPEN_STABLE_MS;
    this.delayMs = this.baseDelayMs;
    this.wrapper = this.open();
  }

  /** The wrapper to publish, consume or close through; replaced on a reopen. */
  get current(): ChannelWrapper {
    return this.wrapper;
  }

  private open(): ChannelWrapper {
    const generation = ++this.generation;
    const { name, confirm, publishTimeout } = this.options;

    const wrapper = this.connection.createChannel({
      name,
      confirm,
      publishTimeout,
      setup: async (channel: Channel) => {
        // The library hands a ConfirmChannel unless `confirm` is false; its default is
        // true, so the consumer is set up on one too, as it was before (ADR-0102).
        const ch = channel as C;
        // Replaced while this channel was being opened, or stopped: the new wrapper
        // has its own, and a second consumer must not start here.
        if (generation !== this.generation || this.closing) {
          await ch.close().catch(() => undefined);
          return;
        }
        this.raw = ch;
        ch.once("close", () => this.onClose(ch));
        await this.options.setup(ch);
      },
    });

    wrapper.on("error", (error: unknown) => this.options.onError(error));
    wrapper.on("connect", () => {
      this.connectedAt = Date.now();
      this.options.onConnect?.();
    });
    return wrapper;
  }

  private onClose(ch: C): void {
    if (this.raw !== ch) return;
    this.raw = null;
    // A channel that stayed up the window was healthy: its close starts the waits over.
    // One closed soon after it connected keeps doubling them, so a close that recurs on
    // every setup, such as a poisoned message, is not retried once a second (ADR-0102).
    if (
      this.connectedAt !== null &&
      Date.now() - this.connectedAt >= this.stableMs
    ) {
      this.delayMs = this.baseDelayMs;
    }
    this.connectedAt = null;
    if (this.closing) return;
    this.options.onLost?.();
    this.schedule();
  }

  private schedule(): void {
    if (this.timer) return;
    const delayMs = this.delayMs;
    this.delayMs = Math.min(delayMs * 2, this.maxDelayMs);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.reopen(delayMs);
    }, delayMs);
    // A pending reopen never holds a process open.
    this.timer.unref();
  }

  private reopen(delayMs: number): void {
    // Closed meanwhile, or the library's reconnect has already set it up again.
    if (this.closing || this.raw) return;
    // Disconnected: the library's reconnect will set the current wrapper up.
    if (!this.connection.isConnected()) return;

    logger.warn("[RABBITMQ] Reopening a channel the broker closed.", {
      channel: this.options.name,
      delayMs,
    });
    const replaced = this.wrapper;
    replaced.close().catch((error: unknown) => {
      logger.warn("[RABBITMQ] Could not close a replaced channel.", {
        channel: this.options.name,
        error,
      });
    });
    this.wrapper = this.open();
  }

  /**
   * Opens nothing again from here on: a pending reopen is dropped, and a later setup
   * closes its channel. The consumer calls it as it starts stopping, so a reopen does not
   * fire during the drain.
   */
  stopReopening(): void {
    this.closing = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  async close(): Promise<void> {
    this.stopReopening();
    // A channel already closing, the broker's doing or a cancelled consumer's, is
    // refused by amqplib with IllegalOperationError: it is closed all the same.
    await this.wrapper.close().catch((error: unknown) => {
      if (
        (error as { name?: unknown } | null)?.name === "IllegalOperationError"
      )
        return;
      throw error;
    });
  }
}
