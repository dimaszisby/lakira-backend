import { jest } from "@jest/globals";
import { createHash } from "node:crypto";
import { InviteUserToOrganization } from "@/features/auth/application/use-cases/InviteUserToOrganization.js";
import { OrganizationInviteRepository } from "@/features/auth/domain/repositories/OrganizationInviteRepository.js";
import { OrganizationRepository } from "@/features/auth/domain/repositories/OrganizationRepository.js";
import { EmailSender } from "@/features/auth/application/ports/EmailSender.js";
import { Organization } from "@/features/auth/domain/entities/Organization.js";
import { OrganizationInvite } from "@/features/auth/domain/entities/OrganizationInvite.js";
import type { InviteUserToOrganizationDeps } from "@/features/auth/application/use-cases/InviteUserToOrganization.js";
import type { TransactionPort } from "@/features/auth/application/ports/TransactionPort.js";
import type { MessageQueuePort } from "@/shared/application/ports/MessageQueuePort.js";
import type { PersistenceTransaction } from "@/shared/domain/PersistenceTransaction.js";
import type { MessageIdempotencyPort } from "@/shared/application/ports/MessageIdempotencyPort.js";
import {
  EXCHANGES,
  QUEUES,
  ROUTING_KEYS,
} from "@/shared/application/messaging/job-routes.js";
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

const INVITE_ID = "6f1c2a4e-8b3d-4e5f-9a7b-1c2d3e4f5a6b";

const makePendingInvite = (
  overrides: { expiresAt?: Date; acceptedAt?: Date | null } = {},
) =>
  OrganizationInvite.fromPersistence({
    id: INVITE_ID,
    organizationId: "org-1",
    email: "invited@example.com",
    role: "member",
    tokenHash: "hash",
    expiresAt: new Date(NOW.getTime() + 7 * 24 * 60 * 60 * 1000),
    acceptedAt: null,
    createdAt: NOW,
    ...overrides,
  });

const TX = { id: "tx" } as unknown as PersistenceTransaction;

const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

/** The raw token in the link the email was built with. */
const tokenInLink = (
  buildEmailMock: jest.Mock<InviteUserToOrganizationDeps["buildEmail"]>,
) => new URL(buildEmailMock.mock.calls[0][0]).searchParams.get("token") ?? "";

const buildEmail = () => ({
  subject: "You've been invited",
  text: "Join us",
  html: "<p>Join us</p>",
});

// queue-failure-paths D-03: a fallback runs the job under the published message's id, so
// the worker's copy of it is a duplicate. This fake runs the work, or reports a duplicate.
const fakeIdempotency = () => {
  const outcome = { next: "processed" as "processed" | "duplicate" };
  const port: jest.Mocked<MessageIdempotencyPort> = {
    runOnce: jest.fn(async (_key, work) => {
      if (outcome.next === "duplicate") return "duplicate";
      await work(TX);
      return "processed";
    }),
  };
  return { port, outcome };
};

