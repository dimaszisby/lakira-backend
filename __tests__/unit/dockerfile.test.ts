import fs from "fs";
import path from "path";

/**
 * ADR-0050 — the production image defaults NODE_ENV to production, so every ADR-0036
 * startup refusal holds even when the deployer sets nothing. This reads the Dockerfile, so
 * it fails in seconds and needs no Docker; `npm run docker:smoke` proves the same thing on
 * the built image (ADR-0055).
 */
const DOCKERFILE = path.resolve(__dirname, "../../Dockerfile");

const stages = (): Record<string, string[]> => {
  const result: Record<string, string[]> = {};
  let current: string | null = null;
  for (const raw of fs.readFileSync(DOCKERFILE, "utf-8").split("\n")) {
    const line = raw.trim();
    const from = line.match(/^FROM\s+\S+\s+AS\s+(\S+)/i);
    if (from) {
      current = from[1].toLowerCase();
      result[current] = [];
      continue;
    }
    if (current && line && !line.startsWith("#")) result[current].push(line);
  }
  return result;
};

const setsProductionNodeEnv = (lines: string[]) =>
  lines.some((line) => /^ENV\s+NODE_ENV[=\s]+"?production"?\s*$/i.test(line));

describe("production Dockerfile (ADR-0050)", () => {
  it("has a build stage and a runtime stage", () => {
    expect(Object.keys(stages())).toEqual(["build", "runtime"]);
  });

  it("defaults NODE_ENV to production in the runtime stage", () => {
    expect(setsProductionNodeEnv(stages().runtime)).toBe(true);
  });

  it("does not set NODE_ENV in the build stage, where npm ci needs devDependencies", () => {
    expect(stages().build.some((line) => /^ENV\s+NODE_ENV\b/i.test(line))).toBe(
      false,
    );
  });
});
