/**
 * A username is a handle (#311, ADR-0101). It names the user's organization at
 * registration, so it holds no sentence: 3 to 50 letters, digits, ".", "_" and
 * "-", with at least one letter or digit.
 */
export const USERNAME_RULE = {
  min: 3,
  max: 50,
  pattern: "^(?=.*[A-Za-z0-9])[A-Za-z0-9._-]+$",
  messages: {
    min: "Username must be at least 3 characters",
    max: "Username must be at most 50 characters",
    characters:
      "Username may contain only letters, digits, '.', '_' and '-', and needs a letter or digit",
  },
} as const;

const USERNAME_REGEX = new RegExp(USERNAME_RULE.pattern);

/** The first part of the rule `value` breaks, in the order Zod checks them; null when it keeps it. */
export const usernameRuleViolation = (value: string): string | null => {
  if (value.length < USERNAME_RULE.min) return USERNAME_RULE.messages.min;
  if (value.length > USERNAME_RULE.max) return USERNAME_RULE.messages.max;
  if (!USERNAME_REGEX.test(value)) return USERNAME_RULE.messages.characters;
  return null;
};
