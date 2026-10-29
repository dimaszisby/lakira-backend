import fs from "fs";
import path from "path";

/**
 * Open work lives in GitHub Issues since 2026-10-29 (ADR-0085). The debt
 * register and the todo folder stay as records, and this checks they stay
 * honest ones: every row the register still lists as open says where it went,
 * and every todo that is not finished names the issue that carries it now. It
 * replaces `debt-register-todos.test.ts`, which held todos to register rows
 * (B-60). Adapted from lakira-frontend's `open-work-records.test.ts`.
 *
 * Intake is an issue now, so a todo dated after the freeze is refused. Whether
 * an issue it names exists or is open is GitHub's to say; `gh issue view` is
 * the check.
 */
const ROOT = path.resolve(__dirname, "../..");
const TODOS = path.join(ROOT, "docs/internal/todos");
const REGISTER = path.join(
  ROOT,
  "docs/internal/initiatives/backend-debt-register/register.md",
);

const FROZEN = "2026-10-29";

// A status that starts with one of these is finished (backend-debt-register
// D-11); any other is open.
const FINISHED = [
  "Complete",
  "Fixed",
  "Closed",
  "Done",
  "Superseded",
  "Resolved",
  "Not a todo",
];

const statusOf = (text: string): string | undefined =>
  /\*\*Status:?\*\*:?\s*([\s\S]*?)(?=\n- \*\*|\n\n|\n*$)/
    .exec(text)?.[1]
    .replace(/\s+/g, " ")
    .trim();

const isOpen = (status: string): boolean =>
  !FINISHED.some((word) => status.startsWith(word));

/** The ids of a register's table rows: `| B-94 |`, `| O-03 |`. */
const rowIds = (text: string): string[] =>
  text
    .split("\n")
    .map((line) => /^\| ([BO]-\d+) +\|/.exec(line)?.[1])
    .filter((id): id is string => id !== undefined);

/** The open part: above `## Closed`, without the mapping section. */
const split = (register: string) => {
  const open = register.split(/^## Closed$/m)[0];
  const start = open.search(/^## Where each row went$/m);
  if (start < 0) return { rows: open, mapping: "" };
  const end = open.indexOf("\n## ", start + 1);
  return {
    rows: open.slice(0, start) + (end < 0 ? "" : open.slice(end)),
    mapping: open.slice(start, end < 0 ? undefined : end),
  };
};

const mappingOf = (section: string): Map<string, string> =>
  new Map(
    section
      .split("\n")
      .map((line) => /^\| ([BO]-\d+) +\| ([^|]+?) +\|/.exec(line))
      .filter((match): match is RegExpExecArray => match !== null)
      .map((match) => [match[1], match[2]] as const),
  );

const TARGET = /^(#\d+|`known-gaps\.md`|closed in #\d+)$/;

const unmappedRows = (register: string): string[] => {
  const { rows, mapping } = split(register);
  const map = mappingOf(mapping);
  return rowIds(rows).filter((id) => !map.has(id));
};

const badTargets = (register: string): string[] =>
  [...mappingOf(split(register).mapping)]
    .filter(([, to]) => !TARGET.test(to))
    .map(([id, to]) => `${id} -> ${to}`);

type Todo = { name: string; text: string };

const openTodosWithoutIssue = (todos: Todo[]): string[] =>
  todos
    .filter(({ text }) => {
      const status = statusOf(text);
      return status !== undefined && isOpen(status);
    })
    .filter(({ text }) => !/#\d+|known-gaps\.md/.test(statusOf(text) ?? ""))
    .map(({ name }) => name);

const datedAfterFreeze = (names: string[]): string[] =>
  names.filter(
    (name) => /^\d{4}-\d{2}-\d{2}-/.test(name) && name.slice(0, 10) > FROZEN,
  );

const register = fs.readFileSync(REGISTER, "utf-8");
const todos: Todo[] = fs
  .readdirSync(TODOS)
  .filter((name) => name.endsWith(".md"))
  .map((name) => ({
    name,
    text: fs.readFileSync(path.join(TODOS, name), "utf-8"),
  }));

describe("the frozen debt register and the todo folder", () => {
  it("reads a frozen register with open rows and a mapping", () => {
    // Otherwise the checks below pass against nothing.
    expect(register).toContain(`**Frozen:** ${FROZEN}`);
    expect(rowIds(split(register).rows).length).toBeGreaterThan(0);
    expect(mappingOf(split(register).mapping).size).toBeGreaterThan(0);
  });

  it("says where every open row and question went", () => {
    expect(unmappedRows(register)).toEqual([]);
  });

  it("maps each to an issue, known-gaps.md or the pull request that closed it", () => {
    expect(badTargets(register)).toEqual([]);
  });

  it("names the issue that carries each open todo", () => {
    expect(openTodosWithoutIssue(todos)).toEqual([]);
  });

  it("refuses a todo dated after the freeze, since new work is an issue", () => {
    expect(datedAfterFreeze(todos.map(({ name }) => name))).toEqual([]);
  });

  // The checks above pass on the real files; these prove they can fail.
  describe("on a register and todos built in memory", () => {
    const built = [
      "**Frozen:** 2026-10-29",
      "| B-01 | open row |",
      "| O-02 | a question |",
      "## Where each row went",
      "| B-01 | #300 |",
      "| O-02 | somewhere |",
      "## Closed",
      "| B-09 | closed long ago |",
    ].join("\n");

    it("names a row the mapping leaves out", () => {
      expect(unmappedRows(built.replace("| B-01 | #300 |\n", ""))).toEqual([
        "B-01",
      ]);
    });

    it("names a mapping that points nowhere", () => {
      expect(badTargets(built)).toEqual(["O-02 -> somewhere"]);
    });

    it("names an open todo with no issue, and passes a finished one", () => {
      expect(
        openTodosWithoutIssue([
          { name: "a.md", text: "- **Status:** Open. Register row B-01\n" },
          { name: "b.md", text: "- **Status:** Open. Issue #300\n" },
          { name: "c.md", text: "- **Status:** Fixed in #12\n" },
        ]),
      ).toEqual(["a.md"]);
    });

    it("names a todo dated after the freeze", () => {
      expect(
        datedAfterFreeze([
          "2026-10-29-todo-on-the-day.md",
          "2026-10-30-todo-too-late.md",
        ]),
      ).toEqual(["2026-10-30-todo-too-late.md"]);
    });
  });
});
