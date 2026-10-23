// eslint.config.mjs
import globals from "globals";
import pluginJs from "@eslint/js";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import js from "@eslint/js";

import prettierConfigPackage from "eslint-config-prettier";
import prettierPlugin from "eslint-plugin-prettier";
import node from "eslint-plugin-n";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Destructure and remove the "extends" property from each imported config
const { extends: omit1, ...jsConfig } = js.configs.recommended;
const { extends: omit2, ...tsConfig } = tsPlugin.configs.recommended;
const { extends: omit3, ...prettierConfig } = prettierConfigPackage;

// Legacy layout bans. Extracted so the feature-boundary blocks below can re-declare
// `no-restricted-imports` without silently dropping them — a flat-config block that
// re-specifies a rule replaces it wholesale for the files it matches.
const LEGACY_IMPORT_PATTERNS = [
  {
    group: [
      "src/services/**",
      "services/**",
      "@services/**",
      "../services/**",
      "../../services/**",
      "../../../services/**",
      "../../../../services/**",
    ],
    message:
      "Legacy services have been replaced by feature slices. Add code to the owning feature (domain/application/infrastructure) instead of importing from src/services.",
  },
  {
    group: [
      "src/routes/**",
      "routes/**",
      "@routes/**",
      "../routes/**",
      "../../routes/**",
      "../../../routes/**",
      "../../../../routes/**",
    ],
    message:
      "Feature slices now own their HTTP routers. Import routers from the appropriate feature entrypoint instead of src/routes.",
  },
  {
    group: [
      "src/controllers/**",
      "controllers/**",
      "@controllers/**",
      "../controllers/**",
      "../../controllers/**",
      "../../../controllers/**",
      "../../../../controllers/**",
    ],
    message:
      "Legacy controllers have been replaced by feature adapters. Import handlers from the owning feature instead of src/controllers.",
  },
];

const FEATURE_BOUNDARY_MESSAGE =
  "Feature internals are private. Import another feature through its public.ts (`@/features/<name>/public.js`), and reach your own feature with a relative path. See .claude/rules/architecture.md § Export Convention.";

// Every feature is reachable by two spellings: the short alias from tsconfig.json
// (`@/features/metric/...`) and the full path through `@/*` (`@/features/public/metric/...`).
// Each pattern below takes an optional audience segment so both are checked. Globs assumed one
// segment after `features/`, which checked the short spelling only; the full one was never
// rejected (SaaS-readiness caveat C4, audit-2026-09-29). A new audience directory must be added
// here; __tests__/unit/feature-boundaries.lint.test.ts proves each rule in both spellings.
// The name is any segment (boundary-rules-everywhere D-03): `[a-z-]+` left a name with a
// digit or an underscore unparsed, so the deep-import rules never saw it.
const FEATURE = "^@/features/(?:(?:public|shared)/)?[^/]+";

// Every file under src, whatever its extension (boundary-rules-everywhere D-01). The
// blocks matched *.ts only, so a .js or .tsx file in a domain folder got the legacy
// patterns alone (audit-2026-10-12 W6). Migrations are ignored above.
// `mts`, `cts` and `jsx` were added by inner-layers-reach-infrastructure D-03 (X44): the first two
// were not linted at all, and a `.jsx` file got no boundary rule.
const EXT = "{ts,tsx,mts,cts,js,jsx,mjs,cjs}";

// ADR-0045: a sibling may not import another feature's composition root — its index.ts
// (the bare alias or /index.js) or its feature.ts. index.ts exists for src/server.ts;
// public.ts is the cross-feature surface.
const SIBLING_COMPOSITION_ROOT = {
  regex: `${FEATURE}(?:/(?:index|feature)(?:\\.js)?)?$`,
  message:
    "Import another feature through its public.ts, not its index.ts or feature.ts — those are the composition root, for src/server.ts only (ADR-0045).",
};

