import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Turns every Markdown link into `docs/internal/` into its text, in each `.md`
 * file outside that folder. `scripts/bootstrap-fork.sh` deletes the folder, the
 * upstream's working material, and runs this right after, so a fork has no
 * dead link where an ADR names the kit that took its decision. The template
 * keeps its links (audit 2026-09-29, R12; kit fork-residue D-02).
 *
 * Plain JavaScript, like `scripts/openapi-spec-path.js`, so bootstrap runs it
 * under Node with no loader. It walks the tree rather than asking git, because
 * bootstrap does not need a checkout.
 *
 * Usage: node scripts/unlink-internal-docs.js [--check] [root]
 *   --check  change nothing; exit 1, naming each link, while one is left.
 *   root     the tree to rewrite; the repository by default.
 */

const SKIPPED_DIRS = new Set(["node_modules", ".git", "dist", "coverage"]);

// [text](target) or [text](target "title"); a preceding `!` is an image.
const INLINE_LINK = /(!?)\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

// A scheme (https:, mailto:) or a bare anchor is never a path in the tree.
const NOT_A_PATH = /^(?:[a-z][a-z0-9+.-]*:|#)/i;

const markdownFiles = (dir, internalDir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return SKIPPED_DIRS.has(entry.name) || full === internalDir
        ? []
        : markdownFiles(full, internalDir);
    }
    return entry.name.endsWith(".md") ? [full] : [];
  });

// Where the source is code: fenced blocks and inline code spans. A link that
// starts inside one is an example (a template's `[kit](../../internal/...)`),
// not a link, and is left as written.
const FENCE = /^ {0,3}(```|~~~)/;
const INLINE_CODE = /`[^`\n]*`/g;

const codeRanges = (source) => {
  const ranges = [];
  let offset = 0;
  let fenceStart = -1;
  for (const line of source.split("\n")) {
    const end = offset + line.length;
    if (FENCE.test(line)) {
      if (fenceStart === -1) {
        fenceStart = offset;
      } else {
        ranges.push([fenceStart, end]);
        fenceStart = -1;
      }
    } else if (fenceStart === -1) {
      for (const span of line.matchAll(INLINE_CODE)) {
        ranges.push([
          offset + span.index,
          offset + span.index + span[0].length,
        ]);
      }
    }
    offset = end + 1;
  }
  if (fenceStart !== -1) ranges.push([fenceStart, source.length]);
  return ranges;
};

const pointsInto = (target, fromDir, internalDir) => {
  if (NOT_A_PATH.test(target)) return false;
  const [filePart] = target.split(/[#?]/);
  if (filePart === "") return false;
  let decoded = filePart;
  try {
    decoded = decodeURIComponent(filePart);
  } catch {
    // Not percent-encoded after all: resolve it as written.
  }
  const resolved = path.resolve(fromDir, decoded);
  return (
    resolved === internalDir || resolved.startsWith(internalDir + path.sep)
  );
};

const root = path.resolve(
  process.argv.slice(2).find((arg) => !arg.startsWith("--")) ??
    path.join(path.dirname(fileURLToPath(import.meta.url)), ".."),
);
const check = process.argv.includes("--check");
const internalDir = path.join(root, "docs", "internal");

let unlinked = 0;
const changedFiles = [];
const leftOver = [];

for (const file of markdownFiles(root, internalDir)) {
  const source = fs.readFileSync(file, "utf-8");
  const fromDir = path.dirname(file);
  const code = codeRanges(source);
  const inCode = (offset) =>
    code.some(([start, end]) => offset >= start && offset < end);
  let count = 0;
  const rewritten = source.replace(
    INLINE_LINK,
    (link, _image, text, target, offset) => {
      if (inCode(offset) || !pointsInto(target, fromDir, internalDir)) {
        return link;
      }
      count += 1;
      if (check) {
        const line = source.slice(0, offset).split("\n").length;
        leftOver.push(`${path.relative(root, file)}:${line}  ${link}`);
      }
      return text;
    },
  );
  if (count > 0 && !check) {
    fs.writeFileSync(file, rewritten);
    unlinked += count;
    changedFiles.push(file);
  }
}

if (check) {
  if (leftOver.length > 0) {
    console.error(
      `${leftOver.length} Markdown link(s) point into docs/internal/:\n${leftOver.join("\n")}`,
    );
    process.exit(1);
  }
  console.log("No Markdown link points into docs/internal/.");
} else {
  console.log(
    `Unlinked ${unlinked} links in ${changedFiles.length} files that pointed into docs/internal/.`,
  );
}
