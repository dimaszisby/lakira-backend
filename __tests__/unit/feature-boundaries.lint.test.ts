import { execFileSync } from "child_process";
import path from "path";

/**
 * ADR-0044 decision 6: every boundary rule must be seen to reject before it is trusted. Each
 * rule once was, by hand, in one spelling only, and the other spelling went unnoticed
 * (SaaS-readiness caveat C4, audit-2026-09-29). This keeps them seen, in both spellings.
 *
 * It runs the repository's own ESLint config through the CLI, with each case as one import line of
 * a synthetic file linted under a real feature file's path. The CLI rather than the Node API
 * because eslint.config.mjs is ESM, which Jest cannot load in-process here.
 */
const ROOT = path.resolve(__dirname, "../..");
const ESLINT_BIN = path.join(ROOT, "node_modules/eslint/bin/eslint.js");

// An ordinary feature file (metric-log), and one in the frozen model exception.
const FEATURE_FILE =
  "src/features/public/metric-log/application/use-cases/CreateMetricLog.ts";
const MODEL_FILE =
  "src/features/public/metric-log/infrastructure/persistence/models/metric-log.sequelize.ts";

type Case = { spec: string; rejected: boolean };

/** Returns, for each case, whether no-restricted-imports reported its line. */
const lint = (filePath: string, cases: Case[]): boolean[] => {
  const source = cases.map((c) => `import "${c.spec}";`).join("\n") + "\n";
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
  const reported = new Set(
    result.messages
      .filter((m) => m.ruleId === "no-restricted-imports")
      .map((m) => m.line),
  );
  return cases.map((_, i) => reported.has(i + 1));
};

const expectCases = (filePath: string, cases: Case[]) => {
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

describe("feature boundaries in ESLint (ADR-0044)", () => {
  it("rejects another feature's internals in both spellings", () => {
    expectCases(FEATURE_FILE, [
      { spec: "@/features/metric/domain/entities/Metric.js", rejected: true },
      {
        spec: "@/features/public/metric/domain/entities/Metric.js",
        rejected: true,
      },
      {
        spec: "@/features/metric/application/ports/MetricAccessPort.js",
        rejected: true,
      },
      {
        spec: "@/features/public/metric/application/ports/MetricAccessPort.js",
        rejected: true,
      },
      {
        spec: "@/features/auth/infrastructure/http/authMiddleware.js",
        rejected: true,
      },
      {
        spec: "@/features/shared/auth/infrastructure/http/authMiddleware.js",
        rejected: true,
      },
    ]);
  }, 60_000);

  it("rejects another feature's composition root in both spellings (ADR-0045)", () => {
    expectCases(FEATURE_FILE, [
      { spec: "@/features/metric", rejected: true },
      { spec: "@/features/public/metric", rejected: true },
      { spec: "@/features/metric/index.js", rejected: true },
      { spec: "@/features/public/metric/index.js", rejected: true },
      { spec: "@/features/metric/feature.js", rejected: true },
      { spec: "@/features/public/metric/feature.js", rejected: true },
    ]);
  }, 60_000);

  it("allows the public surface in both spellings, and relative imports within a feature", () => {
    expectCases(FEATURE_FILE, [
      { spec: "@/features/metric/public.js", rejected: false },
      { spec: "@/features/public/metric/public.js", rejected: false },
      { spec: "../ports/MetricAccessPort.js", rejected: false },
      { spec: "../../domain/entities/MetricLog.js", rejected: false },
    ]);
  }, 60_000);

  it("lets a model file import another feature's models, and nothing else of it", () => {
    expectCases(MODEL_FILE, [
      {
        spec: "@/features/metric/infrastructure/persistence/models/metric.sequelize.js",
        rejected: false,
      },
      {
        spec: "@/features/public/metric/infrastructure/persistence/models/metric.sequelize.js",
        rejected: false,
      },
      // auth keeps its repositories flat in persistence/, not persistence/repositories/.
      {
        spec: "@/features/auth/infrastructure/persistence/UserRepositorySequelize.js",
        rejected: true,
      },
      {
        spec: "@/features/shared/auth/infrastructure/persistence/UserRepositorySequelize.js",
        rejected: true,
      },
      {
        spec: "@/features/public/metric/domain/entities/Metric.js",
        rejected: true,
      },
    ]);
  }, 60_000);
});
