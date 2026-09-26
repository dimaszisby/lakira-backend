import { jest } from "@jest/globals";
import { RegisterUser } from "@/features/auth/application/use-cases/RegisterUser.js";
import { UserRepository } from "@/features/auth/domain/repositories/UserRepository.js";
import { OrganizationRepository } from "@/features/auth/domain/repositories/OrganizationRepository.js";
import { MembershipRepository } from "@/features/auth/domain/repositories/MembershipRepository.js";
import { PasswordHasher } from "@/features/auth/application/ports/PasswordHasher.js";
import { TokenProvider } from "@/features/auth/application/ports/TokenProvider.js";
import { TransactionPort } from "@/features/auth/application/ports/TransactionPort.js";
import { IssueRefreshToken } from "@/features/auth/application/use-cases/IssueRefreshToken.js";
import { AuthUser } from "@/features/auth/domain/entities/AuthUser.js";
import { Organization } from "@/features/auth/domain/entities/Organization.js";
import { Membership } from "@/features/auth/domain/entities/Membership.js";
import { RefreshToken } from "@/features/auth/domain/entities/RefreshToken.js";
import AppError from "@/utils/AppError.js";

// Sentinel handed to the use case by the fake TransactionPort. Every write must
// receive this exact value, which is how the test proves they share one
// transaction rather than each opening their own.
const TX = Symbol("transaction");

const makeUser = () =>
  AuthUser.fromPersistence({
    id: "user-1",
    email: "user@example.com",
    username: "tester",
    passwordHash: "hash",
    isPublicProfile: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  });

const makeOrg = () =>
  Organization.fromPersistence({
    id: "org-1",
    name: "Tester",
    slug: "tester-user-1-s",
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  });

const makeMembership = () =>
  Membership.fromPersistence({
    id: "membership-1",
    userId: "user-1",
    organizationId: "org-1",
    role: "owner",
    status: "active",
    joinedAt: new Date(),
  });

