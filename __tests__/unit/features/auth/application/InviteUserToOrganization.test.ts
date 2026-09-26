import { jest } from "@jest/globals";
import { InviteUserToOrganization } from "@/features/auth/application/use-cases/InviteUserToOrganization.js";
import { OrganizationInviteRepository } from "@/features/auth/domain/repositories/OrganizationInviteRepository.js";
import { OrganizationRepository } from "@/features/auth/domain/repositories/OrganizationRepository.js";
import { EmailSender } from "@/features/auth/application/ports/EmailSender.js";
import { Organization } from "@/features/auth/domain/entities/Organization.js";
import { OrganizationInvite } from "@/features/auth/domain/entities/OrganizationInvite.js";
import type { InviteUserToOrganizationDeps } from "@/features/auth/application/use-cases/InviteUserToOrganization.js";
import AppError from "@/utils/AppError.js";

const NOW = new Date("2025-06-01T00:00:00Z");

const makeOrg = () =>
  Organization.fromPersistence({
    id: "org-1",
    name: "Acme Corp",
    slug: "acme-corp",
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  });

const makePendingInvite = () =>
  OrganizationInvite.fromPersistence({
    id: "invite-1",
    organizationId: "org-1",
    email: "invited@example.com",
    role: "member",
    tokenHash: "hash",
    expiresAt: new Date(NOW.getTime() + 7 * 24 * 60 * 60 * 1000),
    acceptedAt: null,
    createdAt: NOW,
  });

const buildEmail = () => ({
  subject: "You've been invited",
  text: "Join us",
  html: "<p>Join us</p>",
});

const build = () => {
  const inviteRepo: jest.Mocked<OrganizationInviteRepository> = {
    save: jest.fn(),
    findByTokenHash: jest.fn(),
    findPendingByEmailAndOrg: jest.fn(),
    markAccepted: jest.fn(),
  };
  const orgRepo: jest.Mocked<OrganizationRepository> = {
    findById: jest.fn(),
    findByIds: jest.fn(),
    findBySlug: jest.fn(),
    existsBySlug: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const emailSender: jest.Mocked<EmailSender> = {
    send: jest.fn(),
  };
  const sut = new InviteUserToOrganization(inviteRepo, orgRepo, emailSender, {
    frontendInviteUrl: "https://app.example.com/invites/accept",
    buildEmail: jest
      .fn<InviteUserToOrganizationDeps["buildEmail"]>()
      .mockReturnValue(buildEmail()),
    ttlDays: 7,
    now: () => NOW,
  });
  return { sut, inviteRepo, orgRepo, emailSender };
};

describe("InviteUserToOrganization", () => {
  beforeEach(() => jest.resetAllMocks());

  it("creates invite and sends email for valid owner request", async () => {
    const { sut, inviteRepo, orgRepo, emailSender } = build();
    orgRepo.findById.mockResolvedValue(makeOrg());
    inviteRepo.findPendingByEmailAndOrg.mockResolvedValue(null);
    inviteRepo.save.mockResolvedValue(makePendingInvite());
    emailSender.send.mockResolvedValue(undefined);

    await sut.execute({
      organizationId: "org-1",
      email: "  Invited@Example.COM  ",
      role: "member",
      inviterUserId: "user-1",
      inviterRole: "owner",
    });

    expect(orgRepo.findById).toHaveBeenCalledWith("org-1");
    expect(inviteRepo.findPendingByEmailAndOrg).toHaveBeenCalledWith(
      "invited@example.com",
      "org-1",
    );
    expect(inviteRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        email: "invited@example.com",
        role: "member",
      }),
    );
    expect(emailSender.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: "invited@example.com" }),
    );
  });

  it("allows admin to invite", async () => {
    const { sut, inviteRepo, orgRepo, emailSender } = build();
    orgRepo.findById.mockResolvedValue(makeOrg());
    inviteRepo.findPendingByEmailAndOrg.mockResolvedValue(null);
    inviteRepo.save.mockResolvedValue(makePendingInvite());
    emailSender.send.mockResolvedValue(undefined);

    await expect(
      sut.execute({
        organizationId: "org-1",
        email: "new@example.com",
        role: "member",
        inviterUserId: "user-1",
        inviterRole: "admin",
      }),
    ).resolves.toBeUndefined();
  });

  it("throws 403 when inviter is a regular member", async () => {
    const { sut } = build();

    await expect(
      sut.execute({
        organizationId: "org-1",
        email: "new@example.com",
        role: "member",
        inviterUserId: "user-1",
        inviterRole: "member",
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it("throws 404 when organization does not exist", async () => {
    const { sut, orgRepo } = build();
    orgRepo.findById.mockResolvedValue(null);

    await expect(
      sut.execute({
        organizationId: "org-missing",
        email: "new@example.com",
        role: "member",
        inviterUserId: "user-1",
        inviterRole: "owner",
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("throws 409 when a pending invite already exists", async () => {
    const { sut, orgRepo, inviteRepo } = build();
    orgRepo.findById.mockResolvedValue(makeOrg());
    inviteRepo.findPendingByEmailAndOrg.mockResolvedValue(makePendingInvite());

    await expect(
      sut.execute({
        organizationId: "org-1",
        email: "invited@example.com",
        role: "member",
        inviterUserId: "user-1",
        inviterRole: "owner",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("stores SHA-256 hash, not raw token", async () => {
    const { sut, inviteRepo, orgRepo, emailSender } = build();
    orgRepo.findById.mockResolvedValue(makeOrg());
    inviteRepo.findPendingByEmailAndOrg.mockResolvedValue(null);
    inviteRepo.save.mockResolvedValue(makePendingInvite());
    emailSender.send.mockResolvedValue(undefined);

    await sut.execute({
      organizationId: "org-1",
      email: "new@example.com",
      role: "admin",
      inviterUserId: "user-1",
      inviterRole: "owner",
    });

    const savedData = inviteRepo.save.mock.calls[0][0];
    expect(savedData.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("throws when email sending fails", async () => {
    const { sut, inviteRepo, orgRepo, emailSender } = build();
    orgRepo.findById.mockResolvedValue(makeOrg());
    inviteRepo.findPendingByEmailAndOrg.mockResolvedValue(null);
    inviteRepo.save.mockResolvedValue(makePendingInvite());
    emailSender.send.mockRejectedValue(new Error("SMTP down"));

    await expect(
      sut.execute({
        organizationId: "org-1",
        email: "new@example.com",
        role: "member",
        inviterUserId: "user-1",
        inviterRole: "owner",
      }),
    ).rejects.toThrow("SMTP down");
  });
});