const build = ({ queueEnabled = false } = {}) => {
  const idempotency = fakeIdempotency();
  const inviteRepo: jest.Mocked<OrganizationInviteRepository> = {
    save: jest.fn(),
    findById: jest.fn(),
    findByTokenHash: jest.fn(),
    findPendingByEmailAndOrg: jest.fn(),
    deleteExpiredPendingByEmailAndOrg: jest.fn(),
    replaceTokenHash: jest.fn(),
    deleteById: jest.fn(),
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
  const queue: jest.Mocked<MessageQueuePort> = {
    isEnabled: jest.fn(() => queueEnabled),
    publish: jest.fn(async () => undefined),
    close: jest.fn(async () => undefined),
  };
  const tx: TransactionPort = {
    runInTransaction: jest.fn(
      async <T>(fn: (t: PersistenceTransaction) => Promise<T>) => fn(TX),
    ) as TransactionPort["runInTransaction"],
  };
  const buildEmailMock = jest
    .fn<InviteUserToOrganizationDeps["buildEmail"]>()
    .mockReturnValue(buildEmail());
  const sut = new InviteUserToOrganization(
    inviteRepo,
    orgRepo,
    emailSender,
    queue,
    idempotency.port,
    tx,
    {
      frontendInviteUrl: "https://app.example.com/invites/accept",
      buildEmail: buildEmailMock,
      ttlDays: 7,
      now: () => NOW,
    },
  );
  return {
    sut,
    inviteRepo,
    orgRepo,
    emailSender,
    queue,
    buildEmailMock,
    idempotency,
  };
};

const input = {
  organizationId: "org-1",
  email: "invited@example.com",
  role: "member" as const,
  inviterUserId: "user-1",
  inviterRole: "owner",
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
    // With the queue off, the invite is saved inside the send's transaction.
    expect(inviteRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org-1",
        email: "invited@example.com",
        role: "member",
      }),
      TX,
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
    ).rejects.toMatchObject({ kind: "forbidden" });
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
    ).rejects.toMatchObject({ kind: "not_found" });
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
    ).rejects.toMatchObject({ kind: "conflict" });
  });

  // Kit pending-invite-uniqueness, D-01. The unique index covers expired
  // invites too, so re-inviting first deletes an expired one.
  it("deletes an expired invite for the email before saving", async () => {
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

    expect(inviteRepo.deleteExpiredPendingByEmailAndOrg).toHaveBeenCalledWith(
      "invited@example.com",
      "org-1",
      NOW,
    );
    expect(
      inviteRepo.deleteExpiredPendingByEmailAndOrg.mock.invocationCallOrder[0],
    ).toBeLessThan(inviteRepo.save.mock.invocationCallOrder[0]);
  });

  // A concurrent invite that passed the same check loses at the index; the
  // repository answers 409 and no email goes out.
  it("sends no email when save reports a pending invite", async () => {
    const { sut, inviteRepo, orgRepo, emailSender } = build();
    orgRepo.findById.mockResolvedValue(makeOrg());
    inviteRepo.findPendingByEmailAndOrg.mockResolvedValue(null);
    inviteRepo.save.mockRejectedValue(
      new AppError("An invitation is already pending for this email", 409),
    );

    await expect(
      sut.execute({
        organizationId: "org-1",
        email: "invited@example.com",
        role: "member",
        inviterUserId: "user-1",
        inviterRole: "owner",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(emailSender.send).not.toHaveBeenCalled();
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

  // durable-invite-email D-03: the row rolls back with the failed send.
  it("saves and sends inside one transaction with the queue off", async () => {
    const { sut, inviteRepo, orgRepo, emailSender, buildEmailMock } = build();
    orgRepo.findById.mockResolvedValue(makeOrg());
    inviteRepo.findPendingByEmailAndOrg.mockResolvedValue(null);
    inviteRepo.save.mockResolvedValue(makePendingInvite());

    await sut.execute(input);

    expect(inviteRepo.save.mock.calls[0][1]).toBe(TX);
    expect(emailSender.send).toHaveBeenCalledTimes(1);
    // The saved hash is the emailed token's.
    expect(inviteRepo.save.mock.calls[0][0].tokenHash).toBe(
      sha256(tokenInLink(buildEmailMock)),
    );
    expect(inviteRepo.replaceTokenHash).not.toHaveBeenCalled();
  });

  describe("with the queue on (ADR-0070)", () => {
    it("publishes the invite id, and nothing else, and sends nothing in the request", async () => {
      const { sut, inviteRepo, orgRepo, emailSender, queue } = build({
        queueEnabled: true,
      });
      orgRepo.findById.mockResolvedValue(makeOrg());
      inviteRepo.findPendingByEmailAndOrg.mockResolvedValue(null);
      inviteRepo.save.mockResolvedValue(makePendingInvite());

      await sut.execute(input);

      expect(inviteRepo.save.mock.calls[0][1]).toBeUndefined();
      expect(queue.publish).toHaveBeenCalledTimes(1);
      const [exchange, payload, options] = queue.publish.mock.calls[0];
      expect(exchange).toBe(EXCHANGES.JOBS);
      // durable-invite-email D-01: no address, no token in the broker.
      expect(payload).toEqual({ inviteId: INVITE_ID });
      expect(options.routingKey).toBe(ROUTING_KEYS.AUTH_SEND_INVITE_EMAIL);
      expect(options.messageId).toMatch(/^[0-9a-f-]{36}$/);
      expect(emailSender.send).not.toHaveBeenCalled();
    });

    it("sends in the request with a fresh token when the publish fails", async () => {
      const {
        sut,
        inviteRepo,
        orgRepo,
        emailSender,
        queue,
        buildEmailMock,
        idempotency,
      } = build({ queueEnabled: true });
      orgRepo.findById.mockResolvedValue(makeOrg());
      inviteRepo.findPendingByEmailAndOrg.mockResolvedValue(null);
      inviteRepo.save.mockResolvedValue(makePendingInvite());
      inviteRepo.findById.mockResolvedValue(makePendingInvite());
      queue.publish.mockRejectedValueOnce(new Error("Timeout"));

      await expect(sut.execute(input)).resolves.toBeUndefined();

      // queue-failure-paths D-03 (X68): the job itself, under the published id.
      expect(idempotency.port.runOnce).toHaveBeenCalledWith(
        {
          messageId: queue.publish.mock.calls[0][2].messageId,
          queue: QUEUES.AUTH_SEND_INVITE_EMAIL,
        },
        expect.any(Function),
      );

      expect(inviteRepo.replaceTokenHash).toHaveBeenCalledWith(
        INVITE_ID,
        sha256(tokenInLink(buildEmailMock)),
        TX,
      );
      expect(emailSender.send).toHaveBeenCalledTimes(1);
      expect(inviteRepo.deleteById).not.toHaveBeenCalled();
    });

    // D-03: an invite nobody received must not answer 409 on the retry.
    it("deletes the invite and throws when the publish and the send both fail", async () => {
      const { sut, inviteRepo, orgRepo, emailSender, queue } = build({
        queueEnabled: true,
      });
      orgRepo.findById.mockResolvedValue(makeOrg());
      inviteRepo.findPendingByEmailAndOrg.mockResolvedValue(null);
      inviteRepo.save.mockResolvedValue(makePendingInvite());
      inviteRepo.findById.mockResolvedValue(makePendingInvite());
      queue.publish.mockRejectedValueOnce(new Error("Timeout"));
      emailSender.send.mockRejectedValue(new Error("SMTP down"));

      await expect(sut.execute(input)).rejects.toThrow("SMTP down");

      expect(inviteRepo.deleteById).toHaveBeenCalledWith(INVITE_ID);
    });

    it("sends nothing, and keeps the invite, when the worker already sent it", async () => {
      const { sut, inviteRepo, orgRepo, emailSender, queue, idempotency } =
        build({ queueEnabled: true });
      orgRepo.findById.mockResolvedValue(makeOrg());
      inviteRepo.findPendingByEmailAndOrg.mockResolvedValue(null);
      inviteRepo.save.mockResolvedValue(makePendingInvite());
      queue.publish.mockRejectedValueOnce(new Error("Timeout"));
      idempotency.outcome.next = "duplicate";

      await expect(sut.execute(input)).resolves.toBeUndefined();
      expect(emailSender.send).not.toHaveBeenCalled();
      expect(inviteRepo.deleteById).not.toHaveBeenCalled();
    });
  });

  describe("executeInTransaction (the worker's side)", () => {
    it("replaces the token hash through the transaction and sends its link", async () => {
      const { sut, inviteRepo, orgRepo, emailSender, buildEmailMock } = build();
      inviteRepo.findById.mockResolvedValue(makePendingInvite());
      orgRepo.findById.mockResolvedValue(makeOrg());

      await sut.executeInTransaction(INVITE_ID, TX);

      expect(inviteRepo.findById).toHaveBeenCalledWith(INVITE_ID, TX);
      // One connection per job (worker-cancel-and-one-connection-per-job D-02).
      expect(orgRepo.findById).toHaveBeenCalledWith("org-1", TX);
      expect(inviteRepo.replaceTokenHash).toHaveBeenCalledWith(
        INVITE_ID,
        sha256(tokenInLink(buildEmailMock)),
        TX,
      );
      expect(buildEmailMock.mock.calls[0][1]).toBe("Acme Corp");
      expect(emailSender.send.mock.calls[0][0].to).toBe("invited@example.com");
    });

    // D-02: the throw is what rolls the hash back and retries the job.
    it("throws when the send fails", async () => {
      const { sut, inviteRepo, orgRepo, emailSender } = build();
      inviteRepo.findById.mockResolvedValue(makePendingInvite());
      orgRepo.findById.mockResolvedValue(makeOrg());
      emailSender.send.mockRejectedValue(new Error("SMTP down"));

      await expect(sut.executeInTransaction(INVITE_ID, TX)).rejects.toThrow(
        "SMTP down",
      );
    });

    it.each([
      ["gone", null],
      ["accepted", makePendingInvite({ acceptedAt: NOW })],
      ["expired", makePendingInvite({ expiresAt: NOW })],
    ])("sends nothing when the invite is %s", async (_label, invite) => {
      const { sut, inviteRepo, orgRepo, emailSender } = build();
      inviteRepo.findById.mockResolvedValue(invite);
      orgRepo.findById.mockResolvedValue(makeOrg());

      await sut.executeInTransaction(INVITE_ID, TX);

      expect(inviteRepo.replaceTokenHash).not.toHaveBeenCalled();
      expect(emailSender.send).not.toHaveBeenCalled();
    });
  });
});
