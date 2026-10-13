import jwt from "jsonwebtoken";
import { JwtTokenProvider } from "@/features/auth/infrastructure/providers/JwtTokenProvider.js";
import { InvalidTokenError } from "@/features/auth/domain/errors/InvalidTokenError.js";

const SECRET = "test-secret-key";
const TTL_SEC = 900;

const buildProvider = () => new JwtTokenProvider(SECRET, `${TTL_SEC}s`);

describe("JwtTokenProvider", () => {
  describe("verify()", () => {
    it("returns claims for a valid token", async () => {
      const provider = buildProvider();
      const token = jwt.sign(
        {
          id: "user-1",
          email: "user@example.com",
          username: "tester",
          organizationId: "org-1",
        },
        SECRET,
        { expiresIn: "1h" },
      );

      const claims = await provider.verify(token);

      expect(claims.userId).toBe("user-1");
      expect(claims.email).toBe("user@example.com");
      expect(claims.iat).toEqual(expect.any(Number));
      expect(claims.exp).toEqual(expect.any(Number));
    });

    it("throws InvalidTokenError for an expired token", async () => {
      const provider = buildProvider();
      const token = jwt.sign(
        {
          id: "user-1",
          email: "user@example.com",
          username: "tester",
          organizationId: "org-1",
        },
        SECRET,
        { expiresIn: "-1s" },
      );

      await expect(provider.verify(token)).rejects.toBeInstanceOf(
        InvalidTokenError,
      );
    });

    it("throws InvalidTokenError for a malformed token", async () => {
      const provider = buildProvider();

      await expect(provider.verify("not-a-valid-jwt")).rejects.toBeInstanceOf(
        InvalidTokenError,
      );
    });

    it("throws InvalidTokenError for a token signed with wrong secret", async () => {
      const provider = buildProvider();
      const token = jwt.sign(
        {
          id: "user-1",
          email: "user@example.com",
          username: "tester",
          organizationId: "org-1",
        },
        "wrong-secret",
        { expiresIn: "1h" },
      );

      await expect(provider.verify(token)).rejects.toBeInstanceOf(
        InvalidTokenError,
      );
    });

    it("throws InvalidTokenError when payload lacks required claims", async () => {
      const provider = buildProvider();
      const token = jwt.sign({ foo: "bar" }, SECRET, { expiresIn: "1h" });

      await expect(provider.verify(token)).rejects.toBeInstanceOf(
        InvalidTokenError,
      );
    });
  });

  // Register row B-17: with a string secret the library accepts any HMAC algorithm
  // unless one is named.
  describe("verify() accepts HS256 only", () => {
    const payload = {
      id: "user-1",
      email: "user@example.com",
      organizationId: "org-1",
    };

    it.each(["HS384", "HS512"] as const)(
      "throws InvalidTokenError for a token signed with the right secret under %s",
      async (algorithm) => {
        const provider = buildProvider();
        const token = jwt.sign(payload, SECRET, {
          algorithm,
          expiresIn: "1h",
        });

        await expect(provider.verify(token)).rejects.toBeInstanceOf(
          InvalidTokenError,
        );
      },
    );

    it("throws InvalidTokenError for an unsigned token", async () => {
      const provider = buildProvider();
      const encode = (value: object) =>
        Buffer.from(JSON.stringify(value)).toString("base64url");
      const token = `${encode({ alg: "none", typ: "JWT" })}.${encode({
        ...payload,
        exp: Math.floor(Date.now() / 1000) + 3600,
      })}.`;

      await expect(provider.verify(token)).rejects.toBeInstanceOf(
        InvalidTokenError,
      );
    });
  });

  describe("sign()", () => {
    it("signs with HS256", () => {
      const token = buildProvider().sign({
        id: "user-1",
        email: "user@example.com",
        username: "tester",
        organizationId: "org-1",
      });

      expect(jwt.decode(token, { complete: true })?.header.alg).toBe("HS256");
    });

    it("produces a verifiable JWT", async () => {
      const provider = buildProvider();
      const token = provider.sign({
        id: "user-1",
        email: "user@example.com",
        username: "tester",
        organizationId: "org-1",
      });

      const decoded = jwt.verify(token, SECRET) as any;
      expect(decoded.id).toBe("user-1");
      expect(decoded.email).toBe("user@example.com");
    });
  });
});
