/**
 * The frontend link settings' checks. No logger import: `zodEnv.ts` reads this,
 * and the logger reads the env.
 */

/**
 * True for a URL whose host is this machine: `localhost` or a name under it, an
 * address in 127.0.0.0/8, or `::1`. Such a link in an email opens nothing
 * (credential-changes D-07, D-10).
 */
export const isLoopbackUrl = (value: string): boolean => {
  let hostname: string;
  try {
    hostname = new URL(value).hostname.toLowerCase();
  } catch {
    return false;
  }
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    /^127(?:\.\d{1,3}){3}$/.test(hostname) ||
    hostname === "[::1]"
  );
};

/**
 * Production refuses a loopback `FRONTEND_EMAIL_CHANGE_URL` at the schema;
 * staging starts, and says so at every start of the server and the worker,
 * naming the variable, never the URL (credential-changes D-07).
 */
export const warnWhenEmailChangeUrlIsLocal = (
  nodeEnv: string,
  url: string,
  warn: (message: string) => void,
): boolean => {
  if (nodeEnv !== "staging" || !isLoopbackUrl(url)) return false;
  warn(
    "[CONFIG] FRONTEND_EMAIL_CHANGE_URL points at this machine: email-change confirmation links will open nothing.",
  );
  return true;
};
