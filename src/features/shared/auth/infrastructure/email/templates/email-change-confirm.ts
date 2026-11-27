import { APP_DISPLAY_NAME } from "@/config/app-name.js";

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export type EmailChangeConfirmEmail = {
  subject: string;
  text: string;
  html: string;
};

/**
 * Sent to the new address (credential-changes D-02). It carries the link and
 * nothing the user chose; the account's email changes only when it is opened.
 */
export const buildEmailChangeConfirmEmail = (
  confirmLink: string,
  expiresInHours: number,
): EmailChangeConfirmEmail => {
  const safeLink = escapeHtml(confirmLink);
  const subject = `Confirm your new ${APP_DISPLAY_NAME} email address`;
  const text = [
    "Hi,",
    "",
    `Someone asked to use this address for a ${APP_DISPLAY_NAME} account.`,
    `Open the link below within ${expiresInHours} hours to confirm it:`,
    "",
    confirmLink,
    "",
    "If you didn't ask for this, you can ignore this email; nothing changes until the link is opened.",
    "",
    `— The ${APP_DISPLAY_NAME} team`,
  ].join("\n");

  const html = `<!doctype html>
<html lang="en">
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1f2937; line-height: 1.5;">
    <p>Hi,</p>
    <p>Someone asked to use this address for a ${APP_DISPLAY_NAME} account.</p>
    <p>Click the button below within <strong>${expiresInHours} hours</strong> to confirm it:</p>
    <p>
      <a href="${safeLink}" style="display:inline-block;padding:10px 18px;background:#2563eb;color:#ffffff;border-radius:6px;text-decoration:none;">Confirm email address</a>
    </p>
    <p>If the button doesn't work, copy this link into your browser:</p>
    <p><a href="${safeLink}">${safeLink}</a></p>
    <p>If you didn't ask for this, you can ignore this email; nothing changes until the link is opened.</p>
    <p>— The ${APP_DISPLAY_NAME} team</p>
  </body>
</html>`;

  return { subject, text, html };
};
