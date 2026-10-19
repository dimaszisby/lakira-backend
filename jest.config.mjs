// jest.config.mjs

const projectBase = {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
    // audience-scoped feature aliases (must precede the generic @/ catch-all)
    "^@/features/auth/(.*)\\.js$": "<rootDir>/src/features/shared/auth/$1.ts",
    "^@/features/auth/(.*)$": "<rootDir>/src/features/shared/auth/$1",
    "^@/features/analytics/(.*)\\.js$":
      "<rootDir>/src/features/public/analytics/$1.ts",
    "^@/features/analytics/(.*)$": "<rootDir>/src/features/public/analytics/$1",
    "^@/features/metric-log/(.*)\\.js$":
      "<rootDir>/src/features/public/metric-log/$1.ts",
    "^@/features/metric-log/(.*)$":
      "<rootDir>/src/features/public/metric-log/$1",
    "^@/features/metric-settings/(.*)\\.js$":
      "<rootDir>/src/features/public/metric-settings/$1.ts",
    "^@/features/metric-settings/(.*)$":
      "<rootDir>/src/features/public/metric-settings/$1",
    "^@/features/metric-category/(.*)\\.js$":
      "<rootDir>/src/features/public/metric-category/$1.ts",
    "^@/features/metric-category/(.*)$":
      "<rootDir>/src/features/public/metric-category/$1",
    "^@/features/metric/(.*)\\.js$":
      "<rootDir>/src/features/public/metric/$1.ts",
    "^@/features/metric/(.*)$": "<rootDir>/src/features/public/metric/$1",
    "^@/(.*)\\.js$": "<rootDir>/src/$1.ts",
    "^@/(.*)$": "<rootDir>/src/$1",
    "^@config/(.*)\\.js$": "<rootDir>/src/config/$1.ts",
    "^@config/(.*)$": "<rootDir>/src/config/$1",
    "^@utils/(.*)\\.js$": "<rootDir>/src/utils/$1.ts",
    "^@utils/(.*)$": "<rootDir>/src/utils/$1",
  },
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        useESM: true,
        tsconfig: "<rootDir>/tsconfig.json",
      },
    ],
  },
  extensionsToTreatAsEsm: [".ts"],
};

const summaryReporter = [
  "jest-summary-reporter",
  {
    failuresOnly: false,
    showPassed: false,
  },
];

const junitReporter = [
  "jest-junit",
  {
    outputDirectory: "<rootDir>/coverage/junit",
    outputName: process.env.JEST_JUNIT_OUTPUT_NAME ?? "junit.xml",
    ancestorSeparator: " > ",
    classNameTemplate: "{filepath}",
    titleTemplate: "{classname} {title}",
  },
];

// Jest reads coverageThreshold only from the root; inside a project it is ignored, and both
// coverage runs exited 0 whatever the coverage (register row B-69). The two projects run as
// separate commands with different thresholds, so the root picks one by JEST_COVERAGE_PROJECT,
// which test:unit:coverage and test:integration:coverage set. Unset, no threshold applies, so an
// ad hoc coverage run of one file still runs (coverage-thresholds-enforced D-01).
const COVERAGE_THRESHOLDS = {
  unit: { statements: 60, branches: 40, functions: 55, lines: 60 },
  integration: { statements: 70, branches: 45, functions: 70, lines: 70 },
};

/** @param {string | undefined} project */
const coverageThreshold = (project) => {
  if (project === undefined) return undefined;
  if (project !== "unit" && project !== "integration") {
    throw new Error(
      `JEST_COVERAGE_PROJECT must be "unit" or "integration", got "${project}"`,
    );
  }
  return { global: COVERAGE_THRESHOLDS[project] };
};

export default {
  coverageThreshold: coverageThreshold(process.env.JEST_COVERAGE_PROJECT),
  collectCoverageFrom: [
    "<rootDir>/src/**/*.{ts,tsx}",
    "!<rootDir>/src/main.ts",
    "!<rootDir>/src/server.ts",
    "!<rootDir>/**/index.ts",
    "!<rootDir>/src/infrastructure/db/migrations/**",
    "!<rootDir>/src/tests/**",
  ],
  coverageDirectory: "<rootDir>/coverage/jest",
  reporters: ["default", summaryReporter, junitReporter],
  projects: [
    {
      ...projectBase,
      displayName: "unit",
      testMatch: ["<rootDir>/__tests__/unit/**/*.test.ts"],
      setupFilesAfterEnv: ["<rootDir>/jest.setup.unit.ts"],
    },
    {
      ...projectBase,
      displayName: "integration",
      testMatch: ["<rootDir>/__tests__/integration/**/*.test.ts"],
      setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
    },
    {
      ...projectBase,
      displayName: "e2e",
      testMatch: ["<rootDir>/__tests__/e2e/**/*.test.ts"],
      setupFilesAfterEnv: ["<rootDir>/jest.setup.e2e.ts"],
      testTimeout: 30_000,
    },
  ],
};
