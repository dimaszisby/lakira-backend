import { spawnSync } from "child_process";
import path from "path";

/**
 * Register row B-69 (kit coverage-thresholds-enforced, D-01). Jest reads `coverageThreshold` only
 * from the root configuration; set inside a project it is ignored, and both coverage runs exited
 * 0 whatever the coverage. The root now picks one project's thresholds by JEST_COVERAGE_PROJECT,
 * which the two coverage scripts set. Each case loads the config in a child process, so the
 * variable is read fresh.
 */
const ROOT = path.resolve(__dirname, "../..");

const loadConfig = (env: Record<string, string>) =>
  spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      'const { default: c } = await import("./jest.config.mjs"); process.stdout.write(JSON.stringify(c));',
    ],
    { cwd: ROOT, encoding: "utf-8", env },
  );

type Config = {
  coverageThreshold?: { global: Record<string, number> };
  projects: { displayName: string; coverageThreshold?: unknown }[];
};

const configFor = (env: Record<string, string>): Config => {
  const result = loadConfig(env);
  expect(result.status).toBe(0);
  return JSON.parse(result.stdout) as Config;
};

describe("coverage thresholds in jest.config.mjs", () => {
  it.each([
    ["unit", { statements: 60, branches: 40, functions: 55, lines: 60 }],
    ["integration", { statements: 70, branches: 45, functions: 70, lines: 70 }],
  ])(
    "JEST_COVERAGE_PROJECT=%s sets that project's thresholds at the root",
    (project, global) => {
      expect(
        configFor({ JEST_COVERAGE_PROJECT: project }).coverageThreshold,
      ).toEqual({ global });
    },
  );

  it("sets no threshold when the variable is unset", () => {
    expect(configFor({}).coverageThreshold).toBeUndefined();
  });

  it("refuses an unknown project, so a typo cannot switch enforcement off", () => {
    const result = loadConfig({ JEST_COVERAGE_PROJECT: "units" });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      'JEST_COVERAGE_PROJECT must be "unit" or "integration"',
    );
  });

  it("leaves coverageThreshold out of every project, where Jest does not read it", () => {
    const { projects } = configFor({ JEST_COVERAGE_PROJECT: "unit" });
    expect(projects.map((p) => p.displayName)).toEqual([
      "unit",
      "integration",
      "e2e",
    ]);
    for (const project of projects)
      expect(project).not.toHaveProperty("coverageThreshold");
  });
});
