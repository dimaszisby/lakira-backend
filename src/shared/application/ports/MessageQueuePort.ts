export interface MessagePayload {
  [key: string]: unknown;
}

export interface PublishOptions {
  routingKey: string;
  messageId?: string;
  headers?: Record<string, unknown>;
  /** Discard (or dead-letter) the message if still queued after this many ms. */
  expirationMs?: number;
}

export interface MessageQueuePort {
  isEnabled(): boolean;
  publish(
    exchange: string,
    payload: MessagePayload,
    options: PublishOptions,
  ): Promise<void>;
  close(): Promise<void>;
}
