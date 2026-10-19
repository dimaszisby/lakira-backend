import { describe, it, expect } from "@jest/globals";
import { withTestEnv } from "@/tests/env-test-utils.js";
import { getEnv } from "@/config/envManager.js";

/**
 * Kit release-and-retry-after, D-03 (register row B-27, lakira-frontend F-61). `/health`
 * reports APP_RELEASE. `.env.example` shipped `APP_RELEASE=` with no value, and the schema
 * kept the empty string, so `/health` said `""` where the logger, which reads it with `||`,
 * said `"unknown"`. An empty value now counts as unset.
 */
const releaseWith = (overrides: Record<string, string>) =>
  withTestEnv(() => getEnv("APP_RELEASE"), { overrides });

describe("APP_RELEASE (release-and-retry-after D-03)", () => {
  it("keeps a value that is set", async () => {
    await expect(releaseWith({ APP_RELEASE: "abc1234" })).resolves.toBe(
      "abc1234",
    );
  });

  it("reads an empty value as unset, so it is never reported as blank", async () => {
    await expect(
      releaseWith({ APP_RELEASE: "", RENDER_GIT_COMMIT: "" }),
    ).resolves.toBe("unknown");
  });

  it("falls back to RENDER_GIT_COMMIT when APP_RELEASE is empty", async () => {
    await expect(
      releaseWith({ APP_RELEASE: "", RENDER_GIT_COMMIT: "def5678" }),
    ).resolves.toBe("def5678");
  });
});
