import { describe, it, expect } from "@jest/globals";
import { withTestEnv } from "../../helpers/env-test-utils.js";
import { loadEnvOrExit } from "@/config/envManager.js";

// Kit api-tooling-residuals, D-01 (audit X23). DEFAULT_TZ is the tz of every analytics
// request that sends none, so an offset there would split every such request's range
// and buckets by twice the offset.
const envWithTz = (tz: string) =>
  withTestEnv(() => loadEnvOrExit(), { overrides: { DEFAULT_TZ: tz } });

describe("DEFAULT_TZ", () => {
  it.each(["Asia/Jakarta", "UTC"])("accepts %s", async (tz) => {
    const env = await envWithTz(tz);
    expect(env.DEFAULT_TZ).toBe(tz);
  });

  it.each(["+07:00", "GMT"])("refuses %s", async (tz) => {
    await expect(envWithTz(tz)).rejects.toMatchObject({
      issues: expect.arrayContaining([
        expect.objectContaining({ path: ["DEFAULT_TZ"] }),
      ]),
    });
  });
});
