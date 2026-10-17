import { Router } from "express";
import {
  createInvite,
  acceptInvite,
  removeMembership,
  changeMemberRole,
  listMembers,
  listMyOrganizations,
} from "./organization.controller.js";
import { authMiddleware } from "./authMiddleware.js";
import { userRateLimiter } from "@/shared/middleware/rate-limiter.js";
import { validate } from "@/shared/middleware/validation.js";
import {
  createInviteSchema,
  acceptInviteSchema,
  changeMemberRoleSchema,
  removeMembershipSchema,
  listMembersSchema,
} from "./organization.schema.zod.js";
import { methodNotAllowed } from "@/shared/middleware/method-guard.js";
import { requireJsonObjectBody } from "@/shared/middleware/require-json-object.js";

export const createOrganizationRouter = () => {
  const router = Router();

  router.get("/", authMiddleware, userRateLimiter, listMyOrganizations);

  router.post(
    "/:id/invites",
    authMiddleware,
    userRateLimiter,
    requireJsonObjectBody(),
    validate(createInviteSchema),
    createInvite,
  );

  router.get(
    "/:id/members",
    authMiddleware,
    userRateLimiter,
    validate(listMembersSchema),
    listMembers,
  );

  router.all("/", methodNotAllowed(["GET"]));
  router.all("/:id/invites", methodNotAllowed(["POST"]));
  router.all("/:id/members", methodNotAllowed(["GET"]));

  return router;
};

export const createInviteRouter = () => {
  const router = Router();

  router.post(
    "/accept",
    authMiddleware,
    userRateLimiter,
    requireJsonObjectBody(),
    validate(acceptInviteSchema),
    acceptInvite,
  );

  router.all("/accept", methodNotAllowed(["POST"]));

  return router;
};

export const createMembershipRouter = () => {
  const router = Router();

  router.delete(
    "/:id",
    authMiddleware,
    userRateLimiter,
    validate(removeMembershipSchema),
    removeMembership,
  );

  router.patch(
    "/:id",
    authMiddleware,
    userRateLimiter,
    requireJsonObjectBody(),
    validate(changeMemberRoleSchema),
    changeMemberRole,
  );

  router.all("/:id", methodNotAllowed(["DELETE", "PATCH"]));

  return router;
};
