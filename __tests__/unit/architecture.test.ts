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

  // ADR-0044 / decisions.md D-02, D-03: Sequelize models import each other across
  // features to declare foreign-key associations. They cannot route through index.ts
  // without risking circular imports between slices, and the real fix — no cross-module
  // FKs, ID-only references — is a separate initiative. Frozen at an exact count so the
  // boundary only ever moves deliberately. ESLint exempts these files; this is the ratchet.
  describe("cross-feature model associations are frozen", () => {
    const FROZEN_MODEL_ASSOCIATION_IMPORTS = 11;
    const MODEL_IMPORT =
      /from\s+"@\/features\/[a-z-]+\/infrastructure\/persistence\/models\//g;

    it(`holds at exactly ${FROZEN_MODEL_ASSOCIATION_IMPORTS} cross-feature model imports`, () => {
      const found: string[] = [];
      for (const featureDir of featureDirs) {
        for (const file of getAllTsFiles(featureDir)) {
          const owner = path.basename(featureDir);
          const content = fs.readFileSync(file, "utf-8");
          for (const match of content.match(MODEL_IMPORT) ?? []) {
            const target = match.match(/@\/features\/([a-z-]+)\//)![1];
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
});
