import { jest } from "@jest/globals";
import {
  ConflictError,
  NotFoundError,
} from "@/shared/domain/errors/DomainError.js";
import { UpdateProfile } from "@/features/auth/application/use-cases/UpdateProfile.js";
import { UserRepository } from "@/features/auth/domain/repositories/UserRepository.js";
import { PasswordHasher } from "@/features/auth/application/ports/PasswordHasher.js";
import { AuthUser } from "@/features/auth/domain/entities/AuthUser.js";

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
  const hasher: jest.Mocked<PasswordHasher> = {
    hash: jest.fn(),
    compare: jest.fn(),
  };
  const sut = new UpdateProfile(repo, hasher);
  return { sut, repo, hasher };
};

describe("UpdateProfile use case", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("updates provided fields and persists user", async () => {
    const { sut, repo, hasher } = build();
    const user = makeUser();
    repo.findById.mockResolvedValue(user);
    repo.existsByEmail.mockResolvedValue(false);
    repo.existsByUsername.mockResolvedValue(false);
    hasher.hash.mockResolvedValue("next-hash");
    repo.save.mockImplementation(async () => user);

    await sut.execute({
      userId: "user-1",
      email: " New@Example.com ",
      username: "new-user",
      password: "Password123!",
      isPublicProfile: false,
    });

    const savedUser = repo.save.mock.calls[0][0];
    expect(savedUser.email).toBe("new@example.com");
    expect(savedUser.username).toBe("new-user");
    expect(savedUser.isPublicProfile).toBe(false);
    expect(savedUser.passwordHash).toBe("next-hash");
  });

  it("throws when user cannot be found", async () => {
    const { sut, repo } = build();
    repo.findById.mockResolvedValue(null);

    await expect(
      sut.execute({ userId: "missing", email: "user@example.com" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("throws when email already taken", async () => {
    const { sut, repo } = build();
    repo.findById.mockResolvedValue(makeUser());
    repo.existsByEmail.mockResolvedValue(true);

    await expect(
      sut.execute({ userId: "user-1", email: "new@example.com" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
