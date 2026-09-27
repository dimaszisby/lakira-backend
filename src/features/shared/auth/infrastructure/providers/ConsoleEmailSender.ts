import logger from "@/utils/logger.js";
import {
  EmailMessage,
  EmailSender,
} from "../../application/ports/EmailSender.js";

/**
 * Logs each email instead of sending it, body included: showing the message is the
 * point. The body carries verify, reset and invite tokens, so the schema refuses
 * EMAIL_PROVIDER=console outside development and test (ADR-0049).
 */
export class ConsoleEmailSender implements EmailSender {
  async send(message: EmailMessage): Promise<void> {
    logger.info("[EMAIL:CONSOLE] outbound email", {
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
  }
}
