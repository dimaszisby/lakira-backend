import { Response } from "express";
import { successResponse } from "@/utils/response-formatter.js";
import catchAsync from "@/utils/catch-async.js";
import AppError from "@/utils/AppError.js";
import { AuthRequest } from "@/types/request.context.js";
import { assertAuthenticated } from "@/utils/auth-guards.js";
import { assertHasOrgRole } from "./assertHasOrgRole.js";
import { pickValidated } from "@/shared/middleware/validated.js";
import { z } from "zod";
import {
  createInviteBody,
  acceptInviteBody,
  changeMemberRoleBody,
  orgIdParam,
  membershipIdParam,
} from "./organization.schema.zod.js";
import { buildAuthFeature } from "../../feature.js";

type OrgFeature = ReturnType<typeof buildAuthFeature>;
// Built on first use, never at import (ADR-0045).
let feature: OrgFeature | undefined;
const getFeature = (): OrgFeature => (feature ??= buildAuthFeature());

export const overrideOrgFeatureForTest = (custom: OrgFeature) => {
  feature = custom;
};

const pickCreateInvite = pickValidated(
  z.object({ body: createInviteBody, params: orgIdParam }),
);
const pickAcceptInvite = pickValidated(z.object({ body: acceptInviteBody }));
const pickChangeMemberRole = pickValidated(
  z.object({ body: changeMemberRoleBody, params: membershipIdParam }),
);
const pickMembershipId = pickValidated(z.object({ params: membershipIdParam }));
const pickOrgId = pickValidated(z.object({ params: orgIdParam }));

export const createInvite = catchAsync(
  async (req: AuthRequest, res: Response) => {
    assertAuthenticated(req);
    const {
      body: { email, role },
      params: { id: organizationId },
    } = pickCreateInvite(req);

    if (req.membership.organizationId !== organizationId) {
      throw new AppError("Forbidden: not a member of this organization", 403);
    }
    assertHasOrgRole(req, "owner", "admin");

    await getFeature().inviteUserToOrganization.execute({
      organizationId,
      email,
      role,
      inviterUserId: req.user.id,
      inviterRole: req.membership.role,
    });

    successResponse(res, 201, null, "Invitation sent successfully");
  },
);

export const acceptInvite = catchAsync(
  async (req: AuthRequest, res: Response) => {
    assertAuthenticated(req);
    const {
      body: { token },
    } = pickAcceptInvite(req);

    await getFeature().acceptInvite.execute({
      rawToken: token,
      userId: req.user.id,
    });

    successResponse(res, 200, null, "Invitation accepted");
  },
);

export const removeMembership = catchAsync(
  async (req: AuthRequest, res: Response) => {
    assertAuthenticated(req);
    const {
      params: { id: membershipId },
    } = pickMembershipId(req);

    assertHasOrgRole(req, "owner");

    await getFeature().removeMembership.execute({
      membershipId,
      organizationId: req.membership.organizationId,
      actorRole: req.membership.role,
      actorUserId: req.user.id,
    });

    successResponse(res, 200, null, "Member removed successfully");
  },
);

export const changeMemberRole = catchAsync(
  async (req: AuthRequest, res: Response) => {
    assertAuthenticated(req);
    const {
      body: { role },
      params: { id: membershipId },
    } = pickChangeMemberRole(req);

    assertHasOrgRole(req, "owner");

    await getFeature().changeMemberRole.execute({
      membershipId,
      organizationId: req.membership.organizationId,
      newRole: role,
      actorRole: req.membership.role,
    });

    successResponse(res, 200, null, "Member role updated successfully");
  },
);

export const listMembers = catchAsync(
  async (req: AuthRequest, res: Response) => {
    assertAuthenticated(req);
    const {
      params: { id: organizationId },
    } = pickOrgId(req);

    if (req.membership.organizationId !== organizationId) {
      throw new AppError("Forbidden: not a member of this organization", 403);
    }

    const members =
      await getFeature().listOrganizationMembers.execute(organizationId);

    successResponse(res, 200, { members });
  },
);

export const listMyOrganizations = catchAsync(
  async (req: AuthRequest, res: Response) => {
    assertAuthenticated(req);

    // Scoped by the verified token only; the route takes no parameters.
    const organizations = await getFeature().listUserOrganizations.execute({
      userId: req.user.id,
      currentOrganizationId: req.membership.organizationId,
    });

    successResponse(res, 200, { organizations });
  },
);
