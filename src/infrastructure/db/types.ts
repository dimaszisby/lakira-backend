import type { User } from "@/features/auth/infrastructure/persistence/models/user.sequelize.js";
import type { PasswordResetToken } from "@/features/auth/infrastructure/persistence/models/password-reset-token.sequelize.js";
import type { RefreshToken } from "@/features/auth/infrastructure/persistence/models/refresh-token.sequelize.js";
import type { EmailVerificationToken } from "@/features/auth/infrastructure/persistence/models/email-verification-token.sequelize.js";
import type { Organization } from "@/features/auth/infrastructure/persistence/models/organization.sequelize.js";
import type { Membership } from "@/features/auth/infrastructure/persistence/models/membership.sequelize.js";
import type { OrganizationInvite } from "@/features/auth/infrastructure/persistence/models/organization-invite.sequelize.js";
import type { MetricCategory } from "@/features/metric-category/infrastructure/persistence/models/metric-category.sequelize.js";
import type { Metric } from "@/features/metric/infrastructure/persistence/models/metric.sequelize.js";
import type { MetricSettings } from "@/features/metric-settings/infrastructure/persistence/models/metric-settings.sequelize.js";
import type { MetricLog } from "@/features/metric-log/infrastructure/persistence/models/metric-log.sequelize.js";
import type { ProcessedMessage } from "@/shared/infrastructure/queue/persistence/processed-message.sequelize.js";

export type DbModels = {
  User: typeof User;
  PasswordResetToken: typeof PasswordResetToken;
  RefreshToken: typeof RefreshToken;
  EmailVerificationToken: typeof EmailVerificationToken;
  Organization: typeof Organization;
  Membership: typeof Membership;
  OrganizationInvite: typeof OrganizationInvite;
  MetricCategory: typeof MetricCategory;
  Metric: typeof Metric;
  MetricSettings: typeof MetricSettings;
  MetricLog: typeof MetricLog;
  ProcessedMessage: typeof ProcessedMessage;
};
