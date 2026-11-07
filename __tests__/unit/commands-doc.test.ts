import fs from "fs";
import path from "path";

/**
 * `docs/reference/commands.md` is the single source of truth for the npm
 * scripts (`.claude/rules/commands.md`), and nothing checked it: a second copy
 * once documented `migrate:dev`, which never existed (todo
 * 2026-09-24-todo-commands-doc-drift-check, register B-56, kit docs-sweep D-06).
 */
const ROOT = path.resolve(__dirname, "../..");
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), "utf-8");

const PAGE = "docs/reference/commands.md";
const RULE = ".claude/rules/commands.md";

// Named on both pages only to say they never existed (`commands.md` §
// Migrations, `.claude/rules/commands.md`). No other unknown name passes.
const NEVER_EXISTED = ["migrate:dev", "migrate:undo:dev"];

/** `migrate:{test,staging}:undo` → `migrate:test:undo`, `migrate:staging:undo`. */
const expandBraces = (name: string): string[] => {
  const group = /\{([^{}]*)\}/.exec(name);
  if (!group) return [name];
  return group[1]
    .split(",")
    .flatMap((part) => expandBraces(name.replace(group[0], part)));
};

const SCRIPT_NAME = "[A-Za-z0-9:._{},-]+";

/** Every name a page runs as `npm run <name>`, braces expanded. */
const namesRun = (text: string): string[] => [
  ...new Set(
    [...text.matchAll(new RegExp(`npm run (${SCRIPT_NAME})`, "g"))].flatMap(
      // A name that ends a sentence outside backticks keeps no full stop.
      (match) => expandBraces(match[1].replace(/\.+$/, "")),
    ),
  ),
];

/**
 * Whether the page documents a script: in backticks as `npm run <name>`, as
 * `npm <name>` for npm's own `start` and `test`, or, for a name with a colon,
 * bare, as the variants written beside their command are (`lint:fix`). A
 * plain name cannot pass through an unrelated word in backticks.
 */
const documented = (text: string, script: string): boolean => {
  const inBackticks = [
    ...text.matchAll(new RegExp(`\`npm run (${SCRIPT_NAME})\``, "g")),
  ].flatMap((match) => expandBraces(match[1]));
  if (inBackticks.includes(script)) return true;
  if (text.includes(`\`npm ${script}\``)) return true;
  return script.includes(":") && text.includes(`\`${script}\``);
};

const scripts = Object.keys(
  (JSON.parse(read("package.json")) as { scripts: Record<string, string> })
    .scripts,
);

const undocumented = (page: string) =>
  scripts.filter((script) => !documented(page, script));

const unknown = (text: string) =>
  namesRun(text).filter(
    (name) => !scripts.includes(name) && !NEVER_EXISTED.includes(name),
  );

describe("docs/reference/commands.md against package.json", () => {
  it("documents every script in package.json", () => {
    expect(undocumented(read(PAGE))).toEqual([]);
  });

  it.each([PAGE, RULE])("%s runs no script that does not exist", (file) => {
    expect(unknown(read(file))).toEqual([]);
  });

  // The checks above pass on the real files; these prove they can fail.
  it("names a script whose row is deleted", () => {
    const page = read(PAGE)
      .split("\n")
      .filter((line) => !line.startsWith("| `npm run docs:openapi:validate`"))
      .join("\n");

    expect(undocumented(page)).toEqual(["docs:openapi:validate"]);
  });

  it("names a script the page runs that does not exist", () => {
    const page = `${read(PAGE)}\n| \`npm run migrate:dev2\` | Not real |\n`;

    expect(unknown(page)).toEqual(["migrate:dev2"]);
  });

  it("reads a name that ends a sentence without its full stop", () => {
    expect(namesRun("Then run npm run build.")).toEqual(["build"]);
  });

  it("expands a brace group into each script it names", () => {
    expect(
      namesRun("`npm run migrate:{test,staging,production}:undo`"),
    ).toEqual([
      "migrate:test:undo",
      "migrate:staging:undo",
      "migrate:production:undo",
    ]);
  });
});