// Reaching into any feature's domain/application/infrastructure through the global
// alias. Catches both cross-feature imports and a feature importing itself via the
// alias instead of a relative path.
const FEATURE_DEEP_IMPORTS = {
  regex: `${FEATURE}/(?:domain|application|infrastructure)(?:/|$)`,
  message: FEATURE_BOUNDARY_MESSAGE,
};

// Same, minus Sequelize model files. Applied only to the six files that import another
// feature's models (MODEL_ASSOCIATION_FILES below). Those are frozen as a recorded debt — cross-module foreign
// keys are the deepest coupling, ID-only references the destination (ADR-0044
// decision 4). The count is frozen at 11 by __tests__/unit/architecture.test.ts — see
// docs/internal/initiatives/feature-boundaries/decisions.md D-02 and D-03.
// A lookahead excludes `infrastructure/persistence/models/` and nothing else. The glob
// version enumerated the allowed subpaths instead, because a `!…/models/**` negation had no
// effect on matching; that list missed auth's flat `infrastructure/persistence/*Repository*`
// files. The lint test proves this pattern rejects them.
const FEATURE_DEEP_IMPORTS_EXCEPT_MODELS = {
  regex: `${FEATURE}/(?:domain|application|infrastructure(?!/persistence/models/))(?:/|$)`,
  message: FEATURE_BOUNDARY_MESSAGE,
};

// An HTTP status code has no business in a domain entity or a use case. Both raise
// a DomainError kind; src/shared/middleware/error.ts maps it. The domain half was
// the third of SaaS-readiness caveat C4's three claims; the application half is
// audit R7 (application-errors D-02).
// A regex on the file name, not a list of spellings: the list had three, and the
// `@utils/` alias and an extensionless relative path got past it (audit-2026-10-10 V4).
// Any import whose last segment is `AppError` or `AppError.js` is refused;
// __tests__/unit/feature-boundaries.lint.test.ts proves each spelling in all four
// inner layers.
const INNER_LAYER_HTTP_ERROR = {
  regex: "(?:^|/)AppError(?:\\.js)?$",
  message:
    "AppError carries an HTTP statusCode, which the domain and application layers must not know. Throw a DomainError subclass (ValidationError, UnauthorizedError, ForbiddenError, NotFoundError, ConflictError) from @/shared/domain/errors/DomainError.js and let the error middleware map it. See .claude/rules/architecture.md § Dependency Rules.",
};

// The application layer depends on domain and ports only. The models barrel is
// infrastructure, and importing it is an ORM write from the wrong layer.
const APPLICATION_LAYER_ORM = {
  group: ["@/infrastructure/db/models", "@/infrastructure/db/models.js"],
  message:
    "The application layer must not reach the ORM directly. Inject a repository port instead. See .claude/rules/architecture.md § Dependency Rules.",
};

// ADR-0058: the inner layers import no infrastructure. The models-barrel rule above was
// the only application-layer rule until 2026-10-04, so HTTP DTO types, the queue topology
// and amqplib's message type were all imported by use cases and passed green
// (SaaS-readiness caveat C4, audit-2026-10-03 S6). The regex takes any specifier with an
// `infrastructure` path segment, so the relative spelling (`../../infrastructure/...`) and
// both aliased ones (`@/infrastructure/...`, `@/shared/infrastructure/...`) are covered.
const INNER_LAYER_INFRASTRUCTURE = {
  regex: "(?:^|/)infrastructure(?:/|$)",
  message:
    "The domain and application layers must not import infrastructure. Declare a port or an input type in application/ and let infrastructure satisfy it. See .claude/rules/architecture.md § Dependency Rules (ADR-0058).",
};

// ADR-0058, added 2026-10-13: the domain imports no application code either. Five
// repository interfaces took the transaction type from an application port, and
// nothing refused it (audit R11). Built like the rule above: any specifier with an
// `application` path segment, so the relative spelling and both aliased ones are
// covered. A type both layers need is declared in the domain, the feature's or
// src/shared/domain.
const DOMAIN_LAYER_APPLICATION = {
  regex: "(?:^|/)application(?:/|$)",
  message:
    "The domain layer must not import the application layer. Declare the type in the domain (the feature's, or src/shared/domain) and let the application import it. See .claude/rules/architecture.md § Dependency Rules (ADR-0058).",
};

