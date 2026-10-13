import jwt, { Secret, SignOptions } from "jsonwebtoken";
import { env } from "@/config/envManager.js";
import {
  TokenClaims,
  TokenPayload,
  TokenProvider,
} from "../../application/ports/TokenProvider.js";
import { InvalidTokenError } from "../../domain/errors/InvalidTokenError.js";

// Stated for both directions, so what is issued and what is accepted cannot drift
// apart on a library default (kit jwt-secret-minimum-length, D-02).
const TOKEN_ALGORITHM = "HS256";

export class JwtTokenProvider implements TokenProvider {
  constructor(
    private secret: Secret = env.JWT_SECRET,
    private expiresIn: SignOptions["expiresIn"] = `${env.ACCESS_TOKEN_TTL_SEC}s`,
  ) {}

  sign(payload: TokenPayload): string {
    return jwt.sign(payload, this.secret, {
      algorithm: TOKEN_ALGORITHM,
      expiresIn: this.expiresIn,
    });
  }

  async verify(token: string): Promise<TokenClaims> {
    try {
      const decoded = jwt.verify(token, this.secret, {
        algorithms: [TOKEN_ALGORITHM],
      }) as {
        id?: string;
        email?: string;
        organizationId?: string;
        iat?: number;
        exp?: number;
      };

      if (!decoded.id || !decoded.email) {
        throw new InvalidTokenError();
      }

      return {
        userId: decoded.id,
        email: decoded.email,
        organizationId: decoded.organizationId ?? null,
        iat: decoded.iat ?? 0,
        exp: decoded.exp ?? 0,
      };
    } catch (err) {
      if (err instanceof InvalidTokenError) throw err;
      throw new InvalidTokenError();
    }
  }
}
