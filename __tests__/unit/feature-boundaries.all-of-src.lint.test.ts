import {
  FEATURE_FILE,
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
  // Kit boundary-rules-everywhere (register rows B-28 and B-29; audit 2026-10-12, W6).
  describe("the rules cover all of src, by allowlist where a layer is inner", () => {
    const DOMAIN_FILE =
      "src/features/public/metric-log/domain/entities/MetricLog.ts";

    // D-02: a name match and a package denylist let these through to a domain file.
    const NOT_FOR_ANY_INNER_LAYER: Case[] = [
      { spec: "@/shared/middleware/error.js", rejected: true },
      { spec: "zod", rejected: true },
      { spec: "winston", rejected: true },
      { spec: "@sentry/node", rejected: true },
      { spec: "@/lib/openapi/openapi-docs.js", rejected: true },
      { spec: "@/utils/redis-client.js", rejected: true },
      { spec: "@/config/db.js", rejected: true },
    ];
    const FOR_EVERY_INNER_LAYER: Case[] = [
      { spec: "node:crypto", rejected: false },
      { spec: "crypto", rejected: false },
      { spec: "@/shared/domain/errors/DomainError.js", rejected: false },
      { spec: "@/shared/constants/metric-constraints.js", rejected: false },
      { spec: "@/shared/utils/text-validation.js", rejected: false },
      { spec: "@/types/domain/metric-log.domain.js", rejected: false },
      { spec: "@/constants/zod/zod-messages.js", rejected: false },
    ];

    it("lets a domain file import only from the domain's list", () => {
      expectCases(DOMAIN_FILE, [
        ...NOT_FOR_ANY_INNER_LAYER,
        ...FOR_EVERY_INNER_LAYER,
        { spec: "../repositories/MetricLogRepository.js", rejected: false },
        // inner-layers-reach-infrastructure D-02: a contract, never a public.ts.
        { spec: "@/features/metric-category/contract.js", rejected: false },
        { spec: "@/features/metric-category/public.js", rejected: true },
        // The application list is the application's.
        { spec: "@/utils/logger.js", rejected: true },
        { spec: "@/config/envManager.js", rejected: true },
      ]);
    }, 60_000);

    it("lets an application file import only from the application's list", () => {
      expectCases(FEATURE_FILE, [
        ...NOT_FOR_ANY_INNER_LAYER,
        ...FOR_EVERY_INNER_LAYER,
        { spec: "@/utils/logger.js", rejected: false },
        { spec: "@/utils/date-io.js", rejected: false },
        { spec: "@/config/envManager.js", rejected: false },
        { spec: "@/config/app-name.js", rejected: false },
        { spec: "@/shared/cache/keys.js", rejected: false },
        {
          spec: "@/shared/application/ports/MessageQueuePort.js",
          rejected: false,
        },
      ]);
    }, 60_000);

    it.each([
      "src/shared/domain/errors/DomainError.ts",
      "src/shared/application/ports/MessageQueuePort.ts",
      // D-02: imported by feature domains, so held to the domain's rules (todo item 2).
      "src/types/domain/user.domain.ts",
    ])(
      "holds %s to the inner layers' list",
      (file) => {
        expectCases(file, [
          ...NOT_FOR_ANY_INNER_LAYER,
          {
            spec: "@/shared/domain/PersistenceTransaction.js",
            rejected: false,
          },
        ]);
      },
      60_000,
    );

    // D-01: the blocks matched *.ts only.
    it.each([
      "src/features/public/metric-log/domain/entities/Probe.js",
      "src/features/public/metric-log/domain/entities/Probe.tsx",
      "src/features/public/metric-log/domain/entities/Probe.mjs",
      // inner-layers-reach-infrastructure D-03 (X44): these were not linted at all.
      "src/features/public/metric-log/domain/entities/Probe.mts",
      "src/features/public/metric-log/domain/entities/Probe.cts",
      "src/features/public/metric-log/domain/entities/Probe.jsx",
    ])(
      "holds %s to the domain's rules",
      (file) => {
        expectCases(file, [
          { spec: "zod", rejected: true },
          {
            spec: "@/features/metric/domain/entities/Metric.js",
            rejected: true,
          },
          { spec: "@/shared/domain/errors/DomainError.js", rejected: false },
        ]);
      },
      60_000,
    );

    // D-03: spellings the feature pattern did not parse reached another feature.
    it("rejects an aliased path that is not canonical, anywhere under src", () => {
      const ODD: Case[] = [
        { spec: "@/features/metric/../metric-log/domain/x.js", rejected: true },
        { spec: "@/features/./metric/domain/x.js", rejected: true },
        { spec: "@/features//metric/domain/x.js", rejected: true },
        { spec: "@/features/public//metric/domain/x.js", rejected: true },
        { spec: "src/features/public/metric/domain/x.js", rejected: true },
        { spec: "@/shared/./utils/error-envelope.js", rejected: true },
      ];
      expectCases(FEATURE_FILE, [
        ...ODD,
        { spec: "@/features/metric_x/domain/x.js", rejected: true },
        { spec: "@/features/metric2/domain/x.js", rejected: true },
      ]);
      expectCases("src/utils/logger.ts", [
        ...ODD,
        { spec: "@/shared/utils/error-envelope.js", rejected: false },
      ]);
    }, 60_000);

    // D-04 (B-29): outside src/features, one door per purpose.
    it("lets app.ts enter a feature through its index only", () => {
      expectCases("src/app.ts", [
        { spec: "./features/shared/auth/index.js", rejected: false },
        { spec: "./features/public/metric/index.js", rejected: false },
        {
          spec: "./features/shared/auth/infrastructure/http/authMiddleware.js",
          rejected: true,
        },
        { spec: "./features/public/metric/feature.js", rejected: true },
        { spec: "./features/public/metric/public.js", rejected: true },
      ]);
    }, 60_000);

    it("lets src/composition enter a feature through feature.ts and public.ts only", () => {
      expectCases("src/composition/features.ts", [
        { spec: "@/features/metric/feature.js", rejected: false },
        { spec: "@/features/analytics/public.js", rejected: false },
        { spec: "@/features/metric/index.js", rejected: true },
        { spec: "@/features/metric", rejected: true },
        { spec: "@/features/metric/domain/entities/Metric.js", rejected: true },
        {
          spec: "@/features/metric/infrastructure/http/router.js",
          rejected: true,
        },
      ]);
    }, 60_000);

    it.each([
      "src/server.ts",
      "src/worker.ts",
      "src/constants/zod/zod-messages.ts",
    ])(
      "keeps %s out of every feature",
      (file) => {
        expectCases(file, [
          { spec: "@/features/metric/public.js", rejected: true },
          { spec: "@/features/metric/feature.js", rejected: true },
          { spec: "./features/public/metric/index.js", rejected: true },
          { spec: "@/composition/features.js", rejected: false },
        ]);
      },
      60_000,
    );

    // D-05: the exemptions name their files and their paths.
    it("lets only the six files that need it import another feature's models", () => {
      const FOREIGN_MODEL =
        "@/features/metric/infrastructure/persistence/models/metric.sequelize.js";
      expectCases(
        "src/features/shared/auth/infrastructure/persistence/models/user.sequelize.ts",
        [{ spec: FOREIGN_MODEL, rejected: true }],
      );
      expectCases(
        "src/features/public/metric-settings/infrastructure/persistence/mappers/MetricReadMapper.ts",
        [{ spec: FOREIGN_MODEL, rejected: true }],
      );
      expectCases(
        "src/features/public/metric/infrastructure/persistence/mappers/MetricReadMapper.ts",
        [
          {
            spec: FOREIGN_MODEL.replace("/metric/", "/metric-log/"),
            rejected: false,
          },
        ],
      );
    }, 60_000);

    it("lets db-helper.ts and the ORM registry name a model file, and nothing beneath or around it", () => {
      for (const file of [
        "src/utils/db-helper.ts",
        "src/infrastructure/db/types.ts",
      ]) {
        expectCases(file, [
          {
            spec: "@/features/metric/infrastructure/persistence/models/metric.sequelize.js",
            rejected: false,
          },
          {
            spec: "@/features/metric/infrastructure/persistence/models/nested/x.js",
            rejected: true,
          },
          {
            spec: "@/features/metric/domain/x/infrastructure/persistence/models/m.js",
            rejected: true,
          },
        ]);
      }
    }, 60_000);

    // D-06: two ways to load a module that no import rule reads.
    it("rejects process.getBuiltinModule and the Function constructor under src", () => {
      const source =
        'export const a = process.getBuiltinModule("module");\n' +
        'export const b = new Function("return 1");\n' +
        'export const c = Function("return 1");\n';
      for (const file of [
        FEATURE_FILE,
        "src/server.ts",
        "src/utils/logger.ts",
      ]) {
        expect([
          ...reportedLines(file, source, "no-restricted-properties"),
        ]).toEqual([1]);
        expect(
          [...reportedLines(file, source, "no-restricted-syntax")].sort(),
        ).toEqual([2, 3]);
      }
    }, 60_000);
  });
});
