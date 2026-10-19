import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "@/shared/domain/errors/DomainError.js";
import crypto, { randomUUID } from "node:crypto";
import logger from "@/utils/logger.js";
import {
  EXCHANGES,
  ROUTING_KEYS,
} from "@/shared/application/messaging/job-routes.js";
import type { MessageQueuePort } from "@/shared/application/ports/MessageQueuePort.js";
import type { PersistenceTransaction } from "@/shared/domain/PersistenceTransaction.js";
import { OrganizationInviteRepository } from "../../domain/repositories/OrganizationInviteRepository.js";
import { OrganizationRepository } from "../../domain/repositories/OrganizationRepository.js";
import { EmailSender, type EmailMessage } from "../ports/EmailSender.js";
import type { TransactionPort } from "../ports/TransactionPort.js";
import type {
  InviteRole,
  OrganizationInvite,
} from "../../domain/entities/OrganizationInvite.js";

/** Also what the repository answers when the unique index refuses a second invite. */
export const PENDING_INVITE_EXISTS_MESSAGE =
  "An invitation is already pending for this email";

export type InviteUserToOrganizationInput = {
  organizationId: string;
  email: string;
  role: InviteRole;
  inviterUserId: string;
  inviterRole: string;
};

/** The whole message: which invite to email. No address, no token (durable-invite-email D-01). */
export type InviteEmailJob = { inviteId: string };

export type InviteUserToOrganizationDeps = {
  frontendInviteUrl: string;
  buildEmail: (
    inviteLink: string,
    organizationName: string,
    expiresInDays: number,
  ) => { subject: string; text: string; html: string };
  ttlDays?: number;
  now?: () => Date;
};

export class InviteUserToOrganization {
  constructor(
    private inviteRepo: OrganizationInviteRepository,
    private orgRepo: OrganizationRepository,
    private emailSender: EmailSender,
    private queue: MessageQueuePort,
    private tx: TransactionPort,
    private deps: InviteUserToOrganizationDeps,
  ) {}

  /**
   * Hands the email to the worker when the queue is on (ADR-0070). Otherwise
   * the invite and the send share one transaction, so a failed send leaves no
   * invite to answer 409 on the retry (D-03).
   */
  async execute(input: InviteUserToOrganizationInput): Promise<void> {
    if (input.inviterRole !== "owner" && input.inviterRole !== "admin") {
      throw new ForbiddenError(
        "Forbidden: only owner or admin can invite members",
      );
    }

    const org = await this.orgRepo.findById(input.organizationId);
    if (!org) {
      throw new NotFoundError("Organization not found");
    }

    const email = input.email.trim().toLowerCase();
    const now = this.now();

    // The unique index covers expired invites too, and none of them can be
    // accepted (kit pending-invite-uniqueness, D-01).
    await this.inviteRepo.deleteExpiredPendingByEmailAndOrg(
      email,
      input.organizationId,
      now,
    );

    const pendingInvite = await this.inviteRepo.findPendingByEmailAndOrg(
      email,
      input.organizationId,
    );
    if (pendingInvite) {
      throw new ConflictError(PENDING_INVITE_EXISTS_MESSAGE);
    }

    const ttlDays = this.ttlDays();
    const { rawToken, tokenHash } = mintToken();
    const data = {
      organizationId: input.organizationId,
      email,
      role: input.role,
      tokenHash,
      expiresAt: new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000),
    };

    if (!this.queue.isEnabled()) {
      await this.tx.runInTransaction(async (tx) => {
        await this.inviteRepo.save(data, tx);
        await this.emailSender.send(this.message(email, org.name, rawToken));
      });
      return;
    }

    // Saved with the hash of a token nobody sees; the sender mints the one it
    // emails (D-02).
    const invite = await this.inviteRepo.save(data);
    const job: InviteEmailJob = { inviteId: invite.id };
    try {
      await this.queue.publish(EXCHANGES.JOBS, job, {
        routingKey: ROUTING_KEYS.AUTH_SEND_INVITE_EMAIL,
        messageId: randomUUID(),
      });
      return;
    } catch (error) {
      logger.warn(
        "[RABBITMQ] Invite email not queued; sending it in the request.",
        {
          inviteId: invite.id,
          error: error instanceof Error ? error.message : String(error),
        },
      );
    }

    try {
      await this.tx.runInTransaction((tx) =>
        this.sendFor(invite, org.name, tx),
      );
    } catch (error) {
      // Nobody received it, so it must not answer 409 on the retry (D-03).
      await this.inviteRepo.deleteById(invite.id);
      throw error;
    }
  }

  /**
   * For the queued job (durable-invite-email D-02). The new token's hash is
   * written through `tx` and a failed send throws, so the caller's transaction
   * rolls it back and the job is retried.
   */
  async executeInTransaction(
    inviteId: string,
    tx: PersistenceTransaction,
  ): Promise<void> {
    const invite = await this.inviteRepo.findById(inviteId, tx);
    if (!invite || invite.isAccepted() || invite.isExpired(this.now())) return;

    const org = await this.orgRepo.findById(invite.organizationId);
    if (!org) return;

    await this.sendFor(invite, org.name, tx);
  }

  /** Replaces the invite's token with one minted here, then sends its link. */
  private async sendFor(
    invite: OrganizationInvite,
    organizationName: string,
    tx: PersistenceTransaction,
  ): Promise<void> {
    const { rawToken, tokenHash } = mintToken();
    await this.inviteRepo.replaceTokenHash(invite.id, tokenHash, tx);
    await this.emailSender.send(
      this.message(invite.email, organizationName, rawToken),
    );
  }

  private message(
    to: string,
    organizationName: string,
    rawToken: string,
  ): EmailMessage {
    const link = this.buildInviteLink(rawToken);
    const message = this.deps.buildEmail(
      link,
      organizationName,
      this.ttlDays(),
    );
    return {
      to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    };
  }

  private now(): Date {
    return this.deps.now ? this.deps.now() : new Date();
  }

  private ttlDays(): number {
    return this.deps.ttlDays ?? 7;
  }

  private buildInviteLink(rawToken: string): string {
    const base = this.deps.frontendInviteUrl;
    const separator = base.includes("?") ? "&" : "?";
    return `${base}${separator}token=${encodeURIComponent(rawToken)}`;
  }
}

const mintToken = (): { rawToken: string; tokenHash: string } => {
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  return { rawToken, tokenHash };
};
