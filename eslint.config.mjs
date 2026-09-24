// eslint.config.mjs
import globals from "globals";
import pluginJs from "@eslint/js";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import js from "@eslint/js";

import prettierConfigPackage from "eslint-config-prettier";
import prettierPlugin from "eslint-plugin-prettier";
import node from "eslint-plugin-n";

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

// ADR-0045: a sibling may not import another feature's composition root — its index.ts
// (the bare alias or /index.js) or its feature.ts. index.ts exists for src/server.ts;
// public.ts is the cross-feature surface. A regex rather than a glob: `@/features/*`
// as a gitignore-style group would also match everything beneath it, public.ts included.
const SIBLING_COMPOSITION_ROOT = {
  regex: "^@/features/[a-z-]+(?:/(?:index|feature)(?:\\.js)?)?$",
  message:
    "Import another feature through its public.ts, not its index.ts or feature.ts — those are the composition root, for src/server.ts only (ADR-0045).",
};

// Reaching into any feature's domain/application/infrastructure through the global
// alias. Catches both cross-feature imports and a feature importing itself via the
// alias instead of a relative path.
const FEATURE_DEEP_IMPORTS = {
  group: [
    "@/features/*/domain/**",
    "@/features/*/application/**",
    "@/features/*/infrastructure/**",
  ],
  message: FEATURE_BOUNDARY_MESSAGE,
};

// Same, minus Sequelize model files. Applied only to the files that declare
// cross-model associations. Those are frozen as a recorded debt — cross-module foreign
// keys are the deepest coupling, ID-only references the destination (ADR-0044
// decision 4); the import-cycle reason this comment used to give no longer applies
// (ADR-0045). The count is frozen at 11 by
// __tests__/unit/architecture.test.ts — see
// docs/internal/initiatives/feature-boundaries/decisions.md D-02 and D-03.
// Enumerated positively rather than as `@/features/*/infrastructure/**` plus a
// `!…/models/**` negation: the negation is accepted by the config but has no effect
// on matching, so every model import was still reported. Verified, not assumed.
const FEATURE_DEEP_IMPORTS_EXCEPT_MODELS = {
  group: [
    "@/features/*/domain/**",
    "@/features/*/application/**",
    "@/features/*/infrastructure/cache/**",
    "@/features/*/infrastructure/email/**",
    "@/features/*/infrastructure/http/**",
    "@/features/*/infrastructure/mappers/**",
    "@/features/*/infrastructure/providers/**",
    "@/features/*/infrastructure/sql/**",
    "@/features/*/infrastructure/persistence/mappers/**",
    "@/features/*/infrastructure/persistence/repositories/**",
  ],
  message: FEATURE_BOUNDARY_MESSAGE,
};

// An HTTP status code has no business in a domain entity. Entities raise a
// DomainError kind; src/shared/middleware/error.ts maps it. This was the third of
// SaaS-readiness caveat C4's three claims.
const DOMAIN_LAYER_HTTP_ERROR = {
  group: ["@/utils/AppError", "@/utils/AppError.js", "**/utils/AppError.js"],
  message:
    "AppError carries an HTTP statusCode, which the domain layer must not know. Throw a DomainError (or ValidationError) from @/shared/domain/errors/DomainError.js and let the error middleware map it. See .claude/rules/architecture.md § Dependency Rules.",
};

// The application layer depends on domain and ports only. The models barrel is
// infrastructure, and importing it is an ORM write from the wrong layer.
const APPLICATION_LAYER_ORM = {
  group: ["@/infrastructure/db/models", "@/infrastructure/db/models.js"],
  message:
    "The application layer must not reach the ORM directly. Inject a repository port instead. See .claude/rules/architecture.md § Dependency Rules.",
};

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
  jsConfig, // Standard JS rules (flat version)
  tsConfig, // TypeScript rules (flat version)
  prettierConfig, // Prettier config without the extends key
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx,jsx}"],
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
    },
  },
  // Feature-slice boundaries. Three blocks, most general first — a later block that
  // matches a file replaces the rule for it, so each re-states the legacy patterns.
  {
    files: ["src/features/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...LEGACY_IMPORT_PATTERNS,
            FEATURE_DEEP_IMPORTS,
            SIBLING_COMPOSITION_ROOT,
          ],
        },
      ],
    },
  },
  {
    // The frozen exception: files declaring Sequelize cross-model associations.
    files: [
      "src/features/**/infrastructure/persistence/models/*.sequelize.ts",
      "src/features/**/infrastructure/persistence/mappers/MetricReadMapper.ts",
      "src/features/**/infrastructure/persistence/TrendRepoSequelize.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...LEGACY_IMPORT_PATTERNS,
            FEATURE_DEEP_IMPORTS_EXCEPT_MODELS,
            SIBLING_COMPOSITION_ROOT,
          ],
        },
      ],
    },
  },
  {
    // D-04 (routers-at-module-scope): the one known sibling composition-root import.
    // GET /metrics/:metricId/trends builds the analytics feature. Exempt by name only;
    // moving the endpoint or exposing a trends port is tracked in
    // docs/internal/todos/2026-09-24-todo-metric-trends-uses-analytics-composition-root.md.
    files: ["src/features/public/metric/infrastructure/http/controller.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [...LEGACY_IMPORT_PATTERNS, FEATURE_DEEP_IMPORTS] },
      ],
    },
  },
  {
    files: ["src/features/*/*/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...LEGACY_IMPORT_PATTERNS,
            FEATURE_DEEP_IMPORTS,
            SIBLING_COMPOSITION_ROOT,
            DOMAIN_LAYER_HTTP_ERROR,
          ],
        },
      ],
    },
  },
  {
    files: ["src/features/*/*/application/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            ...LEGACY_IMPORT_PATTERNS,
            FEATURE_DEEP_IMPORTS,
            SIBLING_COMPOSITION_ROOT,
            APPLICATION_LAYER_ORM,
          ],
        },
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
