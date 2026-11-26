import { buildEmailChangeConfirmEmail } from "@/features/auth/infrastructure/email/templates/email-change-confirm.js";
import {
  buildEmailChangeNoticeEmail,
  maskEmailAddress,
} from "@/features/auth/infrastructure/email/templates/email-change-notice.js";
import { buildPasswordChangedEmail } from "@/features/auth/infrastructure/email/templates/password-changed.js";

describe("the email-change templates (credential-changes AC-7, AC-10)", () => {
  it.each([
    ["name@example.com", "n•••@example.com"],
    ["a@example.com", "a•••@example.com"],
    ["first.last@sub.example.org", "f•••@sub.example.org"],
    ["no-at-sign", "•••"],
  ])("masks %s as %s", (address, masked) => {
    expect(maskEmailAddress(address)).toBe(masked);
  });

  it("names the new address masked in the notice, and never whole", () => {
    const email = buildEmailChangeNoticeEmail("newname@example.com");

    expect(email.text).toContain("n•••@example.com");
    expect(email.html).toContain("n•••@example.com");
    expect(email.text).not.toContain("newname");
    expect(email.html).not.toContain("newname");
    expect(email.text).toContain("change your password");
  });

  it("escapes the masked address in the notice's HTML", () => {
    const email = buildEmailChangeNoticeEmail('"<x@evil.example>');

    expect(email.html).not.toContain("<x@");
    expect(email.html).toContain("&quot;•••@evil.example&gt;");
  });

  it("puts the escaped link and the lifetime in the confirmation", () => {
    const link = 'https://app.example.com/confirm?token=a"b&c=1';
    const email = buildEmailChangeConfirmEmail(link, 24);

    expect(email.text).toContain(link);
    expect(email.text).toContain("24 hours");
    expect(email.html).toContain(
      "https://app.example.com/confirm?token=a&quot;b&amp;c=1",
    );
    expect(email.html).not.toContain('a"b');
  });

  it("carries nothing the user chose in the password notice", () => {
    const email = buildPasswordChangedEmail();

    expect(email.subject).toMatch(/password was changed/);
    expect(email.text).toContain("Forgot password");
  });
});
