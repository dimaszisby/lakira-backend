import fs from "fs";
import path from "path";

/**
 * Kit release-and-retry-after, D-03 (lakira-frontend F-61). The Compose image reports the
 * commit it was built from on `/health`, so the frontend's stack preflight can compare commits
 * rather than dates. The commit is baked in at build time: set through `environment:`, an `up`
 * without `--build` would label an old image with a new commit. This reads the files, so it
 * needs no Docker; the commit itself was observed on a built image.
 */
const ROOT = path.resolve(__dirname, "../..");

const instructions = (file: string) =>
  fs
    .readFileSync(path.join(ROOT, file), "utf-8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

// The lines of one top-level service in docker-compose.yml, comments dropped.
const service = (name: string): string[] => {
  const lines = fs
    .readFileSync(path.join(ROOT, "docker-compose.yml"), "utf-8")
    .split("\n");
  const start = lines.findIndex((line) => line.startsWith(`  ${name}:`));
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^ {2}\S|^\S/.test(line));
  return rest
    .slice(0, end === -1 ? undefined : end)
    .filter((line) => !/^\s*#/.test(line));
};

describe("the dev image carries its commit (release-and-retry-after D-03)", () => {
  it("Dockerfile.dev takes APP_RELEASE as a build argument, after npm install", () => {
    const lines = instructions("Dockerfile.dev");
    const install = lines.findIndex((line) =>
      /^RUN npm (install|ci)/.test(line),
    );
    const arg = lines.indexOf("ARG APP_RELEASE=unknown");
    const env = lines.indexOf("ENV APP_RELEASE=$APP_RELEASE");

    expect(install).toBeGreaterThan(-1);
    expect(arg).toBeGreaterThan(install);
    expect(env).toBeGreaterThan(arg);
  });

  it.each(["app", "worker"])(
    "the %s service passes it at build time and does not set it at run time",
    (name) => {
      const lines = service(name);
      const args = lines.findIndex((line) => line.trim() === "args:");

      expect(args).toBeGreaterThan(-1);
      expect(lines[args + 1].trim()).toBe(
        "APP_RELEASE: ${APP_RELEASE:-unknown}",
      );
      expect(lines.filter((line) => line.includes("APP_RELEASE"))).toHaveLength(
        1,
      );
    },
  );

  it(".env.example does not ship an empty APP_RELEASE, which would override the image's", () => {
    expect(
      instructions(".env.example").filter((line) =>
        line.startsWith("APP_RELEASE="),
      ),
    ).toEqual([]);
  });
});
