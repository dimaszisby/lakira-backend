import { env } from "@/config/envManager.js";
import { redisClient } from "@/utils/redis-client.js";
import {
  checkLockout,
  recordFailedAttempt,
  resetLockout,
  type LockoutRedisClient,
} from "./infrastructure/http/loginLockout.js";
import { UserRepositorySequelize } from "./infrastructure/persistence/UserRepositorySequelize.js";
import { PasswordResetTokenRepositorySequelize } from "./infrastructure/persistence/PasswordResetTokenRepositorySequelize.js";
import { RefreshTokenRepositorySequelize } from "./infrastructure/persistence/RefreshTokenRepositorySequelize.js";
import { EmailVerificationTokenRepositorySequelize } from "./infrastructure/persistence/EmailVerificationTokenRepositorySequelize.js";
import { BcryptPasswordHasher } from "./infrastructure/providers/BcryptPasswordHasher.js";
import { JwtTokenProvider } from "./infrastructure/providers/JwtTokenProvider.js";
import { ConsoleEmailSender } from "./infrastructure/providers/ConsoleEmailSender.js";
import { ResendEmailSender } from "./infrastructure/providers/ResendEmailSender.js";
import { EmailSender } from "./application/ports/EmailSender.js";
import { OrganizationRepositorySequelize } from "./infrastructure/persistence/OrganizationRepositorySequelize.js";
import { MembershipRepositorySequelize } from "./infrastructure/persistence/MembershipRepositorySequelize.js";
import { SequelizeTransactionPort } from "./infrastructure/persistence/SequelizeTransactionPort.js";
import { RegisterUser } from "./application/use-cases/RegisterUser.js";
import { LoginUser } from "./application/use-cases/LoginUser.js";
import { GetProfile } from "./application/queries/GetProfile.js";
import { UpdateProfile } from "./application/use-cases/UpdateProfile.js";
import { RequestPasswordReset } from "./application/use-cases/RequestPasswordReset.js";
import { ResetPassword } from "./application/use-cases/ResetPassword.js";
import { RequestEmailVerification } from "./application/use-cases/RequestEmailVerification.js";
import { VerifyEmail } from "./application/use-cases/VerifyEmail.js";
import { IssueRefreshToken } from "./application/use-cases/IssueRefreshToken.js";
import { RotateRefreshToken } from "./application/use-cases/RotateRefreshToken.js";
import { RevokeRefreshTokenFamily } from "./application/use-cases/RevokeRefreshTokenFamily.js";
import { SwitchOrganization } from "./application/use-cases/SwitchOrganization.js";
import { InviteUserToOrganization } from "./application/use-cases/InviteUserToOrganization.js";
import { AcceptInvite } from "./application/use-cases/AcceptInvite.js";
import { RemoveMembership } from "./application/use-cases/RemoveMembership.js";
import { ChangeMemberRole } from "./application/use-cases/ChangeMemberRole.js";
import { ListOrganizationMembers } from "./application/queries/ListOrganizationMembers.js";
import { ListUserOrganizations } from "./application/queries/ListUserOrganizations.js";
import { OrganizationInviteRepositorySequelize } from "./infrastructure/persistence/OrganizationInviteRepositorySequelize.js";
import { RefreshTokenCrypto } from "./infrastructure/providers/RefreshTokenCrypto.js";
import { buildPasswordResetEmail } from "./infrastructure/email/templates/password-reset.js";
import { buildEmailVerificationEmail } from "./infrastructure/email/templates/email-verification.js";
import { buildOrganizationInviteEmail } from "./infrastructure/email/templates/organization-invite.js";

const buildEmailSender = (): EmailSender => {
  if (env.EMAIL_PROVIDER === "resend") {
    if (!env.RESEND_API_KEY) {
      throw new Error(
        "EMAIL_PROVIDER=resend requires RESEND_API_KEY to be set.",
      );
    }
    return new ResendEmailSender(env.RESEND_API_KEY, env.EMAIL_FROM);
  }
  return new ConsoleEmailSender();
};

