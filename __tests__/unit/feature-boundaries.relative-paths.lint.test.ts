import { readFileSync } from "fs";
import path from "path";
import {
  ROOT,
  FEATURE_FILE,
  INFRASTRUCTURE_FILE,
  IMPORT_RULES,
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
  // Kit inner-layers-reach-infrastructure (register B-80, with X42 to X45; audit 2026-10-20).
  describe("relative paths, public.ts and the last unread forms (ADR-0078)", () => {
    const DOMAIN_FILE =
      "src/features/public/metric-log/domain/entities/MetricLog.ts";
    // From either file, `../../../../../` is src/.
    const UP = "../../../../../";

    // X40: a relative path was allowed wherever it landed.
    const OUTSIDE_THE_LIST: Case[] = [
      { spec: `${UP}config/db.js`, rejected: true },
      { spec: `${UP}utils/redis-client.js`, rejected: true },
      { spec: `${UP}shared/middleware/error.js`, rejected: true },
      { spec: `${UP}lib/openapi/openapi-docs.js`, rejected: true },
      { spec: `${UP}../package.json`, rejected: true }, // leaves src
      // The feature's own composition root and surfaces.
      { spec: "../../feature.js", rejected: true },
      { spec: "../../index.js", rejected: true },
      { spec: "../../public.js", rejected: true },
      { spec: "../../contract.js", rejected: true },
      { spec: "../..", rejected: true },
      // Another feature's internals, and its public.ts, by relative path.
      { spec: "../../../metric/domain/entities/Metric.js", rejected: true },
      { spec: "../../../metric/public.js", rejected: true },
    ];
    const ON_THE_LIST: Case[] = [
      { spec: `${UP}shared/domain/errors/DomainError.js`, rejected: false },
      { spec: `${UP}types/domain/metric-log.domain.js`, rejected: false },
      { spec: `${UP}constants/zod/zod-messages.js`, rejected: false },
      { spec: "../../domain/entities/MetricLog.js", rejected: false },
      { spec: "../../../metric-category/contract.js", rejected: false },
    ];

    it("judges a domain file's relative path by where it lands", () => {
      expectCases(DOMAIN_FILE, [
        ...OUTSIDE_THE_LIST,
        ...ON_THE_LIST,
        { spec: "./MetricLogId.js", rejected: false },
        { spec: "../repositories/MetricLogRepository.js", rejected: false },
        { spec: "../../application/ports/MetricAccessPort.js", rejected: true },
        { spec: "../../infrastructure/http/dto.js", rejected: true },
        // The application's list is the application's, however it is spelled.
        { spec: `${UP}utils/logger.js`, rejected: true },
        { spec: `${UP}config/envManager.js`, rejected: true },
        {
          spec: `${UP}shared/application/ports/MessageQueuePort.js`,
          rejected: true,
        },
      ]);
    }, 60_000);

    it("judges an application file's relative path by where it lands", () => {
      expectCases(FEATURE_FILE, [
        ...OUTSIDE_THE_LIST,
        ...ON_THE_LIST,
        { spec: "../ports/MetricAccessPort.js", rejected: false },
        { spec: "./UpdateMetricLog.js", rejected: false },
        { spec: "../../infrastructure/http/dto.js", rejected: true },
        { spec: `${UP}utils/logger.js`, rejected: false },
        { spec: `${UP}config/envManager.js`, rejected: false },
        {
          spec: `${UP}shared/application/ports/MessageQueuePort.js`,
          rejected: false,
        },
      ]);
    }, 60_000);

    it("holds the shared kernel and src/types/domain to the same rule", () => {
      const KERNEL_OUT: Case[] = [
        { spec: "../../../config/db.js", rejected: true },
        { spec: "../../middleware/error.js", rejected: true },
        { spec: "../../../utils/redis-client.js", rejected: true },
        { spec: "../../../features/public/metric/public.js", rejected: true },
      ];
      expectCases("src/shared/domain/errors/DomainError.ts", [
        ...KERNEL_OUT,
        { spec: "./ValidationError.js", rejected: false },
        { spec: "../PersistenceTransaction.js", rejected: false },
        { spec: "../../application/ports/MessageQueuePort.js", rejected: true },
      ]);
      expectCases("src/shared/application/ports/MessageQueuePort.ts", [
        ...KERNEL_OUT,
        { spec: "./TransactionPort.js", rejected: false },
        { spec: "../../domain/errors/DomainError.js", rejected: false },
      ]);
      expectCases("src/types/domain/user.domain.ts", [
        { spec: "../../config/db.js", rejected: true },
        { spec: "../../shared/middleware/error.js", rejected: true },
        { spec: "./metric-log.domain.js", rejected: false },
        { spec: "../../shared/domain/errors/DomainError.js", rejected: false },
      ]);
    }, 60_000);

    it("reads export-from as well as import", () => {
      const source =
        `export { pool } from "${UP}config/db.js";\n` +
        `export * from "${UP}utils/redis-client.js";\n` +
        'export type { MetricLog } from "./MetricLog.js";\n';
      expect(
        [...reportedLines(DOMAIN_FILE, source, IMPORT_RULES)].sort(),
      ).toEqual([1, 2]);
    }, 60_000);

    // X41: every public.ts exports infrastructure.
    it("keeps another feature's public.ts out of the inner layers, and lets its contract.ts in", () => {
      for (const file of [DOMAIN_FILE, FEATURE_FILE]) {
        expectCases(file, [
          { spec: "@/features/auth/public.js", rejected: true },
          { spec: "@/features/shared/auth/public.js", rejected: true },
          { spec: "@/features/metric/public", rejected: true },
          { spec: "@/features/metric-category/contract.js", rejected: false },
          {
            spec: "@/features/public/metric-category/contract.js",
            rejected: false,
          },
          { spec: "@/features/metric-category/contract", rejected: false },
        ]);
      }
    }, 60_000);

    it("lets a contract.ts re-export its own domain and nothing else", () => {
      expectCases("src/features/public/metric-category/contract.ts", [
        { spec: "./domain/entities/MetricCategory.js", rejected: false },
        { spec: "@/shared/domain/errors/DomainError.js", rejected: false },
        {
          spec: "./infrastructure/mappers/MetricCategoryMapper.js",
          rejected: true,
        },
        {
          spec: "./application/ports/MetricCategoryRepository.js",
          rejected: true,
        },
        { spec: "./public.js", rejected: true },
        { spec: "./feature.js", rejected: true },
        { spec: "../metric/contract.js", rejected: false },
        { spec: "../metric/public.js", rejected: true },
        { spec: "@/features/metric/public.js", rejected: true },
        { spec: "zod", rejected: true },
      ]);
    }, 60_000);

    // X42: zod-rules.ts, in the allowlisted directory, imports zod.
    it("allows one file of src/constants, not the directory", () => {
      for (const file of [DOMAIN_FILE, FEATURE_FILE]) {
        expectCases(file, [
          { spec: "@/constants/zod/zod-messages.js", rejected: false },
          { spec: "@/constants/zod/zod-rules.js", rejected: true },
          { spec: `${UP}constants/zod/zod-rules.js`, rejected: true },
        ]);
      }
    }, 60_000);

    // X43: loader forms no import rule reads.
    it("rejects eval, a Function reached as a property, and module.require under src", () => {
      const source =
        'export const a = eval("1");\n' +
        'export const b = globalThis.Function("return 1");\n' +
        'export const c = new globalThis.Function("return 1");\n' +
        'export const d = setTimeout("1", 0);\n';
      for (const file of [
        DOMAIN_FILE,
        "src/server.ts",
        "src/utils/logger.ts",
      ]) {
        expect(
          [
            ...reportedLines(file, source, ["no-eval", "no-implied-eval"]),
          ].sort(),
        ).toEqual([1, 4]);
        expect(
          [...reportedLines(file, source, "no-restricted-syntax")].sort(),
        ).toEqual([2, 3]);
      }
      expect([
        ...reportedLines(
          "src/config/probe.cjs",
          'module.exports = module.require("./db.js");\n',
          "no-restricted-properties",
        ),
      ]).toEqual([1]);
      // Neither import rule reads a require; no-require-imports refuses it, `.cjs` included.
      // Only src/config's `.cjs` files are exempt.
      for (const file of [
        "src/features/public/metric-log/domain/entities/Probe.ts",
        "src/features/public/metric-log/domain/entities/Probe.cjs",
        "src/shared/domain/Probe.cjs",
      ]) {
        const source = file.endsWith(".ts")
          ? `import db = require("${UP}config/db.js");\nexport = db;\n`
          : `module.exports = require("${UP}config/db.js");\n`;
        expect([
          ...reportedLines(
            file,
            source,
            "@typescript-eslint/no-require-imports",
          ),
        ]).toEqual([1]);
      }
    }, 60_000);

    // X45 held the other two aliases to one spelling. Issue #259 (ADR-0092) removed
    // them: the build never rewrote them, so every spelling of either is refused.
    it("rejects every @utils and @config path, anywhere under src", () => {
      const ODD: Case[] = [
        {
          spec: "@utils/../features/public/metric/domain/x.js",
          rejected: true,
        },
        {
          spec: "@config/../features/metric/infrastructure/x.js",
          rejected: true,
        },
        { spec: "@utils/./logger.js", rejected: true },
        { spec: "@config//envManager.js", rejected: true },
      ];
      expectCases(INFRASTRUCTURE_FILE, ODD);
      expectCases("src/server.ts", [
        ...ODD,
        { spec: "@utils/logger.js", rejected: true },
        { spec: "@config/envManager.js", rejected: true },
        { spec: "@/utils/logger.js", rejected: false },
        { spec: "@/config/envManager.js", rejected: false },
      ]);
    }, 60_000);

    // Issue #259 (ADR-0092): with no mapping, an import through either alias fails
    // typecheck and Jest, as it always failed in dist/.
    it("maps neither @utils nor @config in tsconfig.json or Jest", () => {
      const read = (file: string) =>
        readFileSync(path.join(ROOT, file), "utf-8");

      // Both hold comments, so neither is plain JSON: each is read as text.
      expect(read("tsconfig.json")).not.toMatch(/"@(utils|config)\/\*"/);
      expect(read("jest.config.mjs")).not.toMatch(/\^@(utils|config)\//);
    });

    // X43's rest (architecture-boundaries D-06): an alias of `process` or `module` reaches
    // getBuiltinModule or require under a name no rule reads.
    it("rejects process or module used other than as x.y, anywhere under src", () => {
      const source =
        "const p = process;\n" +
        "const { getBuiltinModule } = process;\n" +
        "export const f = (g: (x: unknown) => void) => g(module);\n" +
        "export const e = process.env.NODE_ENV;\n" +
        "export const q = globalThis.process;\n" +
        "export const r = global.module;\n";
      for (const file of [
        DOMAIN_FILE,
        "src/server.ts",
        "src/utils/logger.ts",
      ]) {
        expect(
          [...reportedLines(file, source, "no-restricted-syntax")].sort(),
        ).toEqual([1, 2, 3]);
        // Line 2 twice: no-restricted-properties reads a destructured getBuiltinModule too.
        expect(
          [...reportedLines(file, source, "no-restricted-properties")].sort(),
        ).toEqual([2, 5, 6]);
      }
      expect([
        ...reportedLines(
          "src/config/probe.cjs",
          "const env = process.env;\nmodule.exports = { p: process };\n",
          "no-restricted-syntax",
        ),
      ]).toEqual([2]);
    }, 60_000);
  });
});
