/**
 * Conventional Commits enforcement, run from the `commit-msg` hook.
 *
 * `CLAUDE.md` already mandates a Conventional Commits prefix on every PR title;
 * this enforces the rule that was already chosen rather than introducing a new one.
 *
 * Scope note: this catches malformed messages, not *wrong* ones. Three commits on
 * `dev` share the subject "chore(dev-env): make local setup work from a fresh clone"
 * because a heredoc was recalled from shell history — every one of them is a valid
 * Conventional Commit. The fix for that is composing messages in an editor or via
 * `git commit -F <file>` rather than pasting at the prompt; this hook is a separate,
 * complementary control.
 */
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // `release` is used for the dev -> staging -> main promotion flow (e.g. PR #58,
    // "release(staging): ..."), which the default type list does not include.
    "type-enum": [
      2,
      "always",
      [
        "build",
        "chore",
        "ci",
        "docs",
        "feat",
        "fix",
        "perf",
        "refactor",
        "release",
        "revert",
        "style",
        "test",
      ],
    ],
  },
};
