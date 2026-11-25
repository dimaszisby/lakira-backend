import { jest } from "@jest/globals";
import { ValidationError } from "@/shared/domain/errors/DomainError.js";
import { ConfirmCurrentPassword } from "@/features/auth/application/use-cases/ConfirmCurrentPassword.js";
import { PasswordHasher } from "@/features/auth/application/ports/PasswordHasher.js";
import { CredentialAttemptsPort } from "@/features/auth/application/ports/CredentialAttemptsPort.js";
import { AuthUser } from "@/features/auth/domain/entities/AuthUser.js";

const makeUser = () =>
  AuthUser.fromPersistence({
    id: "user-1",
    email: "user@example.com",
    username: "tester",
    passwordHash: "stored-hash",
    isPublicProfile: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  });

const build = () => {
  const hasher: jest.Mocked<PasswordHasher> = {
    hash: jest.fn(),
    compare: jest.fn(),
  };
  const attempts: jest.Mocked<CredentialAttemptsPort> = {
    reset: jest.fn(),
  };
  return {
    sut: new ConfirmCurrentPassword(hasher, attempts),
    hasher,
    attempts,
  };
};

describe("ConfirmCurrentPassword (credential-changes D-01, D-04)", () => {
  beforeEach(() => jest.resetAllMocks());

  it("passes, and clears the user's count, when the password matches", async () => {
    const { sut, hasher, attempts } = build();
    hasher.compare.mockResolvedValue(true);

    await sut.execute(makeUser(), "right");

    expect(hasher.compare).toHaveBeenCalledWith("right", "stored-hash");
    expect(attempts.reset).toHaveBeenCalledWith("user-1");
  });

  // The edge reserved the attempt before it got here, so a miss stays counted.
  it("refuses a miss as a 400 on the field, never a 401, and leaves the count", async () => {
    const { sut, hasher, attempts } = build();
    hasher.compare.mockResolvedValue(false);

    const error = await sut.execute(makeUser(), "wrong").catch((e) => e);

    expect(error).toBeInstanceOf(ValidationError);
    expect(error).toMatchObject({
      kind: "validation",
      field: "currentPassword",
      message: "Current password is incorrect",
    });
    expect(attempts.reset).not.toHaveBeenCalled();
  });
});
