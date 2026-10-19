import { jest } from "@jest/globals";
import {
  NotFoundError,
  UnauthorizedError,
} from "@/shared/domain/errors/DomainError.js";
import { GetProfile } from "@/features/auth/application/queries/GetProfile.js";
import { UserRepository } from "@/features/auth/domain/repositories/UserRepository.js";
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
  const sut = new GetProfile(repo);
  return { sut, repo };
};

describe("GetProfile use case", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("retrieves profile by user id", async () => {
    const { sut, repo } = build();
    const user = makeUser();
    repo.findById.mockResolvedValue(user);

    const result = await sut.execute("user-1");

    expect(repo.findById).toHaveBeenCalledWith("user-1");
    expect(result).toBe(user);
  });

  it("throws when request lacks user id", async () => {
    const { sut } = build();

    await expect(sut.execute("")).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("throws when user cannot be found", async () => {
    const { sut, repo } = build();
    repo.findById.mockResolvedValue(null);

    await expect(sut.execute("missing")).rejects.toBeInstanceOf(NotFoundError);
  });
});
