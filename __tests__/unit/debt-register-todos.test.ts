import fs from "fs";
import path from "path";

/**
 * The debt register is where "what's next" is answered from, and a todo with
 * no row is invisible to it (`.claude/rules/workflow.md` § What's next). This
 * checks the register against `docs/internal/todos/` in both directions
 * (register B-60, kit backend-debt-register D-11).
 *
 * A row that moves to Closed drops its Source column, so a finished todo is
 * usually not named, and only open todos are checked.
 */
const ROOT = path.resolve(__dirname, "../..");
const TODOS = path.join(ROOT, "docs/internal/todos");
const REGISTER = path.join(
  ROOT,
  "docs/internal/initiatives/backend-debt-register/register.md",
);

// A status that starts with one of these is finished; anything else ("Open",
// "Partly", "Investigated", "Needs triage", "Not started") is open.
const FINISHED = [
  "Complete",
  "Fixed",
  "Closed",
  "Done",
  "Superseded",
  "Resolved",
  "Not a todo",
];

const TODO_NAME = /\b\d{4}-\d{2}-\d{2}-todo-[a-z0-9-]*[a-z0-9]\b/g;

type Todos = Record<string, string | undefined>;

/** Each todo's name, without `.md`, and the text of its first status line. */
const readTodos = (): Todos =>
  Object.fromEntries(
    fs
      .readdirSync(TODOS)
      .filter((file) => file.endsWith(".md"))
      .map((file) => [
        file.replace(/\.md$/, ""),
        statusOf(fs.readFileSync(path.join(TODOS, file), "utf-8")),
      ]),
  );

const statusOf = (text: string): string | undefined =>
  /\*\*Status:?\*\*:?\s*(.*)/.exec(text)?.[1].trim();

const isOpen = (status: string): boolean =>
  !FINISHED.some((word) => status.startsWith(word));

/** The register above `## Closed`: the rows still open. */
const openRows = (register: string): string =>
  register.split(/^## Closed$/m)[0];

const withoutStatus = (todos: Todos): string[] =>
  Object.entries(todos)
    .filter(([, status]) => status === undefined)
    .map(([name]) => name);

const openButUnnamed = (todos: Todos, register: string): string[] => {
  const rows = openRows(register);
  return Object.entries(todos)
    .filter(([name, status]) => status !== undefined && isOpen(status))
    .filter(([name]) => !rows.includes(name))
    .map(([name]) => name);
};

const namedButNotOpen = (todos: Todos, register: string): string[] =>
  [...new Set(openRows(register).match(TODO_NAME) ?? [])]
    .filter((name) => {
      const status = todos[name];
      return status === undefined || !isOpen(status);
    })
    .map((name) =>
      name in todos
        ? `${name} (${todos[name] ?? "no status"})`
        : `${name} (no such file)`,
    );

describe("the debt register against docs/internal/todos", () => {
  const todos = readTodos();
  const register = fs.readFileSync(REGISTER, "utf-8");

  it("finds every todo's status", () => {
    expect(withoutStatus(todos)).toEqual([]);
  });

  it("has an open row for every open todo", () => {
    expect(openButUnnamed(todos, register)).toEqual([]);
  });

  it("names in its open rows only todos that exist and are open", () => {
    expect(namedButNotOpen(todos, register)).toEqual([]);
  });

  // The checks above pass on the real files; these prove they can fail.
  describe("on a register and todos built in memory", () => {
    const register = [
      "| B-01 | x | `2026-01-01-todo-still-open.md` |",
      "## Closed",
      "| B-02 | y | `2026-01-02-todo-long-done.md` |",
    ].join("\n");

    it("names an open todo the register does not name", () => {
      expect(
        openButUnnamed(
          {
            "2026-01-01-todo-still-open": "Open",
            "2026-01-03-todo-forgotten": "Partly. Item 1 fixed",
            "2026-01-02-todo-long-done": "Fixed in #1",
          },
          register,
        ),
      ).toEqual(["2026-01-03-todo-forgotten"]);
    });

    it("names an open row whose todo is finished or missing", () => {
      expect(
        namedButNotOpen(
          { "2026-01-01-todo-still-open": "Closed — by decision" },
          `${register}\n`.replace(
            "## Closed",
            "| B-03 | z | `2026-01-04-todo-renamed.md` |\n## Closed",
          ),
        ),
      ).toEqual([
        "2026-01-01-todo-still-open (Closed — by decision)",
        "2026-01-04-todo-renamed (no such file)",
      ]);
    });

    it("names a todo with no status line", () => {
      expect(
        withoutStatus({
          "2026-01-01-todo-still-open": "Open",
          "2026-01-05-todo-no-status": undefined,
        }),
      ).toEqual(["2026-01-05-todo-no-status"]);
    });
  });
});
