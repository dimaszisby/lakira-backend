import { EmailChangeToken as EmailChangeTokenDomain } from "../../domain/entities/EmailChangeToken.js";
import type { EmailChangeToken as EmailChangeTokenModel } from "../persistence/models/email-change-token.sequelize.js";

export const toDomainEmailChangeToken = (
  row: EmailChangeTokenModel,
): EmailChangeTokenDomain =>
  EmailChangeTokenDomain.fromPersistence({
    id: row.id,
    userId: row.userId,
    newEmail: row.newEmail,
    oldEmail: row.oldEmail,
    tokenHash: row.tokenHash ?? null,
    expiresAt: row.expiresAt,
    usedAt: row.usedAt ?? null,
    createdAt: row.createdAt ?? new Date(0),
  });
