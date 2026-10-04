/**
 * What a queue handler is given. Declared here, not in the broker adapter, so a
 * handler in a feature's application layer does not import the broker's client
 * library (ADR-0058).
 *
 * `IncomingMessage` names only what handlers read. The broker's own message type
 * satisfies it structurally, so the consumer passes its message straight through.
 * A handler that needs another field adds it here first.
 */
export interface IncomingMessage {
  content: Buffer;
  properties: {
    /** Set by the publisher. Untyped on the wire, so handlers validate it. */
    messageId?: unknown;
  };
}

export interface MessageContext {
  /** The queue this consumer reads; handlers need it to record processed messages. */
  queue: string;
}

export type MessageHandler = (
  msg: IncomingMessage,
  context: MessageContext,
) => Promise<void>;
