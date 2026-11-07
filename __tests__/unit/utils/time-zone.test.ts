import { describe, it, expect } from "@jest/globals";
import { isIanaTimeZone } from "@/utils/time-zone.js";

// Kit api-tooling-residuals, D-01 (audit X23). Intl reads "+07:00" as seven hours east,
// Postgres as seven hours west, so an offset gave a request's range and its buckets
// opposite zones. Only a name both read the same way passes.
describe("isIanaTimeZone", () => {
  it.each([
    "Asia/Jakarta",
    "America/Argentina/Buenos_Aires",
    "Etc/GMT-7",
    "UTC",
  ])("accepts %s", (tz) => {
    expect(isIanaTimeZone(tz)).toBe(true);
  });

  it.each([
    ["an offset east", "+07:00"],
    ["an offset west", "-04:00"],
    ["a POSIX rule", "EST5EDT"],
    ["an abbreviation", "GMT"],
    ["a name Intl does not know", "Mars/Olympus_Mons"],
    ["an empty string", ""],
  ])("refuses %s", (_name, tz) => {
    expect(isIanaTimeZone(tz)).toBe(false);
  });
});
