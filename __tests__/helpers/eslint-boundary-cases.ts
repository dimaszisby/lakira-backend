import { execFileSync } from "child_process";
import path from "path";

/**
 * ADR-0044 decision 6: every boundary rule must be seen to reject before it is trusted. Each
 * rule once was, by hand, in one spelling only, and the other spelling went unnoticed
 * (SaaS-readiness caveat C4, audit-2026-09-29). This keeps them seen, in both spellings.
 *
 * The cases are split across four `feature-boundaries*.lint.test.ts` files so Jest's workers
 * can share them (#286, ADR-0094); these are their helpers.
 *
 * It runs the repository's own ESLint config through the CLI, with each case as one import line of
 * a synthetic file linted under a real feature file's path. The CLI rather than the Node API
 * because eslint.config.mjs is ESM, which Jest cannot load in-process here.
 */
export const ROOT = path.resolve(__dirname, "../..");
export const ESLINT_BIN = path.join(ROOT, "node_modules/eslint/bin/eslint.js");

// An ordinary feature file (metric-log), and one in the frozen model exception.
export const FEATURE_FILE =
  "src/features/public/metric-log/application/use-cases/CreateMetricLog.ts";
export const INFRASTRUCTURE_FILE =
  "src/features/public/metric-log/infrastructure/http/controller.ts";
export const MODEL_FILE =
  "src/features/public/metric-log/infrastructure/persistence/models/metric-log.sequelize.ts";

export type Case = { spec: string; rejected: boolean };

/** The lines of `source` that `ruleId` (or any of them) reported, linted as if it were `filePath`. */
export const reportedLines = (
  filePath: string,
  source: string,
  ruleId: string | string[],
): Set<number> => {
  const ruleIds = ([] as string[]).concat(ruleId);
  let output: string;
  try {
    output = execFileSync(
      process.execPath,
      [
        ESLINT_BIN,
        "--stdin",
        "--stdin-filename",
        filePath,
        // With the type-aware `project` set, typescript-eslint parses the file on disk, not the
        // stdin text, so every case would be judged against the real file. This rule needs no
        // type information.
        "--parser-options",
        "project:false",
        // The rules that do need it would stop ESLint before it reports anything
        // (ADR-0076); promise-rules.lint.test.ts covers them.
        "--rule",
        "@typescript-eslint/no-floating-promises: off",
        "--rule",
        "@typescript-eslint/no-misused-promises: off",
        "--format",
        "json",
      ],
      { cwd: ROOT, input: source, encoding: "utf-8" },
    );
  } catch (error) {
    // ESLint exits 1 when it reports errors; the JSON is still on stdout.
    output = (error as { stdout: string }).stdout;
  }
  const [result] = JSON.parse(output) as [
    { messages: { ruleId: string | null; line: number }[] },
  ];
  return new Set(
    result.messages
      .filter((m) => m.ruleId !== null && ruleIds.includes(m.ruleId))
      .map((m) => m.line),
  );
};

// The two rules that judge an import: no-restricted-imports reads the specifier, and the local
// rule reads where a relative one lands (inner-layers-reach-infrastructure D-01).
export const IMPORT_RULES = [
  "no-restricted-imports",
  "boundaries/relative-imports-on-the-list",
];

/** Returns, for each case, whether an import rule reported its line. */
export const lint = (filePath: string, cases: Case[]): boolean[] => {
  const source = cases.map((c) => `import "${c.spec}";`).join("\n") + "\n";
  const reported = reportedLines(filePath, source, IMPORT_RULES);
  return cases.map((_, i) => reported.has(i + 1));
};

export const expectCases = (filePath: string, cases: Case[]) => {
  const actual = lint(filePath, cases);
  const wrong = cases
    .map((c, i) => ({ ...c, got: actual[i] }))
    .filter((c) => c.got !== c.rejected)
    .map(
      (c) =>
        `${c.spec}: expected ${c.rejected ? "rejected" : "allowed"}, was ${c.got ? "rejected" : "allowed"}`,
    );
  expect(wrong).toEqual([]);
};
