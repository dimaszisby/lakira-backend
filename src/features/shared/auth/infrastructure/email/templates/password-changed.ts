import { APP_DISPLAY_NAME } from "@/config/app-name.js";

export type PasswordChangedEmail = {
  subject: string;
  text: string;
  html: string;
};

/**
 * Sent to the account's address after a password change or reset
 * (credential-changes AC-10). It carries nothing the user chose.
 */
export const buildPasswordChangedEmail = (): PasswordChangedEmail => {
  const subject = `Your ${APP_DISPLAY_NAME} password was changed`;
  const text = [
    "Hi,",
    "",
    `The password of your ${APP_DISPLAY_NAME} account was just changed, and every other device was signed out.`,
    "",
    'If this wasn\'t you, reset your password now with the "Forgot password" link on the sign-in page.',
    "",
    `— The ${APP_DISPLAY_NAME} team`,
  ].join("\n");

  const html = `<!doctype html>
<html lang="en">
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1f2937; line-height: 1.5;">
    <p>Hi,</p>
    <p>The password of your ${APP_DISPLAY_NAME} account was just changed, and every other device was signed out.</p>
    <p>If this wasn't you, reset your password now with the "Forgot password" link on the sign-in page.</p>
    <p>— The ${APP_DISPLAY_NAME} team</p>
  </body>
</html>`;

  return { subject, text, html };
};
