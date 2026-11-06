import { describe, it, expect } from "@jest/globals";
import { withTestEnv } from "../../helpers/env-test-utils.js";
import { getEnv } from "@/config/envManager.js";

/**
 * Issue #245, ADR-0088. `cors` compares each configured origin with the
 * browser's `Origin` exactly, and a browser sends a lowercase scheme and host
 * with no path. Each entry is kept as its origin, so a different spelling of
 * the same origin still matches, and an entry that is not an origin is refused
 * at startup, naming the variable and the entry's position but never its value.
 */
const originsWith = (value: string | undefined) =>
  withTestEnv(() => getEnv("CORS_ORIGIN"), {
    overrides: { CORS_ORIGIN: value },
  });

describe("CORS_ORIGIN (#245, ADR-0088)", () => {
  it.each([
    ["an uppercase host", "https://App.Example.com", "https://app.example.com"],
    ["a trailing slash", "https://app.example.com/", "https://app.example.com"],
    [
      "the default port",
      "https://app.example.com:443",
      "https://app.example.com",
    ],
    [
      "a local origin with a port",
      "http://localhost:3000",
      "http://localhost:3000",
    ],
  ])("keeps the origin of %s", async (_label, value, origin) => {
    await expect(originsWith(value)).resolves.toEqual([origin]);
  });

  it("keeps one entry for two spellings of one origin", async () => {
    await expect(
      originsWith("https://app.example.com, https://APP.example.com/"),
    ).resolves.toEqual(["https://app.example.com"]);
  });

  it("stays unset when unset, so the app's own default applies", async () => {
    await expect(originsWith(undefined)).resolves.toBeUndefined();
  });

  it.each([
    ["a path", "https://app.example.com/app"],
    ["a query", "https://app.example.com/?a=1"],
    ["a hash", "https://app.example.com/#top"],
    ["credentials", "https://user:secret-pw@app.example.com"],
    ["another scheme", "ftp://app.example.com"],
    ["a wildcard", "*"],
    ["no scheme", "app.example.com"],
  ])(
    "refuses an entry with %s, by position and never by value",
    async (_label, value) => {
      const refused = originsWith(`https://ok.example.com,${value}`);

      await expect(refused).rejects.toMatchObject({
        issues: expect.arrayContaining([
          expect.objectContaining({
            path: ["CORS_ORIGIN"],
            message: expect.stringMatching(
              /^CORS_ORIGIN entry 2 is not a bare origin/,
            ),
          }),
        ]),
      });
      const error = (await refused.catch((e: unknown) => e)) as {
        issues: { message: string }[];
      };
      expect(JSON.stringify(error.issues)).not.toContain(value);
    },
  );
});
