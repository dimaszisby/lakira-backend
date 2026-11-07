/**
 * An email address in free text: a local part, quoted or plain, then `@` or `%40`, then a
 * domain. The pattern Sentry's scrubber has used since log-redaction-coverage D-12; it lives here
 * so a URL path and the access log apply the same one (log-and-ci-leaks D-02).
 */
export const EMAIL_IN_TEXT =
  /(?:"[^"\r\n]{1,64}"|[\p{L}\p{N}._%+'-]{1,64})(?:@|%40)[\p{L}\p{N}.-]{1,253}\.\p{L}{2,24}/giu;

/** `text` with every email address replaced by `[email]`. */
export const maskEmails = (text: string): string =>
  text.replace(EMAIL_IN_TEXT, "[email]");
