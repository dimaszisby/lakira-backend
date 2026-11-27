import { jest } from "@jest/globals";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/shared/domain/errors/DomainError.js";
import { UpdateProfile } from "@/features/auth/application/use-cases/UpdateProfile.js";
import { UserRepository } from "@/features/auth/domain/repositories/UserRepository.js";
import { AuthUser } from "@/features/auth/domain/entities/AuthUser.js";

const makeUser = (username = "tester") =>
  AuthUser.fromPersistence({
    id: "user-1",
    email: "user@example.com",
    username,
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
  const sut = new UpdateProfile(repo);
  return { sut, repo };
};

describe("UpdateProfile use case", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  // #311 (ADR-0101): the handle rule applies to a new username only.
  describe("the username rule", () => {
    it("accepts a username from before the rule, sent back unchanged", async () => {
      const { sut, repo } = build();
      const user = makeUser("John Smith");
      repo.findById.mockResolvedValue(user);
      repo.save.mockImplementation(async () => user);

      await sut.execute({
        userId: "user-1",
        username: "John Smith",
        isPublicProfile: false,
      });

      expect(repo.existsByUsername).not.toHaveBeenCalled();
      expect(repo.save.mock.calls[0][0].isPublicProfile).toBe(false);
    });

    it.each([
      ["a sentence", "Pay at example.test", "may contain only"],
      ["too long", "a".repeat(51), "at most 50"],
      ["empty", "", "at least 3"],
      ["punctuation only", "...", "needs a letter or digit"],
    ])(
      "refuses a new username that is %s, on its field",
      async (_c, name, text) => {
        const { sut, repo } = build();
        repo.findById.mockResolvedValue(makeUser());

        const refused = sut.execute({ userId: "user-1", username: name });

        await expect(refused).rejects.toBeInstanceOf(ValidationError);
        await expect(refused).rejects.toMatchObject({
          field: "username",
          message: expect.stringContaining(text),
        });
        expect(repo.existsByUsername).not.toHaveBeenCalled();
        expect(repo.save).not.toHaveBeenCalled();
      },
    );
  });

  it("updates the profile fields and persists the user", async () => {
    const { sut, repo } = build();
    const user = makeUser();
    repo.findById.mockResolvedValue(user);
    repo.existsByUsername.mockResolvedValue(false);
    repo.save.mockImplementation(async () => user);

    const result = await sut.execute({
      userId: "user-1",
      username: "new-user",
      isPublicProfile: false,
    });

    const savedUser = repo.save.mock.calls[0][0];
    expect(savedUser.username).toBe("new-user");
    expect(savedUser.isPublicProfile).toBe(false);
    // The credentials are untouched: they have their own routes (credential-changes D-01).
    expect(savedUser.email).toBe("user@example.com");
    expect(savedUser.passwordHash).toBe("hash");
    expect(result).toBe(user);
  });

  it("throws when user cannot be found", async () => {
    const { sut, repo } = build();
    repo.findById.mockResolvedValue(null);

    await expect(
      sut.execute({ userId: "missing", username: "someone" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("throws when the username is already taken", async () => {
    const { sut, repo } = build();
    repo.findById.mockResolvedValue(makeUser());
    repo.existsByUsername.mockResolvedValue(true);

    await expect(
      sut.execute({ userId: "user-1", username: "taken" }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(repo.save).not.toHaveBeenCalled();
  });
});