// ADR-0074 (boundary-rules-everywhere D-02): the inner layers import from a list, not
// around one. The rules were a package denylist and a name match, so zod, winston,
// @/shared/middleware/error.js and @/utils/logger.js all passed in a domain file
// (audit-2026-10-12 W6). Anything not listed is refused, every third-party package
// included. The list is what the layers imported when it was drawn; a new entry needs a
// reason in this comment. A relative path is judged by where it lands, against the same
// list, by the local rule below (ADR-0078).
const DOMAIN_IMPORTS = [
  "node:crypto$",
  "crypto$",
  "@/shared/domain/",
  "@/shared/constants/",
  "@/shared/utils/text-validation\\.js$", // pure string checks
  "@/types/domain/", // held to these rules too
  // One file, not the directory: zod-rules.ts beside it imports zod (ADR-0078, X42).
  "@/constants/zod/zod-messages\\.js$",
  // Another feature's contract.ts, which re-exports its domain. Never its public.ts: every
  // public.ts exports infrastructure (ADR-0078, X41).
  `${FEATURE.slice(1)}/contract(?:\\.js)?$`,
];
// The application adds its own kernel, and four modules it reads for logging, time,
// cache keys and configuration. The logger is the one that writes; it is allowed by
// name, and moving it behind a port is not this rule's business.
const APPLICATION_IMPORTS = [
  ...DOMAIN_IMPORTS,
  "@/shared/application/",
  "@/utils/logger\\.js$",
  "@/utils/date-io\\.js$",
  "@/shared/cache/keys\\.js$",
  "@/config/envManager\\.js$",
  "@/config/app-name\\.js$",
];
// A relative specifier passes this pattern and is left to the local rule, which knows where it
// lands.
const onlyFrom = (layer, allowed) => ({
  regex: `^(?!(?:\\.{1,2}/|${allowed.join("|")}))`,
  message: `The ${layer} layer imports only what its list in eslint.config.mjs allows (${layer.toUpperCase()}_IMPORTS): its own layer, the shared kernel, and a short named list. A package or module that is not on it belongs behind a port (ADR-0058, ADR-0074). Add to the list only with a reason.`,
});
const DOMAIN_LAYER_ALLOWLIST = onlyFrom("domain", DOMAIN_IMPORTS);
const APPLICATION_LAYER_ALLOWLIST = onlyFrom(
  "application",
  APPLICATION_IMPORTS,
);

// ADR-0074 (D-03): one spelling per module. An aliased path with a `.` or `..` segment or
// a doubled slash, or one written from the repository root, named a feature the patterns
// above could not parse: `@/features/metric/../metric-log/domain/...` reached another
// feature's domain unseen. Applies to every file under src.
// ADR-0078 (X45): the rule covers the other two aliases of tsconfig.json, `@utils/*` and
// `@config/*`; `@utils/../features/...` reached another feature past every pattern here.
const ALIAS = "@(?:utils|config)?/";
const CANONICAL_PATH = {
  regex: `^src/|^${ALIAS}(?:[^/]*/)*\\.{1,2}(?:/|$)|^${ALIAS}(?:.*/)?/`,
  message:
    "Write the canonical path: `@/...`, `@utils/...` or `@config/...` with no `.` or `..` segment and no doubled slash, or a relative path. A non-canonical spelling hides which feature or layer it reaches (ADR-0074, ADR-0078).",
};

