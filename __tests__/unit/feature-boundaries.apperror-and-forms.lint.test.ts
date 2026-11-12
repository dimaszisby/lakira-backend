import {
  FEATURE_FILE,
  MODEL_FILE,
  reportedLines,
  expectCases,
  type Case,
} from "../helpers/eslint-boundary-cases.js";

/**
 * ADR-0044 decision 6: every boundary rule must be seen to reject before it is trusted. The
 * cases live in four files so Jest's workers can run them side by side (#286, ADR-0094);
 * the helpers are in __tests__/helpers/eslint-boundary-cases.ts.
 */
describe("feature boundaries in ESLint (ADR-0044)", () => {
  // Kit boundary-rule-residuals, D-07. The rule was a list of globs with no case here, and
  // the `@utils/` alias got past it; in src/shared/domain it was not applied at all
  // (SaaS-readiness caveat C4, audit-2026-10-10 V4). Kit application-errors, D-02: the
  // application layers take the same rule (audit R7).
  describe("the domain and application layers import no AppError", () => {
    const FEATURE_DOMAIN_FILE =
      "src/features/public/metric-log/domain/entities/MetricLog.ts";
    const SHARED_DOMAIN_FILE = "src/shared/domain/errors/DomainError.ts";
    const FEATURE_APPLICATION_FILE = FEATURE_FILE;
    const SHARED_APPLICATION_FILE =
      "src/shared/application/ports/MessageQueuePort.ts";

    const APP_ERROR_SPELLINGS = [
      "@/utils/AppError.js",
      "@/utils/AppError",
      "@utils/AppError.js",
      "@utils/AppError",
      "../../../../../utils/AppError.js",
      "../../../../../utils/AppError",
    ];
    const spellings = (rejected: boolean): Case[] =>
      APP_ERROR_SPELLINGS.map((spec) => ({ spec, rejected }));

    it("rejects every spelling from a feature's domain file", () => {
      expectCases(FEATURE_DOMAIN_FILE, spellings(true));
    }, 60_000);

    it("rejects every spelling from the shared kernel's domain", () => {
      expectCases(SHARED_DOMAIN_FILE, spellings(true));
    }, 60_000);

    it("rejects every spelling from a feature's application file", () => {
      expectCases(FEATURE_APPLICATION_FILE, spellings(true));
    }, 60_000);

    it("rejects every spelling from the shared kernel's application layer", () => {
      expectCases(SHARED_APPLICATION_FILE, spellings(true));
    }, 60_000);

    it.each([
      "src/features/public/metric-log/infrastructure/http/controller.ts",
      "src/features/public/metric-log/infrastructure/persistence/repositories/MetricLogRepoSequelize.ts",
      "src/shared/middleware/error.ts",
    ])(
      "leaves %s free to import it",
      (file) => {
        // Not through `@utils/`, which no file may use since ADR-0092 (#259).
        expectCases(
          file,
          spellings(false).filter(({ spec }) => !spec.startsWith("@utils/")),
        );
      },
      60_000,
    );

    it("allows DomainError, and a file whose name only ends the same way", () => {
      const cases: Case[] = [
        { spec: "@/shared/domain/errors/DomainError.js", rejected: false },
        { spec: "./NotAppError.js", rejected: false },
        { spec: "./AppErrorKind.js", rejected: false },
      ];
      expectCases(FEATURE_DOMAIN_FILE, cases);
      expectCases(SHARED_DOMAIN_FILE, cases);
      expectCases(FEATURE_APPLICATION_FILE, cases);
    }, 60_000);
  });

  // Kit boundary-rule-residuals, D-08. no-restricted-imports reads static imports only, so
  // every rule above could be walked around with `import()` or an import type.
  describe("no import form the boundary rules cannot read, under src/", () => {
    const TARGET = "@/features/metric/domain/entities/Metric.js";
    const LINES = [
      `export const a = () => import("${TARGET}");`,
      `export const b = () => import(\`${TARGET}\`);`,
      "export const c = (path: string) => import(path);",
      `export type D = import("${TARGET}").Metric;`,
      // A specifier no boundary rule objects to is refused too: the form is what is banned.
      'export const e = () => import("node:crypto");',
      // createRequire builds a require that loads a file with no import statement.
      'import { createRequire } from "module";',
      'import { createRequire as f } from "node:module";',
      'export { createRequire as g } from "node:module";',
      'export * from "module";',
    ];
    const SOURCE = LINES.join("\n") + "\n";
    const ALL_LINES = LINES.map((_, i) => i + 1);

    const rejected = (file: string) =>
      [...reportedLines(file, SOURCE, "no-restricted-syntax")].sort();

    it.each([
      "src/features/public/metric-log/domain/entities/MetricLog.ts",
      FEATURE_FILE,
      "src/features/public/metric-log/infrastructure/http/controller.ts",
      MODEL_FILE,
      "src/shared/domain/errors/DomainError.ts",
      "src/shared/utils/error-envelope.ts",
      "src/utils/db-helper.ts",
      "src/composition/metric-log.ts",
      "src/lib/openapi/openapi-docs.ts",
      "src/server.ts",
      "src/worker.ts",
    ])(
      "rejects every form in %s",
      (file) => {
        expect(rejected(file)).toEqual(ALL_LINES);
      },
      60_000,
    );

    it("is not triggered by a package whose name only contains `module`", () => {
      const source = 'import "module-alias";\nimport "@/shared/module.js";\n';
      expect([
        ...reportedLines("src/server.ts", source, "no-restricted-syntax"),
      ]).toEqual([]);
    }, 60_000);

    it.each([
      "__tests__/unit/architecture.test.ts",
      "scripts/generate-openapi.ts",
    ])(
      "leaves %s alone",
      (file) => {
        expect(rejected(file)).toEqual([]);
      },
      60_000,
    );
  });
});
