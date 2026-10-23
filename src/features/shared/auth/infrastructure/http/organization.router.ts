import { Router } from "express";
import { createOrganizationController } from "./organization.controller.js";
import type { AuthFeature } from "../../feature.js";
import { authMiddleware } from "./authMiddleware.js";
import { userRateLimiter } from "@/shared/middleware/rate-limiter.js";
import { validate } from "@/shared/middleware/validation.js";
import {
  createInviteSchema,
  acceptInviteSchema,
  changeMemberRoleSchema,
  removeMembershipSchema,
  listMembersSchema,
  listMyOrganizationsSchema,
} from "./organization.schema.zod.js";
import { methodNotAllowed } from "@/shared/middleware/method-guard.js";
import { requireJsonObjectBody } from "@/shared/middleware/require-json-object.js";

export const createOrganizationRouter = (feature: AuthFeature) => {
  const controller = createOrganizationController(feature);
  const router = Router();

  router.get(
    "/",
    authMiddleware,
    userRateLimiter,
    validate(listMyOrganizationsSchema),
    controller.listMyOrganizations,
  );

  router.post(
    "/:id/invites",
    authMiddleware,
    userRateLimiter,
    requireJsonObjectBody(),
    validate(createInviteSchema),
    controller.createInvite,
  );

  router.get(
    "/:id/members",
    authMiddleware,
    userRateLimiter,
    validate(listMembersSchema),
    controller.listMembers,
  );

  router.all("/", methodNotAllowed(["GET"]));
  router.all("/:id/invites", methodNotAllowed(["POST"]));
  router.all("/:id/members", methodNotAllowed(["GET"]));

  return router;
};

export const createInviteRouter = (feature: AuthFeature) => {
  const controller = createOrganizationController(feature);
  const router = Router();

  router.post(
    "/accept",
    authMiddleware,
    userRateLimiter,
    requireJsonObjectBody(),
    validate(acceptInviteSchema),
    controller.acceptInvite,
  );

  router.all("/accept", methodNotAllowed(["POST"]));

  return router;
};

export const createMembershipRouter = (feature: AuthFeature) => {
  const controller = createOrganizationController(feature);
  const router = Router();

  router.delete(
    "/:id",
    authMiddleware,
    userRateLimiter,
    validate(removeMembershipSchema),
    controller.removeMembership,
  );

  router.patch(
    "/:id",
    authMiddleware,
    userRateLimiter,
    requireJsonObjectBody(),
    validate(changeMemberRoleSchema),
    controller.changeMemberRole,
  );

  router.all("/:id", methodNotAllowed(["DELETE", "PATCH"]));

  return router;
};