// ADR-0058, widened by ADR-0074 (D-04, register row B-29): outside src/features, a file
// enters a feature by one door per purpose, or not at all. src/types once held two of the
// metric feature's type files, which imported three other features' internals, and until
// 2026-10-20 only src/{types,shared,utils,config} were checked (audit-2026-10-03 S5).
// The doors:
//   src/app.ts                                     a feature's index.ts (its routers)
//   src/composition                                feature.ts and public.ts (ADR-0056)
//   src/infrastructure/db, src/utils/db-helper.ts  one model file (ADR-0044 decision 4)
//   src/lib/openapi                                one http/schema.zod file
// Every other file under src imports no feature. A pattern takes any path with a
// `features/` segment, aliased or relative, so no other directory may be named `features`.
const FEATURE_DOOR_MESSAGE =
  "Outside src/features, a feature is entered by one door per purpose: src/app.ts through its index.ts, src/composition through feature.ts or public.ts, the ORM registry and db-helper.ts through one model file, src/lib/openapi through one http/schema.zod file. Every other file imports no feature: move the code into the feature, or wire it in src/composition (ADR-0058, ADR-0074).";
const featureDoor = (tail) => ({
  regex: `(?:^@/|/)features/(?!(?:(?:public|shared)/)?[^/]+${tail}$)`,
  message: FEATURE_DOOR_MESSAGE,
});
const NO_FEATURE_IMPORT = featureDoor("(?!)"); // no door: every feature path is refused
const FEATURE_DOOR_INDEX = featureDoor("(?:/index(?:\\.js)?)?");
const FEATURE_DOOR_COMPOSITION = featureDoor("/(?:feature|public)(?:\\.js)?");
const FEATURE_DOOR_MODELS = featureDoor(
  "/infrastructure/persistence/models/[^/]+",
);
const FEATURE_DOOR_SCHEMAS = featureDoor(
  "/infrastructure/http/schema\\.zod(?:\\.js)?",
);

// The six files that import another feature's models, and no other (ADR-0074 D-05). The
// globs once covered all 11 model files and any feature's MetricReadMapper.ts or
// TrendRepoSequelize.ts. architecture.test.ts freezes the imports at 11.
const MODEL_ASSOCIATION_FILES = [
  "src/features/public/metric/infrastructure/persistence/models/metric.sequelize.ts",
  "src/features/public/metric-category/infrastructure/persistence/models/metric-category.sequelize.ts",
  "src/features/public/metric-log/infrastructure/persistence/models/metric-log.sequelize.ts",
  "src/features/public/metric-settings/infrastructure/persistence/models/metric-settings.sequelize.ts",
  "src/features/public/metric/infrastructure/persistence/mappers/MetricReadMapper.ts",
  "src/features/public/analytics/infrastructure/persistence/TrendRepoSequelize.ts",
];

// Every block below restates these: a later block that sets no-restricted-imports
// replaces the rule for the files it matches.
const BASE_IMPORT_PATTERNS = [...LEGACY_IMPORT_PATTERNS, CANONICAL_PATH];

