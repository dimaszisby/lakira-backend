import { describe, it, expect } from "@jest/globals";
import { cacheEntryName } from "@/utils/cache-entry-name.js";
import { buildCursorCacheKey } from "@/shared/cache/keys.js";

// Kit log-redaction-coverage, D-08. A cache entry is named in a log line by
// its namespace and a hash of its key, so nothing a user typed is in the name.
describe("cacheEntryName", () => {
  const cursorKey = (q: string) =>
    buildCursorCacheKey({
      feature: "metrics",
      version: 3,
      userId: "user-1",
      organizationId: "org-1",
      segments: [
        ["q", q],
        ["fn", "Jane Doe"],
      ],
    });

  it("names a cursor key by feature and version, then a 12-character hash", () => {
    expect(cacheEntryName(cursorKey("victim@example.com"))).toMatch(
      /^cursor:metrics:v3#[0-9a-f]{12}$/,
    );
  });

  it("puts nothing from the key's segments in the name", () => {
    const name = cacheEntryName(cursorKey("victim@example.com"));

    expect(name).not.toContain("victim");
    expect(name).not.toContain("Jane");
    expect(name).not.toContain("user-1");
    expect(name).not.toContain("org-1");
  });

  it("gives one key one name and two keys two names", () => {
    expect(cacheEntryName(cursorKey("a"))).toBe(cacheEntryName(cursorKey("a")));
    expect(cacheEntryName(cursorKey("a"))).not.toBe(
      cacheEntryName(cursorKey("b")),
    );
  });

  it("names any other key by its first segment", () => {
    expect(cacheEntryName("logStats:org-1:user-1:all")).toMatch(
      /^logStats#[0-9a-f]{12}$/,
    );
  });

  it("names an invalidation pattern by its namespace", () => {
    expect(cacheEntryName("cursor:metrics:v*:user-1:org:org-1:*")).toMatch(
      /^cursor:metrics:v\*#[0-9a-f]{12}$/,
    );
    expect(cacheEntryName("cursor:metrics:*")).toMatch(
      /^cursor:metrics#[0-9a-f]{12}$/,
    );
  });

  it("does not trust a first segment that is not a plain token", () => {
    expect(cacheEntryName("victim@example.com:rest")).toMatch(
      /^unknown#[0-9a-f]{12}$/,
    );
    expect(cacheEntryName("cursor:Jane Doe:v1:x")).toMatch(
      /^unknown#[0-9a-f]{12}$/,
    );
    expect(cacheEntryName("")).toMatch(/^unknown#[0-9a-f]{12}$/);
  });
});
