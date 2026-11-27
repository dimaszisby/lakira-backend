import { zUsername } from "@/constants/zod/zod-rules.js";
import { zod3Messages } from "@/shared/utils/zod3-messages.js";
import {
  USERNAME_RULE,
  usernameRuleViolation,
} from "@/shared/constants/username-rule.js";

/**
 * #311 (audit 2026-11-14, Y11; ADR-0101). The username names the user's
 * organization at registration, and the invite email quotes it to an address
 * the inviter chose: a handle of 3 to 50 letters, digits, ".", "_" and "-".
 */
const issues = (value: unknown) => {
  const result = zUsername.safeParse(value, { error: zod3Messages });
  return result.success ? [] : result.error.issues.map((i) => i.message);
};

describe("zUsername", () => {
  it.each(["abc", "a".repeat(50), "jane.doe", "jane_doe-2", "A.B_C-9"])(
    "accepts %j",
    (value) => {
      expect(issues(value)).toEqual([]);
    },
  );

  it.each([
    ["two characters", "ab", "Username must be at least 3 characters"],
    ["51 characters", "a".repeat(51), "Username must be at most 50 characters"],
  ])("refuses %s", (_case, value, message) => {
    expect(issues(value)).toEqual([message]);
  });

  it.each([
    ["a space", "jane doe"],
    ["a comma", "pay,now"],
    ["an at sign", "jane@example"],
    ["a slash", "example.test/pay"],
    ["a line break", "jane\ndoe"],
    ["a non-ASCII letter", "josé"],
    ["a sentence", "Your invoice is overdue, pay at example.test"],
    ["punctuation only", "..."],
    ["dashes only", "---"],
  ])("refuses %s", (_case, value) => {
    expect(issues(value)).toEqual([USERNAME_RULE.messages.characters]);
  });

  // UpdateProfile checks a changed username with the same rule, outside Zod.
  it.each(["abc", "ab", "a".repeat(51), "jane doe", "...", "jane.doe"])(
    "usernameRuleViolation agrees with zUsername on %j",
    (value) => {
      expect(usernameRuleViolation(value)).toBe(issues(value)[0] ?? null);
    },
  );
});