// Every rule above is a no-restricted-imports pattern, and that rule reads static
// `import` and `export … from` only. A dynamic `import()` or a TypeScript import type
// names a module without either, so each rule could be walked around. Both forms are
// refused outright under src/: a selector on the specifier would miss `import(path)`.
// So is node's `module` package, the source of createRequire.
// Nothing in src/ uses them (boundary-rule-residuals D-08). A file that needs a lazy
// import gets a later block that names it and says why.
// __tests__/unit/feature-boundaries.lint.test.ts proves it in every kind of src file.
const NO_UNCHECKED_IMPORT_FORMS = [
  {
    selector: "ImportExpression",
    message:
      "No dynamic import() under src/: the boundary rules read static imports only, so this would bypass them. Use a static import. If the file truly needs a lazy import, add a named exemption in eslint.config.mjs with the reason.",
  },
  {
    selector: "TSImportType",
    message:
      'No import("…") types under src/: the boundary rules read static imports only, so this would bypass them. Use `import type { X } from "…"`.',
  },
  {
    // node's own `module` package is where createRequire comes from, and a require
    // built that way loads a file by relative path with no import statement at all.
    selector:
      ":matches(ImportDeclaration, ExportNamedDeclaration, ExportAllDeclaration)[source.value=/^(node:)?module$/]",
    message:
      "No import from node's `module` package under src/: createRequire loads a file with no import statement, which the boundary rules cannot read. Use a static import.",
  },
  {
    // ADR-0078 (X43): the same constructor reached as a property, `globalThis.Function`.
    selector:
      ":matches(MemberExpression[computed=false][property.name='Function'], MemberExpression[property.value='Function'])",
    message:
      "No Function constructor under src/: it evaluates code no boundary rule can read. Write the function.",
  },
  {
    // ADR-0074 (D-06): the Function constructor evaluates a string, which can load a
    // module unseen by any import rule (audit-2026-10-12 W6).
    selector:
      ":matches(NewExpression, CallExpression)[callee.type='Identifier'][callee.name='Function']",
    message:
      "No Function constructor under src/: it evaluates code no boundary rule can read. Write the function.",
  },
  {
    // ADR-0078 (X43's rest; architecture-boundaries D-06): an alias of `process` or
    // `module` reaches getBuiltinModule or require under a name no rule reads. Each is
    // read only as `x.y`; a type position (`typeof process`) loads nothing.
    selector:
      "Identifier[name=/^(process|module)$/]:not(MemberExpression > .object):not(MemberExpression[computed=false] > .property):not(:matches(Property, PropertyDefinition, MethodDefinition, TSPropertySignature)[computed=false] > .key):not(TSTypeQuery > .exprName):not(TSQualifiedName > .left)",
    message:
      "Under src/, process and module are read only as process.x and module.x: an alias would reach getBuiltinModule or require under a name no boundary rule reads. Pass the member you need.",
  },
];

// ADR-0078 (inner-layers-reach-infrastructure D-01): no-restricted-imports reads a specifier's
// text, so a relative path was allowed wherever it landed, `src/config/db.js` included (X40).
// This rule resolves it against the importing file and holds where it lands to the layer's
// list. A target in the file's own feature passes only into `ownLayers`; any other target
// passes only if its `@/` form is on `allowed`, the same DOMAIN_IMPORTS or APPLICATION_IMPORTS.
// It reads static `import` and `export … from`; the forms it cannot read are refused below.
const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), "src");
const toPosix = (p) => p.split(path.sep).join("/");
const RELATIVE_IMPORTS_ON_THE_LIST = {
  meta: {
    type: "problem",
    schema: [
      {
        type: "object",
        properties: {
          layer: { type: "string" },
          allowed: { type: "array", items: { type: "string" } },
          ownLayers: { type: "array", items: { type: "string" } },
        },
        required: ["layer", "allowed", "ownLayers"],
        additionalProperties: false,
      },
    ],
    messages: {
      outsideSrc:
        "A relative import here must land under src/. Use the module's `@/` path, if its list allows it (ADR-0078).",
      ownFeature:
        "This relative path lands on {{target}}, outside the parts of this feature the {{layer}} layer may import ({{ownLayers}}). Declare a port or a domain type instead (ADR-0058, ADR-0078).",
      notListed:
        "This relative path lands on {{target}}, which is not on the {{layer}} layer's list in eslint.config.mjs ({{list}}_IMPORTS). A relative path is held to the same list as an aliased one (ADR-0074, ADR-0078).",
    },
  },
  create(context) {
    const [{ layer, allowed, ownLayers }] = context.options;
    const onList = new RegExp(`^(?:${allowed.join("|")})`);
    const file = toPosix(path.relative(SRC, context.filename)).split("/");
    // src/features/<audience>/<name>, for a file inside a feature.
    const ownFeature =
      file[0] === "features" ? file.slice(0, 3).join("/") : null;
    const check = (node) => {
      const spec = node.source?.value;
      if (typeof spec !== "string" || !spec.startsWith(".")) return;
      const target = toPosix(
        path.relative(SRC, path.resolve(path.dirname(context.filename), spec)),
      );
      const report = (messageId) =>
        context.report({
          node: node.source,
          messageId,
          data: {
            target: `@/${target}`,
            layer,
            list: layer.toUpperCase(),
            ownLayers: ownLayers.join(", "),
          },
        });
      if (
        target === ".." ||
        target.startsWith("../") ||
        path.isAbsolute(target)
      ) {
        report("outsideSrc");
      } else if (ownFeature && `${target}/`.startsWith(`${ownFeature}/`)) {
        const part = target.slice(ownFeature.length + 1).split("/")[0];
        if (!ownLayers.includes(part)) report("ownFeature");
      } else if (!onList.test(`@/${target}`)) {
        report("notListed");
      }
    };
    return {
      ImportDeclaration: check,
      ExportNamedDeclaration: check,
      ExportAllDeclaration: check,
    };
  },
};
const BOUNDARIES_PLUGIN = {
  rules: { "relative-imports-on-the-list": RELATIVE_IMPORTS_ON_THE_LIST },
};
const relativeImportsOnTheList = (layer, allowed, ownLayers) => [
  "error",
  { layer, allowed, ownLayers },
];