const build = () => {
  const repo: jest.Mocked<UserRepository> = {
    existsByEmail: jest.fn(),
    existsByUsername: jest.fn(),
    findById: jest.fn(),
    findByIds: jest.fn(),
    findByEmail: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const orgRepo: jest.Mocked<OrganizationRepository> = {
    findById: jest.fn(),
    findByIds: jest.fn(),
    findBySlug: jest.fn(),
    existsBySlug: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const membershipRepo: jest.Mocked<MembershipRepository> = {
    findById: jest.fn(),
    findByUserAndOrg: jest.fn(),
    findDefaultByUser: jest.fn(),
    findAllByUser: jest.fn(),
    findAllByOrganization: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    countByOrgAndRole: jest.fn(),
    delete: jest.fn(),
  };
  const hasher: jest.Mocked<PasswordHasher> = {
    hash: jest.fn(),
    compare: jest.fn(),
  };
  const token: jest.Mocked<TokenProvider> = {
    sign: jest.fn(),
    verify: jest.fn(),
  };
  const issueRefreshToken = {
    execute: jest.fn(),
    executeInTransaction: jest.fn(),
  } as unknown as jest.Mocked<IssueRefreshToken>;
  const tx: jest.Mocked<TransactionPort> = {
    runInTransaction: jest.fn(async (fn: (t: unknown) => Promise<unknown>) =>
      fn(TX),
    ) as jest.Mocked<TransactionPort>["runInTransaction"],
  };
  const sut = new RegisterUser(
    repo,
    orgRepo,
    membershipRepo,
    hasher,
    token,
    issueRefreshToken,
    tx,
  );
  return {
    sut,
    repo,
    orgRepo,
    membershipRepo,
    hasher,
    token,
    issueRefreshToken,
    tx,
  };
};

const happyPath = (b: ReturnType<typeof build>) => {
  const user = makeUser();
  const org = makeOrg();
  b.repo.existsByEmail.mockResolvedValue(false);
  b.repo.existsByUsername.mockResolvedValue(false);
  b.repo.create.mockResolvedValue(user);
  b.orgRepo.create.mockResolvedValue(org);
  b.membershipRepo.create.mockResolvedValue(makeMembership());
  b.hasher.hash.mockResolvedValue("secure-hash");
  b.token.sign.mockReturnValue("jwt-token");
  b.issueRefreshToken.executeInTransaction.mockResolvedValue({
    rawToken: "raw-refresh-token",
    refreshToken: {} as RefreshToken,
  });
  return { user, org };
};

describe("RegisterUser use case", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("creates a new user with org and membership, returns auth payload", async () => {
    const b = build();
    const { user, org } = happyPath(b);

    const result = await b.sut.execute({
      email: "User@Example.com ",
      username: " Tester ",
      password: "Password123!",
      passwordConfirmation: "Password123!",
    });

    expect(b.repo.existsByEmail).toHaveBeenCalledWith("user@example.com");
    expect(b.repo.existsByUsername).toHaveBeenCalledWith("Tester");
    expect(b.repo.create).toHaveBeenCalledWith(
      {
        email: "user@example.com",
        username: "Tester",
        passwordHash: "secure-hash",
        isPublicProfile: true,
      },
      TX,
    );
    expect(b.orgRepo.create).toHaveBeenCalledWith(
      { name: "Tester", slug: expect.stringMatching(/^tester-/) },
      TX,
    );
    expect(b.membershipRepo.create).toHaveBeenCalledWith(
      {
        userId: user.id,
        organizationId: org.id,
        role: "owner",
        status: "active",
      },
      TX,
    );
    expect(b.token.sign).toHaveBeenCalledWith({
      id: user.id,
      email: user.email,
      username: user.username,
      organizationId: org.id,
    });
    expect(result).toEqual({
      user,
      token: "jwt-token",
      rawRefreshToken: "raw-refresh-token",
    });
  });

  // AC-4: every write shares one transaction handle, so the adapter's
  // sequelize.transaction() can roll all of them back together.
  it("issues the refresh token inside the same transaction as the writes", async () => {
    const b = build();
    const { org, user } = happyPath(b);

    await b.sut.execute({
      email: "user@example.com",
      username: "tester",
      password: "Password123!",
      passwordConfirmation: "Password123!",
    });

    expect(b.tx.runInTransaction).toHaveBeenCalledTimes(1);
    expect(b.issueRefreshToken.executeInTransaction).toHaveBeenCalledWith(
      {
        userId: user.id,
        organizationId: org.id,
        userAgent: null,
        ip: null,
      },
      TX,
    );
    expect(b.issueRefreshToken.execute).not.toHaveBeenCalled();
  });

  // AC-3: without these the refresh-token rows are unattributable in an incident.
  it("passes request context through to the refresh token", async () => {
    const b = build();
    happyPath(b);

    await b.sut.execute({
      email: "user@example.com",
      username: "tester",
      password: "Password123!",
      passwordConfirmation: "Password123!",
      userAgent: "jest/1.0",
      ip: "203.0.113.7",
    });

    expect(b.issueRefreshToken.executeInTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ userAgent: "jest/1.0", ip: "203.0.113.7" }),
      TX,
    );
  });

  // AC-4: a failure mid-sequence aborts the unit of work — no refresh token is
  // issued, and the error reaches the caller so the transaction rolls back.
  it("aborts without issuing a refresh token when a write fails", async () => {
    const b = build();
    happyPath(b);
    b.membershipRepo.create.mockRejectedValue(new Error("membership exploded"));

    await expect(
      b.sut.execute({
        email: "user@example.com",
        username: "tester",
        password: "Password123!",
        passwordConfirmation: "Password123!",
      }),
    ).rejects.toThrow("membership exploded");

    expect(b.issueRefreshToken.executeInTransaction).not.toHaveBeenCalled();
    expect(b.token.sign).not.toHaveBeenCalled();
  });

  it("throws when passwords mismatch", async () => {
    const { sut } = build();

    await expect(
      sut.execute({
        email: "user@example.com",
        username: "tester",
        password: "one",
        passwordConfirmation: "two",
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("throws when email already exists", async () => {
    const { sut, repo } = build();
    repo.existsByEmail.mockResolvedValue(true);

    await expect(
      sut.execute({
        email: "user@example.com",
        username: "tester",
        password: "Password123!",
        passwordConfirmation: "Password123!",
      }),
    ).rejects.toBeInstanceOf(AppError);
  });
});
