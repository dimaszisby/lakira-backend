import { describe, it, expect } from "@jest/globals";
import { hashEmail } from "@/utils/email-hash.js";

describe("hashEmail", () => {
  it("returns the SHA-256 hex digest of the address", () => {
    expect(hashEmail("someone@example.com")).toBe(
      "72497f475e4f76d0b28f57c73a084ece576d170874eba3ee2609d9afe4b71aab",
    );
  });

  it("ignores case and surrounding whitespace", () => {
    expect(hashEmail("  Someone@Example.COM ")).toBe(
      hashEmail("someone@example.com"),
    );
  });

  it("does not contain the address", () => {
    expect(hashEmail("someone@example.com")).not.toContain("someone");
  });
});
