import AppError from "@/utils/AppError.js";
import logger from "@/utils/logger.js";
import {
  EmailMessage,
  EmailSender,
} from "../../application/ports/EmailSender.js";

/**
 * Delivers mail to a Mailpit catcher through its HTTP send API, so local and
 * VPS-staging mail can be read in Mailpit's inbox or API instead of a log.
 * Refused when NODE_ENV=production (ADR-0048).
 */
export class MailpitEmailSender implements EmailSender {
  constructor(
    private baseUrl: string,
    private from: string,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const url = new URL("/api/v1/send", this.baseUrl);
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          From: { Email: this.from },
          To: [{ Email: message.to }],
          Subject: message.subject,
          HTML: message.html,
          Text: message.text,
        }),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logFailure(message, reason);
      throw new AppError(`Mailpit email send failed: ${reason}`, 500);
    }

    if (!response.ok) {
      const reason = `HTTP ${response.status}`;
      this.logFailure(message, reason);
      throw new AppError(`Mailpit email send failed: ${reason}`, 500);
    }
  }

  private logFailure(message: EmailMessage, reason: string) {
    // No recipient: an email address is PII (.claude/rules/security.md).
    logger.error("[EMAIL:MAILPIT] failed to send email", {
      subject: message.subject,
      error: reason,
    });
  }
}
