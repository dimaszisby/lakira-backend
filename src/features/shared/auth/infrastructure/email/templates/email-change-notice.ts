import { APP_DISPLAY_NAME } from "@/config/app-name.js";

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/**
 * `name@example.com` → `n•••@example.com`: enough for the owner to recognise
 * the address, not enough to read it off a screenshot of the old inbox
 * (credential-changes AC-7).
 */
export const maskEmailAddress = (address: string): string => {
  const at = address.lastIndexOf("@");
  if (at <= 0) return "•••";
  return `${address.charAt(0)}•••${address.slice(at)}`;
};

export type EmailChangeNoticeEmail = {
  subject: string;
  text: string;
  html: string;
};

/**
 * Sent to the old address when a change is asked for (credential-changes D-02).
 * The only text the user chose is the new address, and it is masked.
 */
export const buildEmailChangeNoticeEmail = (
  newEmail: string,
): EmailChangeNoticeEmail => {
  const masked = maskEmailAddress(newEmail);
  const safeMasked = escapeHtml(masked);
  const subject = `Your ${APP_DISPLAY_NAME} email address is being changed`;
  const text = [
    "Hi,",
    "",
    `Someone asked to change your ${APP_DISPLAY_NAME} account's email address to ${masked}.`,
    "The change takes effect once that address confirms it.",
    "",
    "If this wasn't you, change your password now from a device that is still signed in: a change still waiting for confirmation is cancelled, and every other device is signed out.",
    "",
    `— The ${APP_DISPLAY_NAME} team`,
  ].join("\n");

  const html = `<!doctype html>
<html lang="en">
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1f2937; line-height: 1.5;">
    <p>Hi,</p>
    <p>Someone asked to change your ${APP_DISPLAY_NAME} account's email address to <strong>${safeMasked}</strong>.</p>
    <p>The change takes effect once that address confirms it.</p>
    <p>If this wasn't you, change your password now from a device that is still signed in: a change still waiting for confirmation is cancelled, and every other device is signed out.</p>
    <p>— The ${APP_DISPLAY_NAME} team</p>
  </body>
</html>`;

  return { subject, text, html };
};
