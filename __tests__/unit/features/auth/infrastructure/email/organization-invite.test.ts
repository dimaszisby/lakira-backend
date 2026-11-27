import { buildOrganizationInviteEmail } from "@/features/auth/infrastructure/email/templates/organization-invite.js";
import { APP_DISPLAY_NAME } from "@/config/app-name.js";

/**
 * #311 (audit 2026-11-14, Y11; ADR-0101). An organization's name is the
 * inviter's own text, so the invite email is built without it: nothing the
 * inviter wrote reaches the address they chose.
 */
describe("buildOrganizationInviteEmail", () => {
  const link = "https://app.example.test/invite?token=abc&x=1";
  const email = buildOrganizationInviteEmail(link, 7);

  it("takes no organization name", () => {
    expect(buildOrganizationInviteEmail).toHaveLength(2);
  });

  it("names no organization in the subject or the body", () => {
    const joined = `You've been invited to join an organization on ${APP_DISPLAY_NAME}`;
    expect(email.subject).toBe(joined);
    expect(email.text).toContain(`${joined}.`);
    expect(email.html).toContain(`${joined}.`);
  });

  it("carries the link and its expiry, escaped in the HTML part", () => {
    expect(email.text).toContain(link);
    expect(email.text).toContain("within 7 days");
    expect(email.html).toContain(
      'href="https://app.example.test/invite?token=abc&amp;x=1"',
    );
  });
});
