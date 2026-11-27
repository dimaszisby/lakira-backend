import logger from "@/utils/logger.js";
import type { PersistenceTransaction } from "@/shared/domain/PersistenceTransaction.js";
import { UserRepository } from "../../domain/repositories/UserRepository.js";
import { EmailChangeTokenRepository } from "../../domain/repositories/EmailChangeTokenRepository.js";
import { EmailSender, type EmailMessage } from "../ports/EmailSender.js";

export const ACCOUNT_NOTICES = [
  "email_change_requested",
  "password_changed",
] as const;
export type AccountNotice = (typeof ACCOUNT_NOTICES)[number];

/**
 * The whole message: ids and which notice, never an address (credential-changes
 * D-05). `requestId` names the pending email change an `email_change_requested`
 * notice is about.
 */
export type AccountNoticeJob = {
  userId: string;
  notice: AccountNotice;
  requestId?: string;
};

type BuiltEmail = { subject: string; text: string; html: string };

export type SendAccountNoticeDeps = {
  buildEmailChangeNotice: (newEmail: string) => BuiltEmail;
  buildPasswordChanged: () => BuiltEmail;
};

/**
 * Sends a notice to the owner of an account: to the address a change was asked
 * from, or to the account's address after its password changed (AC-7, AC-10).
 */
export class SendAccountNotice {
  constructor(
    private userRepo: UserRepository,
    private emailChangeTokenRepo: EmailChangeTokenRepository,
    private emailSender: EmailSender,
    private deps: SendAccountNoticeDeps,
  ) {}

  /** In this process, with the queue off: a failed send is logged, not retried. */
  async execute(job: AccountNoticeJob): Promise<void> {
    try {
      const message = await this.build(job);
      if (message) await this.emailSender.send(message);
    } catch (error) {
      logger.error("Failed to send account notice", {
        userId: job.userId,
        notice: job.notice,
        error,
      });
    }
  }

  /**
   * For the queued job. Every read passes `tx` (ADR-0077), and a failed send
   * throws, so the job is retried.
   */
  async executeInTransaction(
    job: AccountNoticeJob,
    tx: PersistenceTransaction,
  ): Promise<void> {
    const message = await this.build(job, tx);
    if (message) await this.emailSender.send(message);
  }

  /** Null when there is no one left to tell: the row or the user is gone. */
  private async build(
    job: AccountNoticeJob,
    tx?: PersistenceTransaction,
  ): Promise<EmailMessage | null> {
    if (job.notice === "email_change_requested") {
      if (!job.requestId) return null;
      const request = await this.emailChangeTokenRepo.findById(
        job.requestId,
        tx,
      );
      if (!request || request.userId !== job.userId) return null;
      // The old address comes from the row, so the notice reaches it even
      // when the change was confirmed before the job ran (D-02).
      return {
        to: request.oldEmail,
        ...this.deps.buildEmailChangeNotice(request.newEmail),
      };
    }

    const user = await this.userRepo.findById(job.userId, tx);
    if (!user) return null;
    return { to: user.email, ...this.deps.buildPasswordChanged() };
  }
}
