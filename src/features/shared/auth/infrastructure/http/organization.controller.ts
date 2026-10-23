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
  membershipPageQuery,
} from "./organization.schema.zod.js";
import { encodeMembershipCursor } from "./membership-cursor.js";
import type { AuthFeature } from "../../feature.js";

type OrgFeature = AuthFeature;

const pickCreateInvite = pickValidated(
  z.object({ body: createInviteBody, params: orgIdParam }),
);
const pickAcceptInvite = pickValidated(z.object({ body: acceptInviteBody }));
const pickChangeMemberRole = pickValidated(
  z.object({ body: changeMemberRoleBody, params: membershipIdParam }),
);
const pickMembershipId = pickValidated(z.object({ params: membershipIdParam }));
const pickMembersPage = pickValidated(
  z.object({ params: orgIdParam, query: membershipPageQuery }),
);
const pickOrganizationsPage = pickValidated(
  z.object({ query: membershipPageQuery }),
);

const createInvite = (feature: OrgFeature) =>
  catchAsync(async (req: AuthRequest, res: Response) => {
    assertAuthenticated(req);
    const {
      body: { email, role },
      params: { id: organizationId },
    } = pickCreateInvite(req);

    if (req.membership.organizationId !== organizationId) {
      throw new AppError("Forbidden: not a member of this organization", 403);
    }
    assertHasOrgRole(req, "owner", "admin");

    await feature.inviteUserToOrganization.execute({
      organizationId,
      email,
      role,
      inviterUserId: req.user.id,
      inviterRole: req.membership.role,
    });

    successResponse(res, 201, null, "Invitation sent successfully");
  });

const acceptInvite = (feature: OrgFeature) =>
  catchAsync(async (req: AuthRequest, res: Response) => {
    assertAuthenticated(req);
    const {
      body: { token },
    } = pickAcceptInvite(req);

    await feature.acceptInvite.execute({
      rawToken: token,
      userId: req.user.id,
    });

    successResponse(res, 200, null, "Invitation accepted");
  });

const removeMembership = (feature: OrgFeature) =>
  catchAsync(async (req: AuthRequest, res: Response) => {
    assertAuthenticated(req);
    const {
      params: { id: membershipId },
    } = pickMembershipId(req);

    assertHasOrgRole(req, "owner");

    await feature.removeMembership.execute({
      membershipId,
      organizationId: req.membership.organizationId,
      actorRole: req.membership.role,
      actorUserId: req.user.id,
    });

    successResponse(res, 200, null, "Member removed successfully");
  });

const changeMemberRole = (feature: OrgFeature) =>
  catchAsync(async (req: AuthRequest, res: Response) => {
    assertAuthenticated(req);
    const {
      body: { role },
      params: { id: membershipId },
    } = pickChangeMemberRole(req);

    assertHasOrgRole(req, "owner");

    await feature.changeMemberRole.execute({
      membershipId,
      organizationId: req.membership.organizationId,
      newRole: role,
      actorRole: req.membership.role,
    });

    successResponse(res, 200, null, "Member role updated successfully");
  });

const listMembers = (feature: OrgFeature) =>
  catchAsync(async (req: AuthRequest, res: Response) => {
    assertAuthenticated(req);
    const {
      params: { id: organizationId },
      query: { limit, after },
    } = pickMembersPage(req);

    if (req.membership.organizationId !== organizationId) {
      throw new AppError("Forbidden: not a member of this organization", 403);
    }

    const { members, next } = await feature.listOrganizationMembers.execute(
      organizationId,
      { limit, after },
    );

    successResponse(res, 200, {
      members,
      nextCursor: next ? encodeMembershipCursor(next) : null,
    });
  });

const listMyOrganizations = (feature: OrgFeature) =>
  catchAsync(async (req: AuthRequest, res: Response) => {
    assertAuthenticated(req);

    // Scoped by the verified token only; the query pages, it does not select.
    const {
      query: { limit, after },
    } = pickOrganizationsPage(req);
    const { organizations, next } = await feature.listUserOrganizations.execute(
      {
        userId: req.user.id,
        currentOrganizationId: req.membership.organizationId,
        page: { limit, after },
      },
    );

    successResponse(res, 200, {
      organizations,
      nextCursor: next ? encodeMembershipCursor(next) : null,
    });
  });

/** Every handler, closed over the feature the router hands it (ADR-0072). */
export const createOrganizationController = (feature: OrgFeature) => ({
  createInvite: createInvite(feature),
  acceptInvite: acceptInvite(feature),
  removeMembership: removeMembership(feature),
  changeMemberRole: changeMemberRole(feature),
  listMembers: listMembers(feature),
  listMyOrganizations: listMyOrganizations(feature),
});
