/**
 * The time zones a request or `DEFAULT_TZ` may name: an IANA name or `UTC`.
 *
 * `Intl` accepts more, and an offset is the dangerous case: it reads `+07:00` as seven
 * hours east, while Postgres reads it POSIX-style as seven hours west, so a request's
 * range (computed with `Intl`) and its buckets (computed in SQL) used opposite zones
 * (api-tooling-residuals D-01, audit X23). Every name this pattern admits is read the
 * same way by both.
 */
export const TZ_REGEX = /^([A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+|UTC)$/;

export const isIanaTimeZone = (value: string): boolean => {
  if (!TZ_REGEX.test(value)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
};
