import { z } from "zod";
import { zUUID, zEmail } from "@/constants/zod/zod-rules.js";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { decodeMembershipCursor } from "./membership-cursor.js";

extendZodWithOpenApi(z);

export const inviteRoleEnum = z.enum(["admin", "member"]);

export const membershipRoleEnum = z.enum(["owner", "admin", "member"]);

export const createInviteBody = z.object({
  email: zEmail,
  role: inviteRoleEnum.openapi({ example: "member" }),
});

export const acceptInviteBody = z.object({
  token: z
    .string()
    .min(1, { message: "Invitation token is required" })
    .openapi({ example: "some-raw-token-value" }),
});

export const changeMemberRoleBody = z.object({
  role: inviteRoleEnum.openapi({ example: "admin" }),
});

export const orgIdParam = z.object({
  id: zUUID,
});

export const membershipIdParam = z.object({
  id: zUUID,
});

export const createInviteSchema = {
  body: createInviteBody,
  params: orgIdParam,
};
export const acceptInviteSchema = { body: acceptInviteBody };
export const changeMemberRoleSchema = {
  body: changeMemberRoleBody,
  params: membershipIdParam,
};
export const removeMembershipSchema = { params: membershipIdParam };
// Both organization lists page by cursor, 100 rows unless asked for fewer
// (api-tooling-residuals D-09, audit X27).
export const membershipPageQuery = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(100)
    .openapi({ example: 100, description: "Rows per page, 1 to 100." }),
  after: z
    .string()
    .transform((cursor, ctx) => {
      const position = decodeMembershipCursor(cursor);
      if (!position) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Invalid cursor",
        });
        return z.NEVER;
      }
      return position;
    })
    .optional()
    .openapi({
      type: "string",
      description: "The `nextCursor` of the previous page.",
    }),
});

export const listMembersSchema = {
  params: orgIdParam,
  query: membershipPageQuery,
};
export const listMyOrganizationsSchema = { query: membershipPageQuery };
