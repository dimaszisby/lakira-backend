import { describe, it, expect } from "@jest/globals";
import {
  cursorCacheNamespace,
  buildCursorCacheKey,
} from "@/shared/cache/keys.js";

// Cursor cache helpers are mostly string manipulation; document expectations here to make future refactors safer.

describe("shared/cache/keys", () => {
  describe("cursorCacheNamespace", () => {
    it("slugifies feature names and defaults to no version", () => {
      expect(cursorCacheNamespace("Metric Settings")).toBe(
        "cursor:Metric-Settings",
      );
    });

    it("appends normalized versions", () => {
      expect(cursorCacheNamespace("dashboard", 2)).toBe("cursor:dashboard:v2");
      expect(cursorCacheNamespace("dashboard", "03")).toBe(
        "cursor:dashboard:v03",
      );
      expect(cursorCacheNamespace("dashboard", "v5")).toBe(
        "cursor:dashboard:v5",
      );
      expect(cursorCacheNamespace("dashboard", "")).toBe("cursor:dashboard");
    });
  });

  describe("buildCursorCacheKey", () => {
    it("includes namespace, user scope, and segments", () => {
      const key = buildCursorCacheKey({
        feature: "metrics:list",
        version: 4,
        userId: "user-1",
        organizationId: "org-1",
        segments: [
          ["cursor", "  abc  "],
          ["filter", null],
          ["page", 2],
        ],
      });

      expect(key).toBe(
        "cursor:metrics:list:v4:user-1:org:org-1:cursor:abc:filter:_:page:2",
      );
    });

    it("normalizes user and segment values", () => {
      const key = buildCursorCacheKey({
        feature: "analytics",
        userId: "",
        organizationId: "",
        segments: [
          ["empty", ""],
          ["boolTrue", true],
          ["boolFalse", false],
          ["nan", Number.NaN],
          ["inf", Number.POSITIVE_INFINITY],
          ["whitespace", "   "],
          ["zero", 0],
          ["text", " value "],
        ],
      });

      expect(key).toBe(
        [
          "cursor:analytics:v1",
          "_", // userId
          "org:_",
          "empty:_",
          "boolTrue:1",
          "boolFalse:0",
          "nan:_",
          "inf:_",
          "whitespace:_",
          "zero:0",
          "text:value",
        ].join(":"),
      );
    });

    it("falls back when userId missing and applies default version", () => {
      const key = buildCursorCacheKey({
        feature: "metrics",
        version: undefined,
        // An organization is required (architecture-boundaries D-03).
        organizationId: "org-1",
        segments: [],
      });

      expect(key).toBe("cursor:metrics:v1:_:org:org-1");
    });
  });

  // Kit query-values-mean-what-they-say, D-03 (register row B-46; audit S12). A string
  // segment was only trimmed: a search text holding `:` could stand for the next segment,
  // and a search for `_` shared its key with no search at all.
  describe("string segments are encoded", () => {
    const key = (segments: [string, string | undefined][]) =>
      buildCursorCacheKey({
        feature: "metrics",
        version: 4,
        userId: "00000000-0000-4000-8000-000000000001",
        organizationId: "00000000-0000-4000-8000-000000000002",
        segments,
      });

    it("keeps a search holding a separator apart from a filter", () => {
      // Both were `q:x:fn:y:fn:_`: two free-text fields, one shifted into the other.
      expect(
        key([
          ["q", "x:fn:y"],
          ["fn", undefined],
        ]),
      ).not.toBe(
        key([
          ["q", "x"],
          ["fn", "y:fn:_"],
        ]),
      );
    });

    it("keeps a search for the sentinel apart from no search", () => {
      expect(key([["q", "_"]])).not.toBe(key([["q", undefined]]));
      expect(key([["q", "_"]])).not.toBe(key([["q", ""]]));
    });

    it("encodes a glob character, so a key is never a pattern", () => {
      expect(key([["q", "a*"]])).toContain("q:a%2A");
    });

    it("leaves an id, a number and a plain word as they were", () => {
      const id = "00000000-0000-4000-8000-000000000003";
      expect(
        key([
          ["fm", id],
          ["l", "20"],
          ["s", "-createdAt"],
        ]),
      ).toBe(
        `cursor:metrics:v4:00000000-0000-4000-8000-000000000001:org:00000000-0000-4000-8000-000000000002:fm:${id}:l:20:s:-createdAt`,
      );
    });
  });
});
