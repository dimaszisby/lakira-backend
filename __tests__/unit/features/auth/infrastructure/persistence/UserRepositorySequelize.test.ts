import { jest } from "@jest/globals";
import { models } from "@/infrastructure/db/models.js";
import { UserRepositorySequelize } from "@/features/auth/infrastructure/persistence/UserRepositorySequelize.js";

const makeRow = () => ({
  id: "user-1",
  email: "user@example.com",
  username: "tester",
  password: "hash",
  isPublicProfile: true,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  reload: jest.fn(),
  update: jest.fn(),
});

describe("UserRepositorySequelize", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("checks uniqueness by email and username", async () => {
    const countSpy = jest.spyOn(models.User, "count") as any;
    countSpy.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    const repo = new UserRepositorySequelize();

    const emailExists = await repo.existsByEmail("user@example.com");
    const usernameExists = await repo.existsByUsername("tester");

    expect(emailExists).toBe(true);
    expect(usernameExists).toBe(false);
    expect(countSpy).toHaveBeenNthCalledWith(1, {
      where: { email: "user@example.com" },
    });
    expect(countSpy).toHaveBeenNthCalledWith(2, {
      where: { username: "tester" },
    });
  });

  it("creates new user rows and maps to domain", async () => {
    const instance = makeRow();
    const createSpy = jest.spyOn(models.User, "create") as any;
    createSpy.mockResolvedValue(instance);
    const repo = new UserRepositorySequelize();

    const result = await repo.create({
      email: "user@example.com",
      username: "tester",
      passwordHash: "hash",
      isPublicProfile: true,
    });

    expect(createSpy).toHaveBeenCalledWith(
      {
        email: "user@example.com",
        username: "tester",
        password: "hash",
        isPublicProfile: true,
      },
      { transaction: undefined },
    );
    expect(instance.reload).toHaveBeenCalledWith({ transaction: undefined });
    expect(result.email).toBe("user@example.com");
    expect(result.username).toBe("tester");
  });

  it("passes a supplied transaction to both create and reload", async () => {
    const instance = makeRow();
    const createSpy = jest.spyOn(models.User, "create") as any;
    createSpy.mockResolvedValue(instance);
    const repo = new UserRepositorySequelize();
    const tx = { fake: "transaction" };

    await repo.create(
      {
        email: "user@example.com",
        username: "tester",
        passwordHash: "hash",
        isPublicProfile: true,
      },
      tx,
    );

    // reload() outside the transaction would not see the uncommitted row.
    expect(createSpy).toHaveBeenCalledWith(expect.anything(), {
      transaction: tx,
    });
    expect(instance.reload).toHaveBeenCalledWith({ transaction: tx });
  });

  it("saves updates on existing users", async () => {
    const instance = makeRow();
    const createSpy = jest.spyOn(models.User, "create") as any;
    const findByPkSpy = jest.spyOn(models.User, "findByPk") as any;
    createSpy.mockResolvedValue(instance);
    findByPkSpy.mockResolvedValue(instance);
    const repo = new UserRepositorySequelize();
    const user = await repo.create({
      email: "temp@example.com",
      username: "temp",
      passwordHash: "hash",
      isPublicProfile: true,
    });

    user.changeEmail("new@example.com");
    user.changeUsername("new");
    user.togglePublicProfile(false);
    user.setPasswordHash("next");
    const saved = await repo.save(user);

    expect(instance.update).toHaveBeenCalledWith({
      email: "new@example.com",
      username: "new",
      password: "next",
      isPublicProfile: false,
      emailVerifiedAt: null,
    });
    expect(instance.reload).toHaveBeenCalled();
    expect(saved.email).toBe("user@example.com");
  });

  it("finds users by id and email", async () => {
    const instance = makeRow();
    const findByPkSpy = jest.spyOn(models.User, "findByPk") as any;
    const findOneSpy = jest.spyOn(models.User, "findOne") as any;
    findByPkSpy.mockResolvedValue(instance);
    findOneSpy.mockResolvedValue(instance);
    const repo = new UserRepositorySequelize();

    const byId = await repo.findById("user-1");
    const byEmail = await repo.findByEmail("user@example.com");

    expect(findByPkSpy).toHaveBeenCalledWith("user-1");
    expect(findOneSpy).toHaveBeenCalledWith({
      where: { email: "user@example.com" },
    });
    expect(byId?.id).toBe("user-1");
    expect(byEmail?.email).toBe("user@example.com");
  });
});
