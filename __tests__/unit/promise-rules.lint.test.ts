import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";

/**
 * ADR-0076 decision 1: a promise nobody awaits fails lint, in every linted file. Seen to reject,
 * as every lint rule here is (ADR-0044 decision 6).
 *
 * Both rules need type information, and with the type-aware `project` set typescript-eslint
 * parses the file on disk, not stdin text, so each case is written to a file under tmp/ (in
 * tsconfig.eslint.json's include, and gitignored) and linted there with the CLI.
 */
const ROOT = path.resolve(__dirname, "../..");
const ESLINT_BIN = path.join(ROOT, "node_modules/eslint/bin/eslint.js");
const FIXTURE_DIR = path.join(ROOT, "tmp", `promise-rules-${process.pid}`);

const RULES = [
  "@typescript-eslint/no-floating-promises",
  "@typescript-eslint/no-misused-promises",
];

type Case = { name: string; line: string; reportedBy: string | null };

const PRELUDE = [
  "const work = async (): Promise<void> => undefined;",
  "export const run = async (): Promise<void> => {",
];
const POSTLUDE = ["};", ""];

/** For each case, the promise rule that reported its line, or null. */
const lint = (extension: "ts" | "js", cases: Case[]): (string | null)[] => {
  const prelude =
    extension === "ts"
      ? PRELUDE
      : [
          "const work = async () => undefined;",
          "export const run = async () => {",
        ];
  const source = [...prelude, ...cases.map((c) => `  ${c.line}`), ...POSTLUDE];
  fs.mkdirSync(FIXTURE_DIR, { recursive: true });
  // Distinct basenames: TypeScript leaves out a .js file when a .ts file of
  // the same name exists, and nothing would be reported for it.
  const file = path.join(FIXTURE_DIR, `fixture-${extension}.${extension}`);
  fs.writeFileSync(file, source.join("\n"));

  let output: string;
  try {
    output = execFileSync(
      process.execPath,
      [ESLINT_BIN, "--no-ignore", "--format", "json", file],
      { cwd: ROOT, encoding: "utf-8" },
    );
  } catch (error) {
    // ESLint exits 1 when it reports errors; the JSON is still on stdout.
    output = (error as { stdout: string }).stdout;
  }
  const [result] = JSON.parse(output) as [
    { messages: { ruleId: string | null; line: number }[] },
  ];
  return cases.map((_, i) => {
    const line = prelude.length + i + 1;
    const hit = result.messages.find(
      (m) => m.line === line && m.ruleId !== null && RULES.includes(m.ruleId),
    );
    return hit ? hit.ruleId : null;
  });
};

const CASES: Case[] = [
  {
    name: "a bare call",
    line: "work();",
    reportedBy: "@typescript-eslint/no-floating-promises",
  },
  {
    name: "a promise returned where void is expected",
    line: 'process.on("SIGTERM", () => work());',
    reportedBy: "@typescript-eslint/no-misused-promises",
  },
  { name: "an awaited call", line: "await work();", reportedBy: null },
  { name: "a call marked void", line: "void work();", reportedBy: null },
  {
    name: "a handler that marks it void",
    line: 'process.on("SIGTERM", () => { void work(); });',
    reportedBy: null,
  },
  {
    name: "a call whose failure is handled",
    line: "work().catch(() => undefined);",
    reportedBy: null,
  },
];

const expectCases = (extension: "ts" | "js") => {
  const actual = lint(extension, CASES);
  const wrong = CASES.map((c, i) => ({ ...c, got: actual[i] }))
    .filter((c) => c.got !== c.reportedBy)
    .map(
      (c) =>
        `${c.name}: expected ${c.reportedBy ?? "allowed"}, was ${c.got ?? "allowed"}`,
    );
  expect(wrong).toEqual([]);
};

describe("promise rules in ESLint (ADR-0076)", () => {
  afterAll(() => {
    fs.rmSync(FIXTURE_DIR, { recursive: true, force: true });
  });

  it("reports an unawaited promise in a TypeScript file, and passes await, void and catch", () => {
    expectCases("ts");
  }, 60_000);

  it("reports the same in a JavaScript file", () => {
    expectCases("js");
  }, 60_000);
});