export type AuthFeatureOverrides = {
  emailSender?: EmailSender;
  lockoutRedis?: LockoutRedisClient;
};

export const buildAuthFeature = (overrides: AuthFeatureOverrides = {}) => {
  const lockoutRedis: LockoutRedisClient =
    overrides.lockoutRedis ?? (redisClient as unknown as LockoutRedisClient);
  const loginLockout = {
    check: (email: string) => checkLockout(email, lockoutRedis),
    recordFailedAttempt: (email: string) =>
      recordFailedAttempt(email, lockoutRedis),
    reset: (email: string) => resetLockout(email, lockoutRedis),
  };
  const repo = new UserRepositorySequelize();
  const orgRepo = new OrganizationRepositorySequelize();
  const membershipRepo = new MembershipRepositorySequelize();
  const inviteRepo = new OrganizationInviteRepositorySequelize();
  const resetTokenRepo = new PasswordResetTokenRepositorySequelize();
  const refreshTokenRepo = new RefreshTokenRepositorySequelize();
  const emailVerificationTokenRepo =
    new EmailVerificationTokenRepositorySequelize();
  const hasher = new BcryptPasswordHasher();
  const token = new JwtTokenProvider();
  const emailSender = overrides.emailSender ?? buildEmailSender();

  const tx = new SequelizeTransactionPort();

  const tokenHasher = new RefreshTokenCrypto();
  const issueRefreshToken = new IssueRefreshToken(
    refreshTokenRepo,
    tokenHasher,
    env.REFRESH_TOKEN_TTL_DAYS,
  );
  const rotateRefreshToken = new RotateRefreshToken(
    refreshTokenRepo,
    repo,
    membershipRepo,
    token,
    tokenHasher,
    issueRefreshToken,
    refreshTokenRepo,
  );
  const revokeRefreshTokenFamily = new RevokeRefreshTokenFamily(
    refreshTokenRepo,
    tokenHasher,
  );

  return {
    registerUser: new RegisterUser(
      repo,
      orgRepo,
      membershipRepo,
      hasher,
      token,
      issueRefreshToken,
      tx,
    ),
    loginUser: new LoginUser(
      repo,
      membershipRepo,
      hasher,
      token,
      issueRefreshToken,
    ),
    getProfile: new GetProfile(repo),
    updateProfile: new UpdateProfile(repo, hasher),
    requestPasswordReset: new RequestPasswordReset(
      repo,
      resetTokenRepo,
      emailSender,
      {
        frontendResetUrl: env.FRONTEND_RESET_URL,
        buildEmail: buildPasswordResetEmail,
      },
    ),
    resetPassword: new ResetPassword(repo, resetTokenRepo, hasher),
    requestEmailVerification: new RequestEmailVerification(
      repo,
      emailVerificationTokenRepo,
      emailSender,
      {
        frontendVerifyUrl: env.FRONTEND_VERIFY_URL,
        buildEmail: buildEmailVerificationEmail,
        ttlSec: env.EMAIL_VERIFICATION_TTL_SEC,
      },
    ),
    verifyEmail: new VerifyEmail(repo, emailVerificationTokenRepo),
    switchOrganization: new SwitchOrganization(
      membershipRepo,
      repo,
      refreshTokenRepo,
      token,
      issueRefreshToken,
    ),
    rotateRefreshToken,
    revokeRefreshTokenFamily,
    inviteUserToOrganization: new InviteUserToOrganization(
      inviteRepo,
      orgRepo,
      emailSender,
      {
        frontendInviteUrl: env.FRONTEND_INVITE_URL,
        buildEmail: buildOrganizationInviteEmail,
        ttlDays: env.INVITE_TOKEN_TTL_DAYS,
      },
    ),
    acceptInvite: new AcceptInvite(inviteRepo, membershipRepo, repo),
    removeMembership: new RemoveMembership(membershipRepo),
    changeMemberRole: new ChangeMemberRole(membershipRepo),
    listOrganizationMembers: new ListOrganizationMembers(membershipRepo, repo),
    listUserOrganizations: new ListUserOrganizations(membershipRepo, orgRepo),
    loginLockout,
  };
};
