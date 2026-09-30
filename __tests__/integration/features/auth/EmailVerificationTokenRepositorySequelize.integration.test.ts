import { models } from "@/infrastructure/db/models.js";
import { EmailVerificationTokenRepositorySequelize } from "@/features/auth/infrastructure/persistence/EmailVerificationTokenRepositorySequelize.js";

const FROZEN_NOW = new Date("2026-05-08T10:00:00.000Z");

const createUserRow = async (email = "test@example.com") => {
  const user = await models.User.create({
    email,
    username: `user_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    password: "hashed",
    isPublicProfile: true,
  });
  await user.reload();
  return user;
};

describe("EmailVerificationTokenRepositorySequelize", () => {
  let repo: EmailVerificationTokenRepositorySequelize;

  beforeEach(() => {
    repo = new EmailVerificationTokenRepositorySequelize();
  });

  describe("save()", () => {
    it("persists a new token and returns domain entity", async () => {
      const user = await createUserRow();
      const expiresAt = new Date(FROZEN_NOW.getTime() + 86400 * 1000);

      const token = await repo.save({
        userId: user.id,
        tokenHash: "a".repeat(64),
        expiresAt,
      });

      expect(token.id).toBeDefined();
      expect(token.userId).toBe(user.id);
      expect(token.tokenHash).toBe("a".repeat(64));
      expect(token.usedAt).toBeNull();
      expect(token.expiresAt.toISOString()).toBe(expiresAt.toISOString());
    });
  });

  describe("findByTokenHash()", () => {
    it("returns null for unknown hash", async () => {
      const result = await repo.findByTokenHash("x".repeat(64));
      expect(result).toBeNull();
    });

    it("returns the token for a known hash", async () => {
      const user = await createUserRow("find@example.com");
      const hash = "b".repeat(64);
      await repo.save({
        userId: user.id,
        tokenHash: hash,
        expiresAt: new Date(FROZEN_NOW.getTime() + 86400 * 1000),
      });

      const found = await repo.findByTokenHash(hash);
      expect(found).not.toBeNull();
      expect(found?.tokenHash).toBe(hash);
    });
  });

  describe("revokeAllForUser()", () => {
    it("marks all unused tokens as used", async () => {
      const user = await createUserRow("revoke@example.com");
      await repo.save({
        userId: user.id,
        tokenHash: "e".repeat(64),
        expiresAt: new Date(FROZEN_NOW.getTime() + 86400 * 1000),
      });
      await repo.save({
        userId: user.id,
        tokenHash: "f".repeat(64),
        expiresAt: new Date(FROZEN_NOW.getTime() + 86400 * 1000),
      });

      await repo.revokeAllForUser(user.id, FROZEN_NOW);

      const rows = await models.EmailVerificationToken.findAll({
        where: { userId: user.id },
      });
      expect(rows.every((r) => r.usedAt !== null)).toBe(true);
    });
  });

  describe("markUsed()", () => {
    it("sets usedAt on the token row", async () => {
      const user = await createUserRow("markused@example.com");
      const token = await repo.save({
        userId: user.id,
        tokenHash: "g".repeat(64),
        expiresAt: new Date(FROZEN_NOW.getTime() + 86400 * 1000),
      });

      await repo.markUsed(token.id, FROZEN_NOW);

      const row = await models.EmailVerificationToken.findByPk(token.id);
      expect(row?.usedAt).not.toBeNull();
    });
  });
});
