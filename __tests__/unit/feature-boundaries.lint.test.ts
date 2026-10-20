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

/** The lines of `source` that `ruleId` reported, linted as if it were `filePath`. */
const reportedLines = (
  filePath: string,
  source: string,
  ruleId: string,
): Set<number> => {
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
    result.messages.filter((m) => m.ruleId === ruleId).map((m) => m.line),
  );
};

/** Returns, for each case, whether no-restricted-imports reported its line. */
const lint = (filePath: string, cases: Case[]): boolean[] => {
  const source = cases.map((c) => `import "${c.spec}";`).join("\n") + "\n";
  const reported = reportedLines(filePath, source, "no-restricted-imports");
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

  // ADR-0058. Until 2026-10-04 the application layer could import anything but the
  // models barrel, and nothing outside src/features was checked at all
  // (SaaS-readiness caveat C4, audit-2026-10-03 S5 and S6).
  describe("inner layers import no infrastructure (ADR-0058)", () => {
    const DOMAIN_FILE =
      "src/features/public/metric-log/domain/entities/MetricLog.ts";
    const INFRASTRUCTURE_FILE =
      "src/features/public/metric-log/infrastructure/http/controller.ts";
    const SHARED_APPLICATION_FILE =
      "src/shared/application/ports/MessageQueuePort.ts";

    const INFRASTRUCTURE_IMPORTS: Case[] = [
      { spec: "../../infrastructure/http/dto.js", rejected: true },
      { spec: "@/shared/infrastructure/queue/topology.js", rejected: true },
      { spec: "@/infrastructure/db/sequelize.js", rejected: true },
      { spec: "amqplib", rejected: true },
      { spec: "express", rejected: true },
      { spec: "sequelize", rejected: true },
      { spec: "redis", rejected: true },
      // A subpath or a scoped sibling of a driver is the same driver.
      { spec: "sequelize/types", rejected: true },
      { spec: "@redis/client", rejected: true },
      { spec: "amqp-connection-manager", rejected: true },
      { spec: "express-rate-limit", rejected: true },
      { spec: "pg", rejected: true },
      { spec: "jsonwebtoken", rejected: true },
    ];

    it("rejects infrastructure and driver packages from an application file", () => {
      expectCases(FEATURE_FILE, INFRASTRUCTURE_IMPORTS);
    }, 60_000);

    it("rejects them from a domain file", () => {
      expectCases(DOMAIN_FILE, INFRASTRUCTURE_IMPORTS);
    }, 60_000);

    it("rejects them in the shared audience too (auth)", () => {
      expectCases(
        "src/features/shared/auth/application/use-cases/AcceptInvite.ts",
        INFRASTRUCTURE_IMPORTS,
      );
    }, 60_000);

    it("rejects them from the shared kernel's application layer", () => {
      expectCases(SHARED_APPLICATION_FILE, [
        { spec: "@/shared/infrastructure/queue/topology.js", rejected: true },
        { spec: "../../infrastructure/queue/topology.js", rejected: true },
        { spec: "amqplib", rejected: true },
      ]);
    }, 60_000);

    it("still allows ports, the domain and shared application code", () => {
      expectCases(FEATURE_FILE, [
        { spec: "../ports/MetricAccessPort.js", rejected: false },
        { spec: "../../domain/entities/MetricLog.js", rejected: false },
        {
          spec: "@/shared/application/ports/MessageHandlerPort.js",
          rejected: false,
        },
        {
          spec: "@/shared/application/messaging/job-routes.js",
          rejected: false,
        },
        { spec: "@/utils/logger.js", rejected: false },
        { spec: "node:crypto", rejected: false },
        { spec: "crypto", rejected: false },
      ]);
    }, 60_000);

    it("leaves the infrastructure layer free to import them", () => {
      expectCases(
        INFRASTRUCTURE_FILE,
        INFRASTRUCTURE_IMPORTS.filter(
          // The global alias into this feature's own internals is the older rule's
          // business, not this one's.
          (c) => !c.spec.startsWith("@/features"),
        ).map((c) => ({ ...c, rejected: false })),
      );
    }, 60_000);
  });

  // ADR-0058, added 2026-10-13. Five domain repository interfaces imported the
  // transaction type from an application port and nothing refused it (audit R11).
  describe("the domain layer imports no application code (ADR-0058)", () => {
    const DOMAIN_FILE =
      "src/features/public/metric-log/domain/repositories/MetricLogRepository.ts";
    const SHARED_DOMAIN_FILE = "src/shared/domain/errors/DomainError.ts";

    const APPLICATION_IMPORTS: Case[] = [
      { spec: "../../application/ports/TransactionPort.js", rejected: true },
      { spec: "../../application/ports/TransactionPort", rejected: true },
      { spec: "../application/use-cases/CreateMetricLog.js", rejected: true },
      {
        spec: "@/shared/application/ports/MessageIdempotencyPort.js",
        rejected: true,
      },
      {
        spec: "@/features/public/metric/application/ports/TransactionPort.js",
        rejected: true,
      },
      { spec: "@/features/metric/application", rejected: true },
    ];

    it("rejects every spelling from a feature's domain file", () => {
      expectCases(DOMAIN_FILE, APPLICATION_IMPORTS);
    }, 60_000);

    it("rejects every spelling from the shared kernel's domain", () => {
      expectCases(SHARED_DOMAIN_FILE, [
        { spec: "../../application/ports/CachePort.js", rejected: true },
        {
          spec: "@/shared/application/ports/MessageIdempotencyPort.js",
          rejected: true,
        },
      ]);
    }, 60_000);

    it("still allows the domain, the shared domain, and a name that only contains the word", () => {
      expectCases(DOMAIN_FILE, [
        { spec: "../entities/MetricLog.js", rejected: false },
        { spec: "@/shared/domain/PersistenceTransaction.js", rejected: false },
        { spec: "@/shared/domain/errors/DomainError.js", rejected: false },
        { spec: "../value-objects/application-window.js", rejected: false },
      ]);
    }, 60_000);

    it("leaves the application and infrastructure layers free to import application code", () => {
      const allowed: Case[] = [
        { spec: "../../application/ports/TransactionPort.js", rejected: false },
        {
          spec: "@/shared/application/ports/MessageIdempotencyPort.js",
          rejected: false,
        },
      ];
      expectCases(FEATURE_FILE, allowed);
      expectCases(
        "src/features/public/metric-log/infrastructure/persistence/repositories/MetricLogRepoSequelize.ts",
        allowed,
      );
    }, 60_000);
  });

  describe("shared code imports no feature (ADR-0058)", () => {
    const FEATURE_IMPORTS: Case[] = [
      { spec: "@/features/metric/public.js", rejected: true },
      { spec: "@/features/public/metric/public.js", rejected: true },
      { spec: "@/features/metric/domain/entities/Metric.js", rejected: true },
      {
        spec: "@/features/public/metric-category/infrastructure/http/dto.js",
        rejected: true,
      },
      { spec: "../features/public/metric/public.js", rejected: true },
      { spec: "@/features/metric", rejected: true },
    ];

    it.each([
      "src/types/request.context.ts",
      "src/shared/utils/error-envelope.ts",
      // The shared kernel's layers get later, stricter blocks; they must keep this rule.
      "src/shared/application/ports/MessageQueuePort.ts",
      "src/shared/domain/errors/DomainError.ts",
      "src/utils/logger.ts",
      "src/config/app-name.ts",
    ])(
      "rejects every spelling of a feature import from %s",
      (file) => {
        expectCases(file, [
          ...FEATURE_IMPORTS,
          // The request context is HTTP; the shared kernel's inner layers import only
          // from their list (boundary-rules-everywhere D-02).
          {
            spec: "@/types/request.context.js",
            rejected:
              file.startsWith("src/shared/domain/") ||
              file.startsWith("src/shared/application/"),
          },
          // AppError is the inner layers' business, in the describe below.
          {
            spec: "@/utils/AppError.js",
            rejected:
              file.startsWith("src/shared/domain/") ||
              file.startsWith("src/shared/application/"),
          },
        ]);
      },
      60_000,
    );

    // The three named exceptions (eslint.config.mjs, ADR-0058 decision 3).
    it("lets db-helper.ts import model types, and nothing else of a feature", () => {
      expectCases("src/utils/db-helper.ts", [
        {
          spec: "@/features/metric/infrastructure/persistence/models/metric.sequelize.js",
          rejected: false,
        },
        {
          spec: "@/features/public/metric/infrastructure/persistence/models/metric.sequelize.js",
          rejected: false,
        },
        { spec: "@/features/metric/public.js", rejected: true },
        { spec: "@/features/metric/domain/entities/Metric.js", rejected: true },
      ]);
    }, 60_000);

    // boundary-rules-everywhere D-04: each place outside src/features enters a feature by
    // one door, which once was no rule at all for the ORM registry and the OpenAPI assembly.
    it("lets the ORM registry import model files, and the OpenAPI assembly schemas, and nothing else", () => {
      const MODEL =
        "@/features/metric/infrastructure/persistence/models/metric.sequelize.js";
      const SCHEMA = "@/features/metric/infrastructure/http/schema.zod.js";
      expectCases("src/infrastructure/db/models.ts", [
        { spec: MODEL, rejected: false },
        { spec: SCHEMA, rejected: true },
        { spec: "@/features/metric/public.js", rejected: true },
      ]);
      expectCases("src/lib/openapi/openapi-schemas.ts", [
        { spec: SCHEMA, rejected: false },
        { spec: MODEL, rejected: true },
        {
          spec: "@/features/metric-category/infrastructure/http/dto.js",
          rejected: true,
        },
      ]);
    }, 60_000);
  });

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
        expectCases(file, spellings(false));
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
        { spec: "@/features/metric-category/public.js", rejected: false },
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
      "src/tests/env-test-utils.ts",
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
