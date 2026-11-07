import {
  buildUserPayload,
  createTestUser,
  authHeader,
} from "../helpers/test-utils.js";
import { appWith } from "../helpers/app-with.js";
import { buildAuthFeature } from "@/features/shared/auth/feature.js";
import type { EmailMessage } from "@/features/shared/auth/application/ports/EmailSender.js";
import { OrganizationInviteRepositorySequelize } from "@/features/shared/auth/infrastructure/persistence/OrganizationInviteRepositorySequelize.js";
import { models, sequelize } from "@/infrastructure/db/models.js";
import { createUserRow } from "../helpers/db-fixtures.js";

// An app of this file's own, rebuilt with a replaced auth feature where a test
// needs one (inject-features-into-routers D-05).
let api = appWith({});

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
  api = appWith({ auth: buildAuthFeature({ emailSender: emailCapture }) });
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

    // durable-invite-email D-03, AC-5: with the queue off, the invite and the
    // send share one transaction, so a failed send leaves nothing to answer 409.
    it("leaves no invite when the send fails, so a retry succeeds", async () => {
      const { token } = await createTestUser();
      const orgId = decodeOrgId(token);
      const email = buildUserPayload().email;
      let calls = 0;
      api = appWith({
        auth: buildAuthFeature({
          emailSender: {
            send: async (message) => {
              calls++;
              if (calls === 1) throw new Error("injected send failure");
              await emailCapture.send(message);
            },
          },
        }),
      });
      const send = () =>
        api
          .post(`/api/v1/organizations/${orgId}/invites`)
          .set("Authorization", authHeader(token))
          .send({ email, role: "member" });

      expect((await send()).status).toBe(500);
      expect(
        await models.OrganizationInvite.count({
          where: { organizationId: orgId },
        }),
      ).toBe(0);

      expect((await send()).status).toBe(201);
      expect(emailCapture.sent).toHaveLength(1);
    });

    it("returns 401 without auth", async () => {
      const res = await api
        .post(
          "/api/v1/organizations/00000000-0000-4000-8000-000000000001/invites",
        )
        .send({ email: "a@b.com", role: "member" });

      expect(res.status).toBe(401);
    });

    // Kit pending-invite-uniqueness (register row B-24). The pending check is
    // backed by a partial unique index on (organization_id, lower(email)) for
    // unaccepted invites, D-01.
    describe("one pending invite per organization and email", () => {
      const invite = (token: string, orgId: string, email: string) =>
        api
          .post(`/api/v1/organizations/${orgId}/invites`)
          .set("Authorization", authHeader(token))
          .send({ email, role: "member" });

      const invitesFor = (organizationId: string) =>
        models.OrganizationInvite.findAll({ where: { organizationId } });

      it("AC-1: two concurrent invites store one row and send one email", async () => {
        const { token } = await createTestUser();
        const orgId = decodeOrgId(token);
        const email = buildUserPayload().email;

        const statuses = (
          await Promise.all([
            invite(token, orgId, email),
            invite(token, orgId, email),
          ])
        )
          .map((res) => res.status)
          .sort();

        expect(statuses).toEqual([201, 409]);
        expect(await invitesFor(orgId)).toHaveLength(1);
        expect(emailCapture.sent).toHaveLength(1);
      });

      it("AC-1: a save that skips the check is refused with the same 409", async () => {
        const { token } = await createTestUser();
        const orgId = decodeOrgId(token);
        const repo = new OrganizationInviteRepositorySequelize();
        const row = (tokenHash: string) => ({
          organizationId: orgId,
          email: "race@example.com",
          role: "member" as const,
          tokenHash,
          expiresAt: new Date(Date.now() + 60_000),
        });

        await repo.save(row("a".repeat(64)));

        await expect(repo.save(row("b".repeat(64)))).rejects.toMatchObject({
          statusCode: 409,
          message: "An invitation is already pending for this email",
        });
      });

      it("AC-2: re-inviting after expiry succeeds and removes the expired invite", async () => {
        const { token } = await createTestUser();
        const orgId = decodeOrgId(token);
        const email = buildUserPayload().email;

        expect((await invite(token, orgId, email)).status).toBe(201);
        await models.OrganizationInvite.update(
          { expiresAt: new Date(Date.now() - 60_000) },
          { where: { organizationId: orgId } },
        );

        expect((await invite(token, orgId, email)).status).toBe(201);
        const rows = await invitesFor(orgId);
        expect(rows).toHaveLength(1);
        expect(rows[0].expiresAt.getTime()).toBeGreaterThan(Date.now());
      });

      it("AC-3: an accepted invite does not block a new one", async () => {
        const { token } = await createTestUser();
        const orgId = decodeOrgId(token);
        const email = buildUserPayload().email;

        expect((await invite(token, orgId, email)).status).toBe(201);
        await models.OrganizationInvite.update(
          { acceptedAt: new Date() },
          { where: { organizationId: orgId } },
        );

        expect((await invite(token, orgId, email)).status).toBe(201);
        expect(await invitesFor(orgId)).toHaveLength(2);
      });

      it("AC-5: an invite stored in another case still conflicts", async () => {
        const { token } = await createTestUser();
        const orgId = decodeOrgId(token);
        await models.OrganizationInvite.create({
          organizationId: orgId,
          email: "Mixed.Case@Example.com",
          role: "member",
          tokenHash: "c".repeat(64),
          expiresAt: new Date(Date.now() + 60_000),
        });

        const res = await invite(token, orgId, "mixed.case@example.com");

        expect(res.status).toBe(409);
        expect(await invitesFor(orgId)).toHaveLength(1);
      });
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

  // Kit api-tooling-residuals, D-09 (audit X27). Both lists loaded every membership.
  // Rows are added with explicit joinedAt values after the owner's, so the order
  // the pages follow is the one the test names (ADR-0052).
  describe("pages", () => {
    const later = (minutes: number) =>
      new Date(Date.now() + minutes * 60 * 1000);

    const ownerWithTwoMembers = async () => {
      const owner = await createTestUser();
      const orgId = decodeOrgId(owner.token);
      const members = [];
      for (const minutes of [1, 2]) {
        const user = await createUserRow();
        await models.Membership.create({
          userId: user.id,
          organizationId: orgId,
          role: "member",
          status: "active",
          joinedAt: later(minutes),
        });
        members.push(user.id);
      }
      return { owner, orgId, members };
    };

    const userInThreeOrgs = async () => {
      const user = await createTestUser();
      const userId = (
        await api
          .get("/api/v1/auth/profile")
          .set("Authorization", authHeader(user.token))
      ).body.data.id as string;
      const orgIds = [decodeOrgId(user.token)];
      for (const minutes of [1, 2]) {
        const org = await models.Organization.create({
          name: `Org ${minutes}`,
          slug: `org-${minutes}-${userId.slice(0, 8)}`,
        });
        await models.Membership.create({
          userId,
          organizationId: org.id,
          role: "member",
          status: "active",
          joinedAt: later(minutes),
        });
        orgIds.push(org.id);
      }
      return { user, orgIds };
    };

    it("pages an organization's members by cursor", async () => {
      const { owner, orgId, members } = await ownerWithTwoMembers();
      const page = (query: Record<string, string | number>) =>
        api
          .get(`/api/v1/organizations/${orgId}/members`)
          .query(query)
          .set("Authorization", authHeader(owner.token));

      const whole = await page({});
      expect(whole.status).toBe(200);
      expect(whole.body.data.members).toHaveLength(3);
      expect(whole.body.data.nextCursor).toBeNull();

      const first = await page({ limit: 2 });
      expect(first.status).toBe(200);
      expect(first.body.data.members.map((m: any) => m.role)).toEqual([
        "owner",
        "member",
      ]);
      expect(first.body.data.members[1].userId).toBe(members[0]);
      expect(typeof first.body.data.nextCursor).toBe("string");

      const second = await page({
        limit: 2,
        after: first.body.data.nextCursor,
      });
      expect(second.status).toBe(200);
      expect(second.body.data.members.map((m: any) => m.userId)).toEqual([
        members[1],
      ]);
      expect(second.body.data.nextCursor).toBeNull();
    });

    it("pages a user's organizations by cursor", async () => {
      const { user, orgIds } = await userInThreeOrgs();
      const page = (query: Record<string, string | number>) =>
        api
          .get("/api/v1/organizations")
          .query(query)
          .set("Authorization", authHeader(user.token));

      const whole = await page({});
      expect(whole.status).toBe(200);
      expect(
        whole.body.data.organizations.map((o: any) => o.organizationId),
      ).toEqual(orgIds);
      expect(whole.body.data.nextCursor).toBeNull();

      const first = await page({ limit: 2 });
      expect(
        first.body.data.organizations.map((o: any) => o.organizationId),
      ).toEqual(orgIds.slice(0, 2));
      const second = await page({
        limit: 2,
        after: first.body.data.nextCursor,
      });
      expect(
        second.body.data.organizations.map((o: any) => o.organizationId),
      ).toEqual(orgIds.slice(2));
      expect(second.body.data.nextCursor).toBeNull();
    });

    // Postgres keeps microseconds and a cursor holds a JS Date, which keeps
    // milliseconds. The backfill migration wrote joined_at with NOW(), so a
    // membership whose time has microseconds sorted after its own cursor and came
    // back on the next page.
    it("does not repeat a membership whose joined_at has microseconds", async () => {
      const { owner, orgId } = await ownerWithTwoMembers();
      await sequelize.query(
        `UPDATE memberships SET joined_at = joined_at + interval '123 microseconds'
         WHERE organization_id = :orgId`,
        { replacements: { orgId } },
      );
      const page = (query: Record<string, string | number>) =>
        api
          .get(`/api/v1/organizations/${orgId}/members`)
          .query(query)
          .set("Authorization", authHeader(owner.token));

      const seen: string[] = [];
      let after: string | null = null;
      for (let i = 0; i < 4; i += 1) {
        const res = await page(after ? { limit: 1, after } : { limit: 1 });
        expect(res.status).toBe(200);
        seen.push(...res.body.data.members.map((m: any) => m.membershipId));
        after = res.body.data.nextCursor;
        if (!after) break;
      }

      expect(seen).toHaveLength(3);
      expect(new Set(seen).size).toBe(3);
    });

    it.each([
      ["a cursor that does not decode", { after: "not-a-cursor" }],
      ["a limit over 100", { limit: 101 }],
      ["a limit of 0", { limit: 0 }],
    ])("refuses %s with 400", async (_name, query) => {
      const { token } = await createTestUser();
      for (const path of [
        "/api/v1/organizations",
        `/api/v1/organizations/${decodeOrgId(token)}/members`,
      ]) {
        const res = await api
          .get(path)
          .query(query)
          .set("Authorization", authHeader(token));
        expect(res.status).toBe(400);
      }
    });
  });
});
