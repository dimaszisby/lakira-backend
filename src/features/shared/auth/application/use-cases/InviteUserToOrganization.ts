import crypto from "node:crypto";
import AppError from "@/utils/AppError.js";
import { OrganizationInviteRepository } from "../../domain/repositories/OrganizationInviteRepository.js";
import { OrganizationRepository } from "../../domain/repositories/OrganizationRepository.js";
import { EmailSender } from "../ports/EmailSender.js";
import type { InviteRole } from "../../domain/entities/OrganizationInvite.js";

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
    private deps: InviteUserToOrganizationDeps,
  ) {}

  async execute(input: InviteUserToOrganizationInput): Promise<void> {
    if (input.inviterRole !== "owner" && input.inviterRole !== "admin") {
      throw new AppError(
        "Forbidden: only owner or admin can invite members",
        403,
      );
    }

    const org = await this.orgRepo.findById(input.organizationId);
    if (!org) {
      throw new AppError("Organization not found", 404);
    }

    const email = input.email.trim().toLowerCase();
    const now = this.deps.now ? this.deps.now() : new Date();

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
      throw new AppError(PENDING_INVITE_EXISTS_MESSAGE, 409);
    }

    const ttlDays = this.deps.ttlDays ?? 7;

    const rawToken = crypto.randomBytes(32).toString("base64url");
    const tokenHash = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");
    const expiresAt = new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000);

    await this.inviteRepo.save({
      organizationId: input.organizationId,
      email,
      role: input.role,
      tokenHash,
      expiresAt,
    });

    const link = this.buildInviteLink(rawToken);
    const message = this.deps.buildEmail(link, org.name, ttlDays);

    await this.emailSender.send({
      to: email,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
  }

  private buildInviteLink(rawToken: string): string {
    const base = this.deps.frontendInviteUrl;
    const separator = base.includes("?") ? "&" : "?";
    return `${base}${separator}token=${encodeURIComponent(rawToken)}`;
  }
}