export default [
  // Ignore migrations and eslint.config.mjs files
  {
    ignores: [
      "eslint.config.mjs",
      "src/migrations/**/*.cjs",
      "dist/**",
      "coverage/**",
      ".venv-schemathesis/**",
    ],
  },
  // Register the @typescript-eslint plugin so its rules can be used
  {
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
  },
  // Register the prettier plugin so its rules can be used
  {
    plugins: {
      prettier: prettierPlugin,
    },
  },
  // The repository's own boundary rule (ADR-0078)
  {
    plugins: {
      boundaries: BOUNDARIES_PLUGIN,
    },
  },
  jsConfig, // Standard JS rules (flat version)
  tsConfig, // TypeScript rules (flat version)
  prettierConfig, // Prettier config without the extends key
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx,mts,cts,jsx}"],
    languageOptions: {
      parser: tsParser, // Use the correct TypeScript parser
      parserOptions: {
        ecmaVersion: "latest", // Use latest ECMAScript features
        sourceType: "module", // Enforce ES Modules
        project: "./tsconfig.eslint.json", // Use expanded TS project for linting
      },
      globals: {
        ...globals.node, // Provide Node globals like process, Buffer, console
      },
    },
    plugins: {
      n: node, // Node.js specific rules
    },
    rules: {
      "n/no-unsupported-features/es-syntax": "off", // Allow modern ES syntax
      "n/no-missing-import": "off", // Avoid false positives with TS imports
      "no-console": "warn", // Warn about console.log (not an error)
      semi: ["error", "always"], // Enforce semicolons
      quotes: ["error", "double", { avoidEscape: true }], // Prefer double quotes but avoid needless escaping
      indent: "off", // Delegate indentation entirely to Prettier
      "prettier/prettier": "error", // Ensure Prettier formatting
      "no-restricted-imports": ["error", { patterns: LEGACY_IMPORT_PATTERNS }],
      // A promise is awaited, handed to runInBackground, caught, or marked void
      // with a comment saying why (ADR-0076).
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
    },
  },
  // Boundary rules (ADR-0044, ADR-0058, ADR-0074). Most general first: a later block that
  // matches a file replaces no-restricted-imports for it, so each restates the base.
  // Everything under src imports no feature unless a block below names its door.
  {
    files: [`src/**/*.${EXT}`],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [...BASE_IMPORT_PATTERNS, NO_FEATURE_IMPORT] },
      ],
    },
  },
  // The doors (D-04). src/app.ts mounts each feature's routers.
  {
    files: [`src/app.${EXT}`],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [...BASE_IMPORT_PATTERNS, FEATURE_DOOR_INDEX] },
      ],
    },
  },
  {
    files: [`src/composition/**/*.${EXT}`],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [...BASE_IMPORT_PATTERNS, FEATURE_DOOR_COMPOSITION] },
      ],
    },
  },
  {
    // The ORM registry, where every model meets, and the helpers typed with them.
    files: [`src/infrastructure/db/**/*.${EXT}`, `src/utils/db-helper.${EXT}`],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [...BASE_IMPORT_PATTERNS, FEATURE_DOOR_MODELS] },
      ],
    },
  },
  {
    // The spec is assembled from every feature's request schemas.
    files: [`src/lib/openapi/**/*.${EXT}`],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [...BASE_IMPORT_PATTERNS, FEATURE_DOOR_SCHEMAS] },
      ],
    },
  },
  // Feature-slice boundaries.
  {
    files: [`src/features/**/*.${EXT}`],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...BASE_IMPORT_PATTERNS,
            FEATURE_DEEP_IMPORTS,
            SIBLING_COMPOSITION_ROOT,
          ],
        },
      ],
    },
  },
  {
    // The frozen exception: the files that import another feature's models.
    files: MODEL_ASSOCIATION_FILES,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...BASE_IMPORT_PATTERNS,
            FEATURE_DEEP_IMPORTS_EXCEPT_MODELS,
            SIBLING_COMPOSITION_ROOT,
          ],
        },
      ],
    },
  },
  {
    files: [`src/features/*/*/domain/**/*.${EXT}`],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...BASE_IMPORT_PATTERNS,
            FEATURE_DEEP_IMPORTS,
            SIBLING_COMPOSITION_ROOT,
            INNER_LAYER_HTTP_ERROR,
            DOMAIN_LAYER_APPLICATION,
            INNER_LAYER_INFRASTRUCTURE,
            DOMAIN_LAYER_ALLOWLIST,
          ],
        },
      ],
      "boundaries/relative-imports-on-the-list": relativeImportsOnTheList(
        "domain",
        DOMAIN_IMPORTS,
        ["domain"],
      ),
    },
  },
  {
    files: [`src/features/*/*/application/**/*.${EXT}`],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...BASE_IMPORT_PATTERNS,
            FEATURE_DEEP_IMPORTS,
            SIBLING_COMPOSITION_ROOT,
            APPLICATION_LAYER_ORM,
            INNER_LAYER_HTTP_ERROR,
            INNER_LAYER_INFRASTRUCTURE,
            APPLICATION_LAYER_ALLOWLIST,
          ],
        },
      ],
      "boundaries/relative-imports-on-the-list": relativeImportsOnTheList(
        "application",
        APPLICATION_IMPORTS,
        ["domain", "application"],
      ),
    },
  },
  {
    // ADR-0078 (D-02): what another feature's inner layers may take. A contract re-exports
    // its own domain and nothing else, so it is held to the domain's rules with its own
    // domain as the one part of the feature it may reach.
    files: [`src/features/*/*/contract.${EXT}`],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...BASE_IMPORT_PATTERNS,
            FEATURE_DEEP_IMPORTS,
            SIBLING_COMPOSITION_ROOT,
            INNER_LAYER_HTTP_ERROR,
            DOMAIN_LAYER_APPLICATION,
            INNER_LAYER_INFRASTRUCTURE,
            DOMAIN_LAYER_ALLOWLIST,
          ],
        },
      ],
      "boundaries/relative-imports-on-the-list": relativeImportsOnTheList(
        "domain",
        DOMAIN_IMPORTS,
        ["domain"],
      ),
    },
  },
  {
    // The shared kernel has layers too.
    files: [`src/shared/application/**/*.${EXT}`],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...BASE_IMPORT_PATTERNS,
            NO_FEATURE_IMPORT,
            INNER_LAYER_HTTP_ERROR,
            INNER_LAYER_INFRASTRUCTURE,
            APPLICATION_LAYER_ALLOWLIST,
          ],
        },
      ],
      "boundaries/relative-imports-on-the-list": relativeImportsOnTheList(
        "application",
        APPLICATION_IMPORTS,
        [],
      ),
    },
  },
  {
    // Its domain, and src/types/domain: feature domains import those types, so they are
    // held to the domain's rules (ADR-0074 D-02).
    files: [`src/shared/domain/**/*.${EXT}`, `src/types/domain/**/*.${EXT}`],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...BASE_IMPORT_PATTERNS,
            NO_FEATURE_IMPORT,
            INNER_LAYER_HTTP_ERROR,
            DOMAIN_LAYER_APPLICATION,
            INNER_LAYER_INFRASTRUCTURE,
            DOMAIN_LAYER_ALLOWLIST,
          ],
        },
      ],
      "boundaries/relative-imports-on-the-list": relativeImportsOnTheList(
        "domain",
        DOMAIN_IMPORTS,
        [],
      ),
    },
  },
  // The boundary rules cannot be bypassed by a form they do not read.
  {
    files: [`src/**/*.${EXT}`],
    rules: {
      "no-restricted-syntax": ["error", ...NO_UNCHECKED_IMPORT_FORMS],
      // ADR-0078 (X43): a string evaluated as code loads what no import rule reads.
      "no-eval": "error",
      "no-implied-eval": "error",
      // ADR-0074 (D-06): node's own way to reach `module` with no import at all.
      "no-restricted-properties": [
        "error",
        {
          object: "process",
          property: "getBuiltinModule",
          message:
            "No process.getBuiltinModule under src/: it loads a module with no import statement, which the boundary rules cannot read. Use a static import.",
        },
        {
          // ADR-0078 (X43): a `.cjs` file's require by another name.
          object: "module",
          property: "require",
          message:
            "No module.require under src/: it loads a module with no import statement, which the boundary rules cannot read. Use a static import.",
        },
        // ADR-0078 (architecture-boundaries D-06): the same two objects reached as a
        // property, then aliased.
        ...["globalThis", "global"].flatMap((object) =>
          ["process", "module"].map((property) => ({
            object,
            property,
            message: `No ${object}.${property} under src/: read ${property}.x directly, so the boundary rules can see what it loads.`,
          })),
        ),
      ],
    },
  },
  // Override for Jest-driven test files living under __tests__
  {
    files: ["__tests__/**/*.{js,mjs,cjs,ts,tsx,jsx}"],
    languageOptions: {
      globals: {
        ...globals.jest,
        ...globals.node,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off", // Tests frequently rely on loose mocks
      "@typescript-eslint/no-unused-vars": "off", // Allow descriptive helper/mocked signatures
      "@typescript-eslint/no-require-imports": "off", // Allow jest.mock requires inside tests
      "no-restricted-properties": [
        "error",
        {
          object: "process",
          property: "env",
          message:
            "Use withTestEnv/getEnv helpers instead of mutating process.env directly in tests.",
        },
      ],
    },
  },
  // The one test file that sets process.env: withTestEnv sets and restores it
  // for everything else (architecture-dead-code D-04).
  {
    files: ["__tests__/helpers/env-test-utils.ts"],
    rules: {
      "no-restricted-properties": "off",
    },
  },
  // Jest setup files live at repo root but still need Jest globals
  {
    files: ["jest.setup*.ts"],
    languageOptions: {
      globals: {
        ...globals.jest,
        ...globals.node,
      },
    },
  },
  // Allow console usage in standalone scripts
  {
    files: ["scripts/**/*.{js,mjs,cjs,ts,tsx}"],
    rules: {
      "no-console": "off",
    },
  },
  // Override for CommonJS files (migrations, config files)
  {
    files: ["*.cjs", "src/config/**/*.cjs"],
    languageOptions: {
      globals: {
        ...globals.node, // Import Node globals (process, __dirname, etc.)
      },
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "no-undef": "off",
    },
  },
  // Override for config.cjs file that used for Sequelize configuration
  {
    files: ["src/config/config.cjs"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "no-console": "off", // Allow console logs in this specific file
      "prettier/prettier": "off", // File relies on CommonJS formatting, skip Prettier noise
    },
  },
];
