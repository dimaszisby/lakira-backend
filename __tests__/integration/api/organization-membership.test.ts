import {
  api,
  buildUserPayload,
  createTestUser,
  authHeader,
} from "../helpers/test-utils.js";
import { overrideOrgFeatureForTest } from "@/features/shared/auth/infrastructure/http/organization.controller.js";
import { buildAuthFeature } from "@/features/shared/auth/feature.js";
import type { EmailMessage } from "@/features/shared/auth/application/ports/EmailSender.js";

// ---------- helpers ----------

class CapturingEmailSender {
  sent: EmailMessage[] = [];
  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
  }
  lastToken(): string {
    const last = this.sent[this.sent.length - 1];
    const match = last.html.match(/token=([^"&<\s]+)/);
    if (!match) throw new Error("No token found in captured email");
    return decodeURIComponent(match[1]);
  }
  clear() {
    this.sent = [];
  }
}

const emailCapture = new CapturingEmailSender();

const decodeOrgId = (token: string): string => {
  const payload = JSON.parse(
    Buffer.from(token.split(".")[1], "base64url").toString(),
  );
  return payload.organizationId;
};

// ---------- setup ----------

beforeEach(() => {
  overrideOrgFeatureForTest(buildAuthFeature({ emailSender: emailCapture }));
  emailCapture.clear();
});

// ---------- tests ----------

describe("Organization Membership API", () => {
  describe("POST /api/v1/organizations/:id/invites", () => {
    it("creates an invite and returns 201", async () => {
      const { token } = await createTestUser();
      const orgId = decodeOrgId(token);

      const res = await api
        .post(`/api/v1/organizations/${orgId}/invites`)
        .set("Authorization", authHeader(token))
        .send({ email: "invitee@example.com", role: "member" });

      expect(res.status).toBe(201);
      expect(res.body.message).toBe("Invitation sent successfully");
      expect(emailCapture.sent).toHaveLength(1);
      expect(emailCapture.sent[0].to).toBe("invitee@example.com");
    });

    it("returns 409 when a pending invite already exists", async () => {
      const { token } = await createTestUser();
      const orgId = decodeOrgId(token);
      const inviteeEmail = buildUserPayload().email;

      await api
        .post(`/api/v1/organizations/${orgId}/invites`)
        .set("Authorization", authHeader(token))
        .send({ email: inviteeEmail, role: "member" });

      const res = await api
        .post(`/api/v1/organizations/${orgId}/invites`)
        .set("Authorization", authHeader(token))
        .send({ email: inviteeEmail, role: "member" });

      expect(res.status).toBe(409);
    });

    it("returns 401 without auth", async () => {
      const res = await api
        .post(
          "/api/v1/organizations/00000000-0000-4000-8000-000000000001/invites",
        )
        .send({ email: "a@b.com", role: "member" });

      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/v1/invites/accept", () => {
    it("full flow: invite → accept → membership created", async () => {
      const owner = await createTestUser();
      const ownerOrgId = decodeOrgId(owner.token);

      const inviteePayload = buildUserPayload();

      await api
        .post(`/api/v1/organizations/${ownerOrgId}/invites`)
        .set("Authorization", authHeader(owner.token))
        .send({ email: inviteePayload.email, role: "member" });

      const rawToken = emailCapture.lastToken();

      const invitee = await createTestUser({
        email: inviteePayload.email,
        username: inviteePayload.username,
      });

      const acceptRes = await api
        .post("/api/v1/invites/accept")
        .set("Authorization", authHeader(invitee.token))
        .send({ token: rawToken });

      expect(acceptRes.status).toBe(200);
      expect(acceptRes.body.message).toBe("Invitation accepted");

      const membersRes = await api
        .get(`/api/v1/organizations/${ownerOrgId}/members`)
        .set("Authorization", authHeader(owner.token));

      expect(membersRes.status).toBe(200);
      const members = membersRes.body.data.members;
      expect(members).toHaveLength(2);

      const inviteeMember = members.find(
        (m: any) => m.email === inviteePayload.email,
      );
      expect(inviteeMember).toBeDefined();
      expect(inviteeMember.role).toBe("member");
    });

    it("returns 400 for invalid token (anti-enumeration)", async () => {
      const { token } = await createTestUser();

      const res = await api
        .post("/api/v1/invites/accept")
        .set("Authorization", authHeader(token))
        .send({ token: "bogus-token-value" });

      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/v1/organizations/:id/members", () => {
    it("lists members of the organization", async () => {
      const { token } = await createTestUser();
      const orgId = decodeOrgId(token);

      const res = await api
        .get(`/api/v1/organizations/${orgId}/members`)
        .set("Authorization", authHeader(token));

      expect(res.status).toBe(200);
      expect(res.body.data.members).toHaveLength(1);
      expect(res.body.data.members[0]).toMatchObject({
        role: "owner",
        status: "active",
      });
    });
  });

  describe("PATCH /api/v1/memberships/:id", () => {
    it("changes a member role", async () => {
      const owner = await createTestUser();
      const ownerOrgId = decodeOrgId(owner.token);
      const inviteePayload = buildUserPayload();

      await api
        .post(`/api/v1/organizations/${ownerOrgId}/invites`)
        .set("Authorization", authHeader(owner.token))
        .send({ email: inviteePayload.email, role: "member" });

      const rawToken = emailCapture.lastToken();
      const invitee = await createTestUser({
        email: inviteePayload.email,
        username: inviteePayload.username,
      });

      await api
        .post("/api/v1/invites/accept")
        .set("Authorization", authHeader(invitee.token))
        .send({ token: rawToken });

      const membersRes = await api
        .get(`/api/v1/organizations/${ownerOrgId}/members`)
        .set("Authorization", authHeader(owner.token));

      const inviteeMember = membersRes.body.data.members.find(
        (m: any) => m.email === inviteePayload.email,
      );

      const patchRes = await api
        .patch(`/api/v1/memberships/${inviteeMember.membershipId}`)
        .set("Authorization", authHeader(owner.token))
        .send({ role: "admin" });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.message).toBe("Member role updated successfully");

      const updatedMembers = await api
        .get(`/api/v1/organizations/${ownerOrgId}/members`)
        .set("Authorization", authHeader(owner.token));

      const updated = updatedMembers.body.data.members.find(
        (m: any) => m.email === inviteePayload.email,
      );
      expect(updated.role).toBe("admin");
    });
  });

  describe("DELETE /api/v1/memberships/:id", () => {
    it("removes a member from the organization", async () => {
      const owner = await createTestUser();
      const ownerOrgId = decodeOrgId(owner.token);
      const inviteePayload = buildUserPayload();

      await api
        .post(`/api/v1/organizations/${ownerOrgId}/invites`)
        .set("Authorization", authHeader(owner.token))
        .send({ email: inviteePayload.email, role: "member" });

      const rawToken = emailCapture.lastToken();
      const invitee = await createTestUser({
        email: inviteePayload.email,
        username: inviteePayload.username,
      });

      await api
        .post("/api/v1/invites/accept")
        .set("Authorization", authHeader(invitee.token))
        .send({ token: rawToken });

      const membersRes = await api
        .get(`/api/v1/organizations/${ownerOrgId}/members`)
        .set("Authorization", authHeader(owner.token));

      const inviteeMember = membersRes.body.data.members.find(
        (m: any) => m.email === inviteePayload.email,
      );

      const deleteRes = await api
        .delete(`/api/v1/memberships/${inviteeMember.membershipId}`)
        .set("Authorization", authHeader(owner.token));

      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.message).toBe("Member removed successfully");

      const afterDelete = await api
        .get(`/api/v1/organizations/${ownerOrgId}/members`)
        .set("Authorization", authHeader(owner.token));

      expect(afterDelete.body.data.members).toHaveLength(1);
    });

    it("returns 404 when user tries to remove a member from a different org", async () => {
      const owner = await createTestUser();
      const ownerOrgId = decodeOrgId(owner.token);
      const inviteePayload = buildUserPayload();

      await api
        .post(`/api/v1/organizations/${ownerOrgId}/invites`)
        .set("Authorization", authHeader(owner.token))
        .send({ email: inviteePayload.email, role: "member" });

      const rawToken = emailCapture.lastToken();
      const invitee = await createTestUser({
        email: inviteePayload.email,
        username: inviteePayload.username,
      });

      await api
        .post("/api/v1/invites/accept")
        .set("Authorization", authHeader(invitee.token))
        .send({ token: rawToken });

      const membersRes = await api
        .get(`/api/v1/organizations/${ownerOrgId}/members`)
        .set("Authorization", authHeader(owner.token));

      const ownerMember = membersRes.body.data.members.find(
        (m: any) => m.role === "owner",
      );

      const deleteRes = await api
        .delete(`/api/v1/memberships/${ownerMember.membershipId}`)
        .set("Authorization", authHeader(invitee.token));

      expect(deleteRes.status).toBe(404);
    });
  });

  describe("GET /api/v1/organizations", () => {
    // The owner invites a fresh user, who registers and accepts: the invitee
    // then belongs to their own personal organization and to the owner's.
    const joinOwnerOrg = async () => {
      const owner = await createTestUser();
      const ownerOrgId = decodeOrgId(owner.token);
      const inviteePayload = buildUserPayload();

      await api
        .post(`/api/v1/organizations/${ownerOrgId}/invites`)
        .set("Authorization", authHeader(owner.token))
        .send({ email: inviteePayload.email, role: "member" });
      const rawToken = emailCapture.lastToken();

      const invitee = await createTestUser({
        email: inviteePayload.email,
        username: inviteePayload.username,
      });
      const acceptRes = await api
        .post("/api/v1/invites/accept")
        .set("Authorization", authHeader(invitee.token))
        .send({ token: rawToken });
      expect(acceptRes.status).toBe(200);

      return { owner, ownerOrgId, invitee, inviteePayload };
    };

    const listOrgs = (token: string) =>
      api.get("/api/v1/organizations").set("Authorization", authHeader(token));

    it("lists the single personal organization of a new user", async () => {
      const { token } = await createTestUser();

      const res = await listOrgs(token);

      expect(res.status).toBe(200);
      expect(res.body.data.organizations).toEqual([
        expect.objectContaining({
          organizationId: decodeOrgId(token),
          role: "owner",
          isCurrent: true,
        }),
      ]);
    });

    it("lists both organizations after an accepted invite", async () => {
      const { ownerOrgId, invitee } = await joinOwnerOrg();
      const inviteeOrgId = decodeOrgId(invitee.token);

      const res = await listOrgs(invitee.token);

      expect(res.status).toBe(200);
      const orgs = res.body.data.organizations;
      expect(orgs).toHaveLength(2);
      expect(orgs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            organizationId: inviteeOrgId,
            role: "owner",
            isCurrent: true,
          }),
          expect.objectContaining({
            organizationId: ownerOrgId,
            role: "member",
            isCurrent: false,
          }),
        ]),
      );
    });

    it("moves isCurrent after switching organization", async () => {
      const { ownerOrgId, invitee } = await joinOwnerOrg();

      const switchRes = await api
        .post("/api/v1/auth/switch-org")
        .set("Authorization", authHeader(invitee.token))
        .send({ organizationId: ownerOrgId });
      expect(switchRes.status).toBe(200);
      const switchedToken = switchRes.body.data.token;

      const res = await listOrgs(switchedToken);

      expect(res.status).toBe(200);
      const current = res.body.data.organizations.filter(
        (o: any) => o.isCurrent,
      );
      expect(current).toHaveLength(1);
      expect(current[0].organizationId).toBe(ownerOrgId);
    });

    it("stops listing an organization the user was removed from", async () => {
      const { owner, ownerOrgId, invitee, inviteePayload } =
        await joinOwnerOrg();

      const membersRes = await api
        .get(`/api/v1/organizations/${ownerOrgId}/members`)
        .set("Authorization", authHeader(owner.token));
      const inviteeMember = membersRes.body.data.members.find(
        (m: any) => m.email === inviteePayload.email,
      );
      const deleteRes = await api
        .delete(`/api/v1/memberships/${inviteeMember.membershipId}`)
        .set("Authorization", authHeader(owner.token));
      expect(deleteRes.status).toBe(200);

      const res = await listOrgs(invitee.token);

      expect(res.status).toBe(200);
      expect(
        res.body.data.organizations.map((o: any) => o.organizationId),
      ).toEqual([decodeOrgId(invitee.token)]);
    });

    it("returns 401 without auth", async () => {
      const res = await api.get("/api/v1/organizations");

      expect(res.status).toBe(401);
    });

    it("returns 405 for other methods", async () => {
      const { token } = await createTestUser();

      const res = await api
        .post("/api/v1/organizations")
        .set("Authorization", authHeader(token))
        .send({});

      expect(res.status).toBe(405);
    });
  });
});
