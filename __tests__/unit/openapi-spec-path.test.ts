import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";

/**
 * Audit 2026-10-03, S2: bootstrap-fork.sh renamed the spec's path in package.json
 * while three scripts kept the upstream filename as a literal, so a fork's
 * `docs:openapi:check` looked for a file nothing wrote. The filename now comes
 * from the package name in one module (kit fork-openapi-gate, D-01).
 */
const ROOT = path.resolve(__dirname, "../..");
const SCRIPTS = path.join(ROOT, "scripts");
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), "utf-8");

const scriptFiles = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? scriptFiles(full) : [full];
  });

describe("the OpenAPI spec path", () => {
  const packageName = JSON.parse(read("package.json")).name as string;

  it("is built from the package name in scripts/openapi-spec-path.js", () => {
    const source = read("scripts/openapi-spec-path.js");

    expect(source).toContain("package.json");
    expect(source).toContain(
      "export const PACKAGE_NAME = appNameFromPackage(packageName);",
    );
    expect(source).toContain("`${PACKAGE_NAME}-openapi.json`");
    expect(source).not.toContain("lakira");
  });

  // The module is plain ESM JavaScript, so it is loaded the way the contract
  // runners load it: by Node, with no loader.
  it("resolves to the spec file for this package's name", () => {
    const resolved = execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        'import { OPENAPI_SPEC_FILE } from "./scripts/openapi-spec-path.js"; process.stdout.write(OPENAPI_SPEC_FILE);',
      ],
      { cwd: ROOT, encoding: "utf-8" },
    );

    expect(resolved).toBe(
      path.join(ROOT, `docs/reference/api/${packageName}-openapi.json`),
    );
  });

  it.each([
    "scripts/generate-openapi.ts",
    "scripts/normalize-openapi.ts",
    "scripts/validate-openapi.ts",
    "tests/contract/schemathesis/scripts/run-local.js",
    "tests/contract/schemathesis/scripts/run-staging.js",
  ])("%s takes the path from that module", (script) => {
    const source = read(script);

    expect(source).toMatch(
      /from "(?:\.\/|(?:\.\.\/)+scripts\/)openapi-spec-path\.js"/,
    );
    expect(source).not.toMatch(/-openapi\.json/);
  });

  // bootstrap-fork.sh names the upstream file because it is the thing renaming it.
  it("no other script carries a spec filename as a literal", () => {
    const offenders = [
      ...scriptFiles(SCRIPTS),
      ...scriptFiles(path.join(ROOT, "tests/contract/schemathesis/scripts")),
    ]
      .filter((file) => path.basename(file) !== "bootstrap-fork.sh")
      .filter((file) => path.basename(file) !== "openapi-spec-path.js")
      .filter((file) => /-openapi\.json/.test(fs.readFileSync(file, "utf-8")))
      .map((file) => path.relative(ROOT, file));

    expect(offenders).toEqual([]);
  });

  // Audit 2026-10-05, T2 (kit fork-openapi-gate, D-04). The spec's title and
  // cookie name are built from APP_NAME. The committed spec describes the
  // package, so the generator pins APP_NAME to the package name before anything
  // reads it, whatever the shell exports.
  it("the generator's app name is the package name, whatever the environment says", () => {
    const seen = execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        'import "./scripts/openapi-app-name.js"; process.stdout.write(process.env.APP_NAME ?? "");',
      ],
      { cwd: ROOT, encoding: "utf-8", env: { APP_NAME: "something-else" } },
    );

    expect(seen).toBe(packageName);
  });

  it("the generator imports that module before anything else", () => {
    const firstImport = read("scripts/generate-openapi.ts")
      .split("\n")
      .find((line) => line.startsWith("import "));

    expect(firstImport).toBe('import "./openapi-app-name.js";');
  });

  // app-name-review-leftovers D-02. The app drops a package's scope, so the
  // spec scripts drop it too, and the committed spec, the served one and the
  // spec's path agree on one name.
  it("appNameFromPackage drops a scope as the app does", async () => {
    const names = [
      "lakira-backend",
      "my-app",
      "@acme/shop-backend",
      "@my-org/x1",
    ];
    const fromScripts = JSON.parse(
      execFileSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          `import { appNameFromPackage } from "./scripts/openapi-spec-path.js"; process.stdout.write(JSON.stringify(${JSON.stringify(names)}.map(appNameFromPackage)));`,
        ],
        { cwd: ROOT, encoding: "utf-8" },
      ),
    ) as string[];
    const { resolveAppName } = await import("@/config/app-name.js");

    expect(fromScripts).toEqual([
      "lakira-backend",
      "my-app",
      "shop-backend",
      "x1",
    ]);
    expect(fromScripts).toEqual(
      names.map((name) => resolveAppName(undefined, () => name)),
    );
  });

  it("docs:openapi:check diffs the file the scripts write", () => {
    const check = JSON.parse(read("package.json")).scripts[
      "docs:openapi:check"
    ] as string;

    expect(check).toContain(`docs/reference/api/${packageName}-openapi.json`);
    expect(
      fs.existsSync(
        path.join(ROOT, `docs/reference/api/${packageName}-openapi.json`),
      ),
    ).toBe(true);
  });
});
