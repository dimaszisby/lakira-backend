import { z } from "zod";
import { ZodMessages } from "@/constants/zod/zod-messages.js";
import {
  zUsername,
  zEmail,
  zPassword,
  zPasswordConfirmation,
  zPublicProfile,
  zUUID,
} from "@/constants/zod/zod-rules.js";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";

extendZodWithOpenApi(z);

export const createUserBody = z
  .object({
    username: zUsername,
    email: zEmail,
    password: zPassword,
    passwordConfirmation: zPasswordConfirmation,
    isPublicProfile: zPublicProfile,
  })
  .refine((data) => data.password === data.passwordConfirmation, {
    message: ZodMessages.user.passwordMismatch,
    path: ["passwordConfirmation"],
  });

// Credentials have their own routes (credential-changes D-01). The two keys are
// named here only to refuse them: left out, Zod would drop them, and a client
// sending one would read a 200 for a change that never happened.
export const updateUserBody = z
  .object({
    username: zUsername.optional(),
    isPublicProfile: zPublicProfile.optional(),
    email: z.unknown().optional(),
    password: z.unknown().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.password !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["password"],
        message: ZodMessages.user.passwordChangedElsewhere,
      });
    }
    if (data.email !== undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["email"],
        message: ZodMessages.user.emailNotChangedHere,
      });
    }
  });

export const changePasswordBody = z
  .object({
    currentPassword: z
      .string()
      .min(1, { message: ZodMessages.user.currentPasswordRequired }),
    password: zPassword,
    passwordConfirmation: zPasswordConfirmation,
  })
  .refine((data) => data.password === data.passwordConfirmation, {
    message: ZodMessages.user.passwordMismatch,
    path: ["passwordConfirmation"],
  });

export const changeEmailBody = z.object({
  currentPassword: z
    .string()
    .min(1, { message: ZodMessages.user.currentPasswordRequired }),
  email: zEmail,
});

export const confirmEmailChangeBody = z.object({
  token: z
    .string()
    .min(1, { message: ZodMessages.user.emailChangeTokenRequired }),
});

export const loginUserBody = z.object({
  email: zEmail,
  password: zPassword,
});

export const forgotPasswordBody = z.object({
  email: zEmail,
});

export const resetPasswordBody = z
  .object({
    token: z
      .string()
      .min(1, { message: ZodMessages.passwordReset.tokenRequired }),
    password: zPassword,
    passwordConfirmation: zPasswordConfirmation,
  })
  .refine((data) => data.password === data.passwordConfirmation, {
    message: ZodMessages.user.passwordMismatch,
    path: ["passwordConfirmation"],
  });

export const verifyEmailBody = z.object({
  token: z
    .string()
    .min(1, { message: "Verification token is required" })
    .openapi({ example: "some-raw-token-value" }),
});

export const switchOrgBody = z.object({
  organizationId: zUUID,
});

export const createUserSchema = { body: createUserBody };
export const updateUserSchema = { body: updateUserBody };
export const changePasswordSchema = { body: changePasswordBody };
export const changeEmailSchema = { body: changeEmailBody };
export const confirmEmailChangeSchema = { body: confirmEmailChangeBody };
export const loginUserSchema = { body: loginUserBody };
export const forgotPasswordSchema = { body: forgotPasswordBody };
export const resetPasswordSchema = { body: resetPasswordBody };
export const verifyEmailSchema = { body: verifyEmailBody };
export const switchOrgSchema = { body: switchOrgBody };
