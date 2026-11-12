import {
  FEATURE_FILE,
  INFRASTRUCTURE_FILE,
  MODEL_FILE,
  expectCases,
  type Case,
} from "../helpers/eslint-boundary-cases.js";

/**
 * ADR-0044 decision 6: every boundary rule must be seen to reject before it is trusted. The
 * cases live in four files so Jest's workers can run them side by side (#286, ADR-0094);
 * the helpers are in __tests__/helpers/eslint-boundary-cases.ts.
 */
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
    // From infrastructure: the inner layers take a contract.ts instead (ADR-0078).
    expectCases(INFRASTRUCTURE_FILE, [
      { spec: "@/features/metric/public.js", rejected: false },
      { spec: "@/features/public/metric/public.js", rejected: false },
    ]);
    expectCases(FEATURE_FILE, [
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
});
