export interface MessagePayload {
  [key: string]: unknown;
}

export interface PublishOptions {
  routingKey: string;
  messageId?: string;
  headers?: Record<string, unknown>;
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
