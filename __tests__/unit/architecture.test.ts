import fs from "fs";
import os from "os";
import path from "path";

const SRC_FEATURES = path.resolve(__dirname, "../../src/features");

function getFeatureDirs(): string[] {
  const dirs: string[] = [];
  const scopes = ["public", "shared"];

  for (const scope of scopes) {
    const scopeDir = path.join(SRC_FEATURES, scope);
    if (!fs.existsSync(scopeDir)) continue;
    const entries = fs.readdirSync(scopeDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        dirs.push(path.join(scopeDir, entry.name));
      }
    }
  }
  return dirs;
}

// Every extension eslint.config.mjs lints under src (its EXT), not `.ts` alone (X44).
const SOURCE_FILE = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

function getAllSourceFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...getAllSourceFiles(fullPath));
    } else if (SOURCE_FILE.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      results.push(fullPath);
    }
  }
  return results;
}

// The feature a path belongs to (`src/features/<audience>/<feature>`), or null outside features.
function owningFeature(file: string): string | null {
  const rel = path.relative(SRC_FEATURES, file).split(path.sep);
  if (rel[0] === ".." || rel.length < 3) return null;
  return path.join(SRC_FEATURES, rel[0], rel[1]);
}

const RELATIVE_SPECIFIER =
  /(?:from\s+|import\s*\(\s*|import\s+)"(\.{1,2}\/[^"]+)"/g;

// ADR-0044 / feature-boundary-audience-paths D-04: a relative import that lands in another
// feature must go through its public.ts, or its contract.ts (ADR-0078). ESLint's own rules
// cannot see this without knowing which feature the importing file is in; the local rule in
// eslint.config.mjs does so for the inner layers only.
function crossFeatureRelativeImports(file: string, content: string): string[] {
  const owner = owningFeature(file);
  if (!owner) return [];
  const offenders: string[] = [];
  for (const [, specifier] of content.matchAll(RELATIVE_SPECIFIER)) {
    const target = path.resolve(path.dirname(file), specifier);
    const targetFeature = owningFeature(target);
    if (!targetFeature || targetFeature === owner) continue;
    const intoPublic = /^(?:public|contract)(?:\.[jt]s)?$/.test(
      path.relative(targetFeature, target),
    );
    if (!intoPublic) offenders.push(specifier);
  }
  return offenders;
}

