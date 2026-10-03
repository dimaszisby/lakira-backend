import fs from "fs";
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

function getAllTsFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...getAllTsFiles(fullPath));
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
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
// feature must go through its public.ts. ESLint cannot see this without knowing which feature
// the importing file is in.
function crossFeatureRelativeImports(file: string, content: string): string[] {
  const owner = owningFeature(file);
  if (!owner) return [];
  const offenders: string[] = [];
  for (const [, specifier] of content.matchAll(RELATIVE_SPECIFIER)) {
    const target = path.resolve(path.dirname(file), specifier);
    const targetFeature = owningFeature(target);
    if (!targetFeature || targetFeature === owner) continue;
    const intoPublic = /^public(?:\.[jt]s)?$/.test(
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
      const appFiles = getAllTsFiles(appDir);

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

    const cacheFiles = getAllTsFiles(SRC_ROOT).filter((file) =>
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
        for (const file of getAllTsFiles(featureDir)) {
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
        for (const file of getAllTsFiles(featureDir)) {
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
      for (const file of getAllTsFiles(SRC_FEATURES)) {
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
        getAllTsFiles(SRC).map((file) => [
          path.relative(SRC, file).split(path.sep).join("/"),
          fs.readFileSync(file, "utf-8"),
        ]),
      );
      expect(noopReferences(files)).toEqual([]);
    });

    it.each(["server.ts", "worker.ts"])(
      "%s takes the metric-log feature from the shared wiring",
      (entry) => {
        const content = read(entry);
        expect(content).toContain("buildWiredMetricLogFeature(");
        expect(content).not.toMatch(/\bbuildMetricLogFeature\(/);
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
      const offenders = getAllTsFiles(path.join(SRC, "composition")).flatMap(
        (file) => viaIndex(fs.readFileSync(file, "utf-8")),
      );
      expect(offenders).toEqual([]);
    });

    it("src/server.ts calls no test hook", () => {
      expect(read("server.ts")).not.toMatch(/ForTest\b/);
    });
  });
});
