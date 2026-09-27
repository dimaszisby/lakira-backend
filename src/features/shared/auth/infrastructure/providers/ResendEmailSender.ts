import { Resend } from "resend";
import AppError from "@/utils/AppError.js";
import logger from "@/utils/logger.js";
import {
  EmailMessage,
  EmailSender,
} from "../../application/ports/EmailSender.js";

type ResendClient = Pick<Resend, "emails">;

export class ResendEmailSender implements EmailSender {
  private client: ResendClient;

  constructor(
    apiKey: string,
    private from: string,
    client?: ResendClient,
  ) {
    this.client = client ?? new Resend(apiKey);
  }

  async send(message: EmailMessage): Promise<void> {
    const { error } = await this.client.emails.send({
      from: this.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });

    if (error) {
      // No recipient: an email address is PII (ADR-0049). The request id on every log
      // line ties the failure to its request.
      logger.error("[EMAIL:RESEND] failed to send email", {
        subject: message.subject,
        error: error.message,
      });
      throw new AppError(`Resend email send failed: ${error.message}`, 500);
    }
  }
}
