import AppError from "@/utils/AppError.js";
import logger from "@/utils/logger.js";
import {
  EmailMessage,
  EmailSender,
} from "../../application/ports/EmailSender.js";

/**
 * How long a send may take. A queued email is sent inside its job's
 * transaction (ADR-0067), so a provider that hangs would hold that
 * transaction's connection for as long as it hangs (ADR-0077).
 */
export const EMAIL_SEND_TIMEOUT_MS = 10_000;

/**
 * Bounds whichever sender `EMAIL_PROVIDER` selects. A send still running at
 * the bound is abandoned and the job fails into retry; if the provider then
 * delivers it anyway, the retry sends it again, at least once, as after a crash.
 */
export class TimeoutEmailSender implements EmailSender {
  constructor(
    private readonly inner: EmailSender,
    private readonly timeoutMs: number = EMAIL_SEND_TIMEOUT_MS,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        // No recipient: an email address is PII (ADR-0049).
        logger.error("[EMAIL] send did not finish in time", {
          subject: message.subject,
          timeoutMs: this.timeoutMs,
        });
        reject(
          new AppError(
            `Email send did not finish within ${this.timeoutMs} ms`,
            500,
          ),
        );
      }, this.timeoutMs);
    });
    try {
      await Promise.race([this.inner.send(message), deadline]);
    } finally {
      clearTimeout(timer);
    }
  }
}
