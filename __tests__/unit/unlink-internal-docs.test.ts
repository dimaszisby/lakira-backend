import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

/**
 * Audit 2026-09-29, R12 (kit fork-residue D-02). bootstrap-fork.sh deletes
 * docs/internal/, so this script turns every Markdown link into it into its
 * text. It is plain ESM JavaScript, run by Node with no loader, as bootstrap
 * runs it.
 */
const SCRIPT = path.resolve(__dirname, "../../scripts/unlink-internal-docs.js");

const dirs: string[] = [];
afterAll(() => {
  for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
});

const tree = (files: Record<string, string>): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "unlink-internal-"));
  dirs.push(dir);
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), content);
  }
  return dir;
};

const unlink = (dir: string, ...args: string[]) =>
  execFileSync(process.execPath, [SCRIPT, ...args, dir], {
    stdio: "pipe",
    encoding: "utf-8",
  });

const read = (dir: string, file: string) =>
  fs.readFileSync(path.join(dir, file), "utf-8");

describe("unlink-internal-docs.js", () => {
  it("unlinks a link into docs/internal at any depth, keeping its text", () => {
    const dir = tree({
      "README.md": "[a](docs/internal/a.md) and [b](./docs/internal/)\n",
      "docs/how-to/x/guide.md": "[c](../../internal/kit/c.md#d-01)\n",
      "docs/explanation/decisions/adr.md":
        "`D-01` in [`the kit`](../../internal/kit/decisions.md)\n",
    });

    unlink(dir);

    expect(read(dir, "README.md")).toBe("a and b\n");
    expect(read(dir, "docs/how-to/x/guide.md")).toBe("c\n");
    expect(read(dir, "docs/explanation/decisions/adr.md")).toBe(
      "`D-01` in `the kit`\n",
    );
  });

  it("leaves every other link alone", () => {
    const content = [
      "[sibling](../internal-notes.md)",
      "[external](https://example.com/docs/internal/a.md)",
      "[anchor](#internal)",
      "[reference](../reference/internal.md)",
      "[src](../../src/internal/a.md)",
      "",
    ].join("\n");
    const dir = tree({ "docs/explanation/page.md": content });

    unlink(dir);

    expect(read(dir, "docs/explanation/page.md")).toBe(content);
  });

  it("leaves a link written as code alone, in a fence or inline", () => {
    const content = [
      "Write links as `[kit](docs/internal/kit/a.md)`.",
      "",
      "```md",
      "- **Origin:** [`kit`](docs/internal/kit/decisions.md)",
      "```",
      "",
      "But [this one](docs/internal/kit/a.md) is a link.",
      "",
    ].join("\n");
    const dir = tree({ "README.md": content });

    unlink(dir);

    expect(read(dir, "README.md")).toBe(
      content.replace("[this one](docs/internal/kit/a.md)", "this one"),
    );
  });

  it("leaves the files inside docs/internal, and node_modules, alone", () => {
    const inside = "[sibling](../other.md) [self](a.md)\n";
    const dependency = "[x](../../docs/internal/a.md)\n";
    const dir = tree({
      "docs/internal/kit/a.md": inside,
      "node_modules/pkg/README.md": dependency,
    });

    unlink(dir);

    expect(read(dir, "docs/internal/kit/a.md")).toBe(inside);
    expect(read(dir, "node_modules/pkg/README.md")).toBe(dependency);
  });

  it("says how many links it unlinked, in how many files", () => {
    const dir = tree({
      "a.md": "[x](docs/internal/a.md) [y](docs/internal/b.md)\n",
      "docs/b.md": "[z](internal/c.md)\n",
    });

    expect(unlink(dir)).toContain("3 links in 2 files");
  });

  describe("--check", () => {
    it("fails, naming each link, and changes nothing while one is left", () => {
      const content = "line one\n[x](docs/internal/a.md)\n";
      const dir = tree({ "a.md": content });

      expect(() => unlink(dir, "--check")).toThrow(/a\.md:2/);
      expect(read(dir, "a.md")).toBe(content);
    });

    it("passes when none is left", () => {
      const dir = tree({ "a.md": "[x](docs/reference/a.md)\n" });

      expect(() => unlink(dir, "--check")).not.toThrow();
    });
  });
});