describe("Architecture enforcement", () => {
  const featureDirs = getFeatureDirs();

  describe("required subdirectories per feature", () => {
    const REQUIRED_SUBDIRS = ["application", "infrastructure"];
    // analytics has a domain/ dir with types/buckets — it qualifies
    const DOMAIN_REQUIRED = ["domain"];

    for (const featureDir of featureDirs) {
      const featureName = path.basename(featureDir);

      it(`${featureName} has application/ and infrastructure/`, () => {
        for (const sub of REQUIRED_SUBDIRS) {
          const subPath = path.join(featureDir, sub);
          expect(fs.existsSync(subPath)).toBe(true);
        }
      });

      it(`${featureName} has domain/`, () => {
        for (const sub of DOMAIN_REQUIRED) {
          const subPath = path.join(featureDir, sub);
          expect(fs.existsSync(subPath)).toBe(true);
        }
      });
    }
  });

  describe("no sequelize imports in application layer", () => {
    for (const featureDir of featureDirs) {
      const featureName = path.basename(featureDir);
      const appDir = path.join(featureDir, "application");
      const appFiles = getAllSourceFiles(appDir);

      for (const file of appFiles) {
        const relPath = path.relative(SRC_FEATURES, file);
        it(`${featureName}: ${path.basename(file)} does not import sequelize`, () => {
          const content = fs.readFileSync(file, "utf-8");
          const hasSequelizeImport = /from\s+['"]sequelize['"]/.test(content);
          expect(hasSequelizeImport).toBe(false);
        });
      }
    }
  });

  describe("all buildXFeature() accept overrides parameter", () => {
    for (const featureDir of featureDirs) {
      const featureName = path.basename(featureDir);
      const featureFile = path.join(featureDir, "feature.ts");

      if (!fs.existsSync(featureFile)) continue;

      it(`${featureName}/feature.ts buildXFeature accepts overrides`, () => {
        const content = fs.readFileSync(featureFile, "utf-8");
        const fnMatch = content.match(
          /export\s+const\s+build\w+Feature\s*=\s*\(([^)]*)\)/,
        );
        expect(fnMatch).not.toBeNull();
        const params = fnMatch![1].trim();
        // Must have at least one parameter (the overrides bag)
        expect(params.length).toBeGreaterThan(0);
        // The parameter should have a default value of {} (optional)
        expect(params).toContain("=");
      });
    }
  });

  // ADR-0035: cache keys are a tenant boundary and must be scoped by organization,
  // independently of the repository layer's WHERE clauses. A soft convention already
  // failed here once — the viz/vizdash keys were user-only through three audits — so
  // this rule gives it teeth at CI time.
  describe("cache keys are tenant-scoped", () => {
    const SRC_ROOT = path.resolve(__dirname, "../../src");
    const USER_REF = /\$\{[^}]*\b(?:userId|user\?\.id|user\.id)\b[^}]*\}/;
    const ORG_REF = /organizationId|\borg\b/;

    const isCacheKeyFile = (file: string, content: string): boolean =>
      file.includes(`${path.sep}cache${path.sep}`) ||
      content.includes("cacheMiddleware") ||
      content.includes("buildCursorCacheKey");

    const cacheFiles = getAllSourceFiles(SRC_ROOT).filter((file) =>
      isCacheKeyFile(file, fs.readFileSync(file, "utf-8")),
    );

    it("finds cache-key files to check", () => {
      expect(cacheFiles.length).toBeGreaterThan(0);
    });

    for (const file of cacheFiles) {
      const relPath = path.relative(SRC_ROOT, file);
      it(`${relPath} scopes every user-keyed cache template by organization`, () => {
        const content = fs
          .readFileSync(file, "utf-8")
          // strip comments — a commented-out key generator is not a live cache key
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/^\s*\/\/.*$/gm, "");
        const templates = content.match(/`[^`]*`/g) ?? [];

        const offenders = templates.filter(
          (tpl) =>
            tpl.includes(":") && USER_REF.test(tpl) && !ORG_REF.test(tpl),
        );

        expect(offenders).toEqual([]);
      });
    }
  });

  describe("relative imports stay inside their feature, or use its public.ts", () => {
    const from = path.join(
      SRC_FEATURES,
      "public/metric-log/application/use-cases/Example.ts",
    );

    it("flags a relative import into another feature's internals", () => {
      const content = [
        'import { A } from "../../../metric/application/ports/MetricAccessPort.js";',
        'import { B } from "../../../metric/public.js";',
        'import { C } from "../ports/MetricAccessPort.js";',
        'import { D } from "../../../../shared/auth/domain/entities/AuthUser.js";',
      ].join("\n");
      expect(crossFeatureRelativeImports(from, content)).toEqual([
        "../../../metric/application/ports/MetricAccessPort.js",
        "../../../../shared/auth/domain/entities/AuthUser.js",
      ]);
    });

    it("finds none in src/features", () => {
      const offenders: string[] = [];
      for (const featureDir of featureDirs) {
        for (const file of getAllSourceFiles(featureDir)) {
          for (const specifier of crossFeatureRelativeImports(
            file,
            fs.readFileSync(file, "utf-8"),
          )) {
            offenders.push(
              `${path.relative(SRC_FEATURES, file)} -> ${specifier}`,
            );
          }
        }
      }
      expect(offenders).toEqual([]);
    });
  });

  // ADR-0044 / decisions.md D-02, D-03: Sequelize models import each other across
  // features to declare foreign-key associations. Cross-module FKs are the deepest form
  // of coupling, and the real fix — ID-only references — is a separate initiative.
  // (The import-cycle reason once given here no longer applies: ADR-0045.) Frozen at an
  // exact count so the boundary only ever moves deliberately. ESLint exempts these files;
  // this is the ratchet.
  describe("cross-feature model associations are frozen", () => {
    const FROZEN_MODEL_ASSOCIATION_IMPORTS = 11;
    // Both spellings: the short alias (@/features/metric/...) and the full path
    // (@/features/public/metric/...). Matching only the first let the count undercount.
    const MODEL_IMPORT =
      /from\s+"@\/features\/(?:(?:public|shared)\/)?[a-z-]+\/infrastructure\/persistence\/models\//g;
    const MODEL_IMPORT_TARGET =
      /@\/features\/(?:(?:public|shared)\/)?([a-z-]+)\//;

    it("counts a model import in either spelling", () => {
      const sample = [
        'import { M } from "@/features/metric/infrastructure/persistence/models/metric.sequelize.js";',
        'import { M } from "@/features/public/metric/infrastructure/persistence/models/metric.sequelize.js";',
      ].join("\n");
      const targets = (sample.match(MODEL_IMPORT) ?? []).map(
        (m) => m.match(MODEL_IMPORT_TARGET)![1],
      );
      expect(targets).toEqual(["metric", "metric"]);
    });

    it(`holds at exactly ${FROZEN_MODEL_ASSOCIATION_IMPORTS} cross-feature model imports`, () => {
      const found: string[] = [];
      for (const featureDir of featureDirs) {
        for (const file of getAllSourceFiles(featureDir)) {
          const owner = path.basename(featureDir);
          const content = fs.readFileSync(file, "utf-8");
          for (const match of content.match(MODEL_IMPORT) ?? []) {
            const target = match.match(MODEL_IMPORT_TARGET)![1];
            // A feature reaching its own models through the alias is a separate
            // problem (it should be relative) and is not part of this freeze.
            if (target !== owner) {
              found.push(`${path.relative(SRC_FEATURES, file)} -> ${target}`);
            }
          }
        }
      }

      // Thrown rather than asserted so the guidance actually reaches whoever broke it —
      // Jest's expect() takes no message argument, and a bare "expected 11, got 12"
      // tells them nothing about what to do.
      if (found.length !== FROZEN_MODEL_ASSOCIATION_IMPORTS) {
        throw new Error(
          `Cross-feature model associations moved from ${FROZEN_MODEL_ASSOCIATION_IMPORTS} to ${found.length}.\n` +
            "This count is frozen on purpose — see docs/internal/initiatives/feature-boundaries/decisions.md D-02.\n" +
            "If the change is deliberate, update the constant in this file and record why in that log.\n" +
            `Found:\n  ${found.sort().join("\n  ")}`,
        );
      }
      expect(found.length).toBe(FROZEN_MODEL_ASSOCIATION_IMPORTS);
    });
  });

  // ADR-0045: importing a feature module must construct nothing. A router, feature or
  // middleware built at module scope runs during import, so a sibling that is still
  // mid-evaluation hands it `undefined` — "Route.post() requires a callback function"
  // or "MetricAccessSequelize is not a constructor". Construction belongs in server.ts
  // (routers) or behind a lazy getter (controllers, authMiddleware).
  describe("feature modules construct nothing on import", () => {
    const TOP_LEVEL_CONSTRUCTION =
      /^(?:export\s+)?(?:const|let|var)\s+\w+(?:\s*:[^=\n]+)?\s*=\s*(?:create\w*(?:Router|Middleware)|build\w*Feature|Router)\s*\(/gm;

    it("has no module-scope router, feature or middleware construction", () => {
      const offenders: string[] = [];
      for (const file of getAllSourceFiles(SRC_FEATURES)) {
        const content = fs.readFileSync(file, "utf-8");
        for (const match of content.match(TOP_LEVEL_CONSTRUCTION) ?? []) {
          offenders.push(
            `${path.relative(SRC_FEATURES, file)}: ${match.trim()}`,
          );
        }
      }

      if (offenders.length > 0) {
        throw new Error(
          "Feature modules must construct nothing at import time (ADR-0045).\n" +
            "Export a create*Router factory and call it in src/server.ts, or build the feature\n" +
            "behind a lazy getter (`feature ??= buildXFeature()`).\n" +
            `Found:\n  ${offenders.sort().join("\n  ")}`,
        );
      }
      expect(offenders).toEqual([]);
    });
  });

  // boundary-rule-residuals D-09 (audit R11): the alias was declared four times, and
  // the domain repositories took it from an application port.
  describe("the transaction type is declared once", () => {
    it("only src/shared/domain/PersistenceTransaction.ts declares it", () => {
      const src = path.resolve(__dirname, "../../src");
      const declaring = getAllSourceFiles(src)
        .filter((file) =>
          /\b(?:type|interface)\s+PersistenceTransaction\b/.test(
            fs.readFileSync(file, "utf-8"),
          ),
        )
        .map((file) => path.relative(src, file));

      expect(declaring).toEqual(["shared/domain/PersistenceTransaction.ts"]);
    });
  });

  describe("legacy mappers directory does not exist", () => {
    it("src/utils/mappers/ does not exist", () => {
      const mappersDir = path.resolve(__dirname, "../../src/utils/mappers");
      expect(fs.existsSync(mappersDir)).toBe(false);
    });
  });

  describe("admin feature directory does not exist", () => {
    it("src/features/admin/ does not exist", () => {
      const adminDir = path.join(SRC_FEATURES, "admin");
      expect(fs.existsSync(adminDir)).toBe(false);
    });
  });

  // ADR-0056 (audit R5): the worker once wired the metric-log handler by hand, with a
  // no-op where the HTTP server had the real analytics invalidator, so queued jobs left
  // charts stale. Entry points take the feature from src/composition/ instead.
  describe("entry points share one wiring", () => {
    const SRC = path.resolve(__dirname, "../../src");
    const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), "utf-8");

    const IMPORT_SPECIFIER = /(?:from\s+|import\s*\(\s*|import\s+)"([^"]+)"/g;
    const featureInternalImports = (content: string): string[] =>
      [...content.matchAll(IMPORT_SPECIFIER)]
        .map(([, specifier]) => specifier)
        .filter((specifier) =>
          /features\/.*\/(?:domain|application|infrastructure)\//.test(
            specifier,
          ),
        );

    const NOOP = "NoopVisualizationInvalidation";
    const NOOP_ALLOWED = [
      "shared/application/ports/VisualizationInvalidationPort.ts",
      "features/public/metric-log/feature.ts",
    ];
    const noopReferences = (files: Record<string, string>): string[] =>
      Object.entries(files)
        .filter(
          ([rel, content]) =>
            content.includes(NOOP) && !NOOP_ALLOWED.includes(rel),
        )
        .map(([rel]) => rel);

    it("flags an import into a feature's internals, in either spelling", () => {
      expect(
        featureInternalImports(
          [
            'import { A } from "@/features/metric-log/infrastructure/cache/A.js";',
            'import { B } from "./features/public/metric-log/application/B.js";',
            'import { C } from "./composition/metric-log.js";',
            'import { D } from "@/features/metric-log/index.js";',
          ].join("\n"),
        ),
      ).toEqual([
        "@/features/metric-log/infrastructure/cache/A.js",
        "./features/public/metric-log/application/B.js",
      ]);
    });

    it("src/worker.ts imports no feature internals", () => {
      expect(featureInternalImports(read("worker.ts"))).toEqual([]);
    });

    it("flags the no-op invalidator outside its two allowed files", () => {
      expect(
        noopReferences({
          "worker.ts": `new MetricLogCacheRedis(new ${NOOP}())`,
          "features/public/metric-log/feature.ts": `new ${NOOP}()`,
          "server.ts": "nothing here",
        }),
      ).toEqual(["worker.ts"]);
    });

    it("no file in src/ reaches for the no-op invalidator", () => {
      const files = Object.fromEntries(
        getAllSourceFiles(SRC).map((file) => [
          path.relative(SRC, file).split(path.sep).join("/"),
          fs.readFileSync(file, "utf-8"),
        ]),
      );
      expect(noopReferences(files)).toEqual([]);
    });

    // The server's features are built in composition/features.ts (ADR-0072).
    it.each(["composition/features.ts", "worker.ts"])(
      "%s takes the metric-log feature from the shared wiring",
      (entry) => {
        const content = read(entry);
        expect(content).toContain("buildWiredMetricLogFeature(");
        expect(content).not.toMatch(/\bbuildMetricLogFeature\(/);
      },
    );

    // The server queues the verification email and the worker sends it
    // (ADR-0067); one wiring keeps the two sides of the queue the same.
    it.each(["composition/features.ts", "worker.ts"])(
      "%s takes the auth feature from the shared wiring",
      (entry) => {
        const content = read(entry);
        expect(content).toContain("buildWiredAuthFeature(");
        expect(content).not.toMatch(/\bbuildAuthFeature\(/);
      },
    );

    it.each(["server.ts", "worker.ts"])(
      "%s neither imports the metric-log factory nor builds its cache",
      (entry) => {
        const content = read(entry);
        const specifiers = [...content.matchAll(IMPORT_SPECIFIER)].map(
          ([, specifier]) => specifier,
        );
        expect(
          specifiers.filter((s) => /metric-log\/feature(?:\.js)?$/.test(s)),
        ).toEqual([]);
        expect(content).not.toContain("MetricLogCacheRedis");
      },
    );

    // index.ts exports the router, which loads express and every rate limiter. The
    // worker imports src/composition/, so that must stay out of its import chain.
    const viaIndex = (content: string): string[] =>
      [...content.matchAll(IMPORT_SPECIFIER)]
        .map(([, specifier]) => specifier)
        .filter(
          (s) =>
            /features\//.test(s) && !/\/(?:feature|public)(?:\.js)?$/.test(s),
        );

    it("flags a composition import through a feature's index.ts or internals", () => {
      expect(
        viaIndex(
          [
            'import { A } from "@/features/analytics/index.js";',
            'import { B } from "@/features/analytics";',
            'import { C } from "@/features/analytics/infrastructure/cache/C.js";',
            'import { D } from "@/features/analytics/public.js";',
            'import { E } from "@/features/metric-log/feature.js";',
          ].join("\n"),
        ),
      ).toEqual([
        "@/features/analytics/index.js",
        "@/features/analytics",
        "@/features/analytics/infrastructure/cache/C.js",
      ]);
    });

    it("src/composition/ imports features through feature.ts or public.ts only", () => {
      const offenders = getAllSourceFiles(
        path.join(SRC, "composition"),
      ).flatMap((file) => viaIndex(fs.readFileSync(file, "utf-8")));
      expect(offenders).toEqual([]);
    });

    it("src/server.ts calls no test hook", () => {
      expect(read("server.ts")).not.toMatch(/ForTest\b/);
    });

    // ADR-0072 (register rows B-32, B-34): a feature is handed to its router. A
    // controller that kept a module-level slot, filled on first use and swapped by a
    // hook, let an entry point that skipped the hook run an unwired feature.
    describe("features are handed to their routers", () => {
      const httpFiles = () =>
        getAllSourceFiles(path.join(SRC, "features")).filter((file) =>
          file.includes(`${path.sep}infrastructure${path.sep}http${path.sep}`),
        );

      it("no file in src/ exports a test hook or an install hook", () => {
        const offenders = getAllSourceFiles(SRC).filter((file) =>
          /export\s+(const|function)\s+(\w+ForTest|install\w*Feature)\b/.test(
            fs.readFileSync(file, "utf-8"),
          ),
        );
        expect(offenders).toEqual([]);
      });

      it("no controller keeps a feature in a module-level slot", () => {
        const offenders = httpFiles().filter((file) =>
          /^let\s+\w*[fF]eature\b|[fF]eature\s*\?\?=/m.test(
            fs.readFileSync(file, "utf-8"),
          ),
        );
        expect(offenders).toEqual([]);
      });

      it("no controller builds a feature", () => {
        const offenders = httpFiles().filter((file) =>
          /\bbuild\w*Feature\(/.test(fs.readFileSync(file, "utf-8")),
        );
        expect(offenders).toEqual([]);
      });

      it("server.ts builds the features once and hands them to createApp", () => {
        const server = read("server.ts");
        expect(server).toMatch(
          /const features = buildWiredFeatures\(\{ messageQueue \}\);/,
        );
        expect(server).toContain("createApp(features)");
        expect(server.match(/buildWiredFeatures\(/g)).toHaveLength(1);
      });

      it("one auth feature serves the auth, organization, invite and membership routers", () => {
        const app = read("app.ts");
        for (const router of [
          "createAuthRouter",
          "createOrganizationRouter",
          "createInviteRouter",
          "createMembershipRouter",
        ]) {
          expect(app).toContain(`${router}(features.auth)`);
        }
      });
    });

    // ADR-0061: the order of the global middleware lives in mountHttpPipeline.
    describe("the global middleware is mounted in one place", () => {
      const PIPELINE = "shared/middleware/http-pipeline.ts";
      const sources = (): [string, string][] => {
        const out: [string, string][] = [];
        const walk = (dir: string) => {
          for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (/\.(ts|js|mjs|cjs)$/.test(entry.name)) {
              out.push([
                path.relative(SRC, full).split(path.sep).join("/"),
                fs.readFileSync(full, "utf-8"),
              ]);
            }
          }
        };
        walk(SRC);
        return out;
      };

      // createApp assembles the app, server.ts and every test app alike (ADR-0072).
      it("src/app.ts hands the real limiter to mountHttpPipeline and mounts nothing ahead of it", () => {
        const server = read("app.ts");
        const call = server.indexOf("mountHttpPipeline(app,");

        expect(call).toBeGreaterThan(-1);
        expect(server.slice(call)).toMatch(/limiter:\s*globalRateLimiter\b/);
        // No middleware or route is registered on the app before the pipeline.
        expect(server.slice(0, call)).not.toMatch(
          /\bapp\.(use|get|post|put|patch|delete|all|options|head)\(/,
        );
        // The limiter is mounted by the pipeline and nowhere else.
        expect(server.match(/globalRateLimiter/g)).toHaveLength(2);
      });

      // A parser mounted anywhere else, a feature router included, would read a
      // body outside the order: before the request is counted, or on a probe.
      it("only the pipeline imports a body or cookie parser", () => {
        const PARSER_PACKAGES =
          /from\s+["'](body-parser|cookie-parser|multer|busboy|formidable|express-fileupload|raw-body)["']/;
        const EXPRESS_PARSER =
          /\b(express|bodyParser)\s*\.\s*(json|urlencoded|raw|text)\s*\(|import\s*(?:express\s*,\s*)?\{[^}]*\b(json|urlencoded|raw|text)\b[^}]*\}\s*from\s*["']express["']/;

        const offenders = sources()
          .filter(([file]) => file !== PIPELINE)
          .filter(
            ([, text]) =>
              PARSER_PACKAGES.test(text) || EXPRESS_PARSER.test(text),
          )
          .map(([file]) => file);

        expect(offenders).toEqual([]);
        // The check reads real files: the pipeline itself is caught by both patterns.
        const pipeline = read(PIPELINE);
        expect(PARSER_PACKAGES.test(pipeline)).toBe(true);
        expect(EXPRESS_PARSER.test(pipeline)).toBe(true);
      });

      it("only the pipeline mounts the security middleware", () => {
        const offenders = sources()
          .filter(([file]) => file !== PIPELINE)
          .filter(([, text]) => /from\s+["'](helmet|hpp|cors)["']/.test(text))
          .map(([file]) => file);

        expect(offenders).toEqual([]);
      });
    });
  });

  // ADR-0057 (C3 residual 3): every limiter once carried its own handler and its own
  // `{status: 429, message}` body, and a ninth was added by copying the eighth. They
  // answer through one helper now, which calls sendError. These checks read source
  // text: an aliased import of the library or a renamed helper would get past them,
  // which is why the library may be imported in one file only.
  describe("rate limiters answer through the error envelope", () => {
    const SRC = path.resolve(__dirname, "../../src");
    const LIMITER_FILE = "shared/middleware/rate-limiter.ts";

    // One entry per `rateLimit(` call: the text from that call to the next one.
    const limiterCalls = (content: string): string[] =>
      content.split(/\brateLimit\(/).slice(1);
    const limitersWithoutSharedHandler = (content: string): number =>
      limiterCalls(content).filter(
        (call) =>
          !call.startsWith("{") ||
          !call.includes("...limitExceeded(") ||
          /\bhandler\s*:/.test(call) ||
          /\bmessage\s*:/.test(call),
      ).length;

    const NUMERIC_BODY_STATUS = /\bstatus:\s*[45]\d\d\b/;
    const numericStatusBodies = (files: Record<string, string>): string[] =>
      Object.entries(files)
        .filter(([, content]) => NUMERIC_BODY_STATUS.test(content))
        .map(([rel]) => rel);

    it("flags a limiter that does not answer through the shared helper", () => {
      const shared =
        'rateLimit({ max: 1, ...limitExceeded("Slow down.", () => "x") })';

      expect(limitersWithoutSharedHandler(shared)).toBe(0);
      expect(
        limitersWithoutSharedHandler(
          [
            shared,
            "rateLimit({ handler: (req, res) => res.status(429).json({}) })",
            'rateLimit({ message: "Slow down." })',
            "rateLimit(options)",
            'rateLimit({ ...limitExceeded("a", () => "x"), message: {} })',
            'rateLimit({ ...limitExceeded("a", () => "x"), handler: own })',
            shared,
          ].join("\n"),
        ),
      ).toBe(5);
    });

    it("every rateLimit() in src/ answers through limitExceeded", () => {
      const offenders = getAllSourceFiles(SRC)
        .map((file) => ({
          file: path.relative(SRC, file).split(path.sep).join("/"),
          missing: limitersWithoutSharedHandler(fs.readFileSync(file, "utf-8")),
        }))
        .filter(({ missing }) => missing !== 0);

      expect(offenders).toEqual([]);
      expect(
        limiterCalls(fs.readFileSync(path.join(SRC, LIMITER_FILE), "utf-8")),
      ).toHaveLength(9);
    });

    it("only rate-limiter.ts imports express-rate-limit", () => {
      const importers = getAllSourceFiles(SRC)
        .filter((file) =>
          /from\s+"express-rate-limit"/.test(fs.readFileSync(file, "utf-8")),
        )
        .map((file) => path.relative(SRC, file).split(path.sep).join("/"));

      expect(importers).toEqual([LIMITER_FILE]);
    });

    it("limitExceeded answers through sendError", () => {
      const content = fs.readFileSync(path.join(SRC, LIMITER_FILE), "utf-8");
      const helper = content.slice(
        content.indexOf("const limitExceeded ="),
        content.indexOf("const maybeCreateStore"),
      );

      expect(helper).toContain("sendError(res, options.statusCode, message)");
      expect(helper).not.toMatch(/\.json\(/);
    });

    // ADR-0063: a key read from the raw address lets an IPv6 client rotate
    // through its /64 for a fresh budget. Without a keyGenerator the library's
    // default is that raw address.
    const limitersKeyedOnRawIp = (content: string): number =>
      limiterCalls(content).filter((call) => {
        const start = call.search(/\bkeyGenerator\s*:/);
        if (start === -1) return true;
        const key = call.slice(start, call.indexOf("store:", start));
        return /\breq\.ip\b/.test(key.replaceAll("clientIpKey(req.ip)", ""));
      }).length;

    it("flags a limiter that keys on the raw address", () => {
      const keyed =
        "rateLimit({ keyGenerator: (req) => `x:${clientIpKey(req.ip)}`, store: s })";

      expect(limitersKeyedOnRawIp(keyed)).toBe(0);
      expect(
        limitersKeyedOnRawIp(
          [
            keyed,
            "rateLimit({ store: s, max: 1 })",
            'rateLimit({ keyGenerator: (req) => req.ip || "anonymous", store: s })',
            "rateLimit({ keyGenerator: (req) => `x:${req.ip}`, store: s })",
          ].join("\n"),
        ),
      ).toBe(3);
    });

    it("every limiter keys the address through clientIpKey", () => {
      const content = fs.readFileSync(path.join(SRC, LIMITER_FILE), "utf-8");

      expect(limitersKeyedOnRawIp(content)).toBe(0);
    });

    // log-redaction-coverage D-15 (ADR-0032): a store key names an email address
    // by its hash, as the lockout does; the address itself would sit in Redis for
    // the hour of the window.
    const limitersKeyedOnEmail = (content: string): number =>
      limiterCalls(content).filter((call) => {
        const start = call.search(/\bkeyGenerator\s*:/);
        if (start === -1) return false;
        const key = call.slice(start, call.indexOf("store:", start));
        return [...key.matchAll(/\$\{([^}]*)\}/g)].some(
          ([, expr]) => /email/i.test(expr) && !/^\s*hashEmail\(/.test(expr),
        );
      }).length;

    it("flags a limiter key that holds an email address", () => {
      const hashed =
        "rateLimit({ keyGenerator: (req) => `x:email:${hashEmail(email)}`, store: s })";

      expect(limitersKeyedOnEmail(hashed)).toBe(0);
      expect(
        limitersKeyedOnEmail(
          [
            hashed,
            "rateLimit({ keyGenerator: (req) => `x:email:${email}`, store: s })",
            "rateLimit({ keyGenerator: (req) => `x:${req.user.email}`, store: s })",
          ].join("\n"),
        ),
      ).toBe(2);
    });

    it("every limiter names an email address by its hash", () => {
      const content = fs.readFileSync(path.join(SRC, LIMITER_FILE), "utf-8");

      expect(limitersKeyedOnEmail(content)).toBe(0);
    });

    it("flags a numeric status written into a body", () => {
      expect(
        numericStatusBodies({
          "a.ts": 'message: { status: 429, message: "Slow down." }',
          "b.ts": 'res.status(429).json({ status: "fail" })',
          "c.ts": "{ status: 500 }",
        }),
      ).toEqual(["a.ts", "c.ts"]);
    });

    it("no file in src/ writes a numeric status into a body", () => {
      const files = Object.fromEntries(
        getAllSourceFiles(SRC).map((file) => [
          path.relative(SRC, file).split(path.sep).join("/"),
          fs.readFileSync(file, "utf-8"),
        ]),
      );
      expect(numericStatusBodies(files)).toEqual([]);
    });
  });

  // Kit register-rate-limiter, D-06 (audit R10). These limiters key on req.user,
  // which authMiddleware sets. Mounted ahead of it they found no user and counted
  // every request by IP. Reads source text, one entry per router call.
  describe("a limiter keyed by user runs after auth", () => {
    const USER_KEYED_LIMITER =
      /\b(?:userRateLimiter|switchOrgRateLimiter|analyticsRateLimiter)\b/;

    const routerCalls = (content: string): string[] =>
      content
        .split(/\brouter\.(?:get|post|put|patch|delete|all|use)\(/)
        .slice(1);
    const limitersAheadOfAuth = (content: string): string[] =>
      routerCalls(content).filter((call) => {
        const auth = call.search(/\bauthMiddleware\b/);
        const limiter = call.search(USER_KEYED_LIMITER);
        return auth !== -1 && limiter !== -1 && limiter < auth;
      });

    const routerFiles = (): string[] =>
      getAllSourceFiles(SRC_FEATURES).filter((file) =>
        /router\.ts$/.test(path.basename(file)),
      );

    it("flags a user-keyed limiter ahead of authMiddleware", () => {
      const sample = [
        'router.get("/a", userRateLimiter, authMiddleware, a);',
        'router.post("/b", authMiddleware, userRateLimiter, b);',
        'router.post("/c", switchOrgRateLimiter, authMiddleware, c);',
        'router.post("/d", userRateLimiter, d);',
        "router.use(authMiddleware);",
        'router.get("/e", analyticsRateLimiter, e);',
      ].join("\n");

      expect(limitersAheadOfAuth(sample)).toHaveLength(2);
    });

    it("finds none in src/features", () => {
      const files = routerFiles();
      const offenders = files
        .map((file) => ({
          file: path.relative(SRC_FEATURES, file).split(path.sep).join("/"),
          calls: limitersAheadOfAuth(fs.readFileSync(file, "utf-8")).length,
        }))
        .filter(({ calls }) => calls !== 0);

      expect(offenders).toEqual([]);
      expect(files.map((file) => path.basename(file))).toEqual(
        expect.arrayContaining(["organization.router.ts", "router.ts"]),
      );
    });
  });

  // inner-layers-reach-infrastructure D-03 (X44): the reader took `.ts` only, so a `.mts`, `.js`
  // or `.cjs` file under src escaped every check in this file.
  describe("the source-file reader", () => {
    it("reads every extension ESLint lints under src, and no declaration file", () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "arch-reader-"));
      try {
        const names = ["a.ts", "b.tsx", "c.mts", "d.cts", "e.js", "f.jsx"];
        names.push("g.mjs", "h.cjs", "i.d.ts", "j.json", "k.md");
        fs.mkdirSync(path.join(dir, "nested"));
        for (const name of names) {
          fs.writeFileSync(path.join(dir, "nested", name), "");
        }
        const read = getAllSourceFiles(dir).map((file) => path.basename(file));
        expect(read.sort()).toEqual(names.slice(0, 8).sort());
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  // queue-failure-paths (audit 2026-10-20 X65): the server's start failure and the worker's
  // queue-off check exited without flushing, and the line saying why could be lost.
  describe("an entry point flushes its logs before it exits", () => {
    const SRC = path.resolve(__dirname, "../../src");
    for (const entry of ["server.ts", "worker.ts"]) {
      it(`${entry} awaits flushLogs() before every process.exit`, () => {
        const lines = fs
          .readFileSync(path.join(SRC, entry), "utf-8")
          .split("\n");
        const unflushed = lines
          .map((line, i) => ({ line, i }))
          .filter(({ line }) => /\bprocess\.exit\(/.test(line))
          .filter(
            ({ i }) =>
              !lines
                .slice(Math.max(0, i - 3), i)
                .some((before) => /await flushLogs\(\)/.test(before)),
          )
          .map(({ line, i }) => `${entry}:${i + 1}: ${line.trim()}`);
        expect(unflushed).toEqual([]);
      });
    }
  });

  // log-and-ci-leaks D-01 (audit 2026-10-20 X3): the logger masks a database error's quoted
  // values only when it is handed the error. A message passed as a string skipped it.
  describe("an error reaches the logger as the object", () => {
    const SRC = path.resolve(__dirname, "../../src");
    // Across line breaks: Prettier wraps a long one over three lines.
    const STRING_MESSAGE =
      /\b\w+:\s*(\w+)\s+instanceof Error\s*\?\s*\1\.message\b/;

    it("passes no error's message as a string anywhere under src", () => {
      const offenders = getAllSourceFiles(SRC)
        .filter((file) => STRING_MESSAGE.test(fs.readFileSync(file, "utf-8")))
        .map((file) => path.relative(SRC, file));
      expect(offenders).toEqual([]);
    });

    it("recognises the idiom it refuses, wrapped or not", () => {
      expect(
        STRING_MESSAGE.test(
          "error: error instanceof Error ? error.message : String(error),",
        ),
      ).toBe(true);
      expect(
        STRING_MESSAGE.test(
          "publishError:\n  publishError instanceof Error\n    ? publishError.message",
        ),
      ).toBe(true);
      expect(STRING_MESSAGE.test("error,")).toBe(false);
    });
  });
});
