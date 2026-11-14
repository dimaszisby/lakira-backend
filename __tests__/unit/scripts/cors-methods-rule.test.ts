import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";

/**
 * #260. Rule CFG-CORS-001 of the security delta read the CORS methods list from
 * src/server.ts after ADR-0061 moved it to mountHttpPipeline, took the missing list for one
 * without PATCH, and reported a false medium on every run. The rule is a plain `.mjs`
 * module, which Jest here does not import, so each case runs it in a child process, as
 * jest-coverage-thresholds.test.ts loads jest.config.mjs.
 */
const ROOT = path.resolve(__dirname, "../../..");

type RouterText = { path: string; text: string };
type Result = {
  status: "pass" | "missing-patch" | "no-methods-list";
  patchRouteFiles: string[];
};

const evaluate = (pipelineText: string, routerTexts: RouterText[]): Result => {
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      'const { evaluateCorsMethodsRule } = await import("./scripts/security/cors-methods-rule.mjs"); process.stdout.write(JSON.stringify(evaluateCorsMethodsRule(JSON.parse(process.argv[1]))));',
      JSON.stringify({ pipelineText, routerTexts }),
    ],
    { cwd: ROOT, encoding: "utf-8" },
  );
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  return JSON.parse(result.stdout) as Result;
};

const read = (relativePath: string) =>
  fs.readFileSync(path.join(ROOT, relativePath), "utf-8");

const PATCH_ROUTER = {
  path: "src/a.router.ts",
  text: 'router.patch("/x", handler);',
};
const GET_ROUTER = { path: "src/b.router.ts", text: 'router.get("/y", h);' };

describe("CORS methods rule (CFG-CORS-001)", () => {
  it("passes on the real pipeline, and sees the organization router's PATCH route", () => {
    const routers = [
      "src/features/shared/auth/infrastructure/http/organization.router.ts",
      "src/features/public/metric-settings/infrastructure/http/router.ts",
    ];
    const result = evaluate(
      read("src/shared/middleware/http-pipeline.ts"),
      routers.map((p) => ({ path: p, text: read(p) })),
    );

    expect(result.status).toBe("pass");
    expect(result.patchRouteFiles).toEqual(routers);
  });

  it("reports a list without PATCH while a PATCH route exists", () => {
    const result = evaluate('cors({ methods: ["GET", "POST"] })', [
      PATCH_ROUTER,
      GET_ROUTER,
    ]);

    expect(result).toEqual({
      status: "missing-patch",
      patchRouteFiles: ["src/a.router.ts"],
    });
  });

  it("reports no list at all as such, never as a list without PATCH", () => {
    const result = evaluate("app.use(cors({ origin }));", [PATCH_ROUTER]);

    expect(result.status).toBe("no-methods-list");
  });

  it("passes a list without PATCH when no route uses PATCH", () => {
    const result = evaluate('cors({ methods: ["GET"] })', [GET_ROUTER]);

    expect(result).toEqual({ status: "pass", patchRouteFiles: [] });
  });
});
