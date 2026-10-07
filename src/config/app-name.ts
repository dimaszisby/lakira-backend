import fs from "node:fs";
import path from "node:path";

// Reads process.env directly — intentional bypass of envManager.
// logger.ts imports this module at load time, before envManager is initialised,
// so going through the Zod-validated env object would cause a circular init failure.

const NODE_MODULES = `${path.sep}node_modules${path.sep}`;

/**
 * Where the app's own package.json is: the nearest one at or above the entry
 * script, else the one in the working directory. The entry script is what
 * makes the answer independent of the directory the process was started from.
 * It is skipped inside node_modules, where a test runner's entry script would
 * find the runner's package (app-name-from-package D-02, D-03).
 */
export const locatePackageJson = (
  entry: string | undefined = process.argv[1],
  cwd: string = process.cwd(),
): { found: string | undefined; looked: string[] } => {
  const looked: string[] = [];
  if (entry && !path.resolve(entry).includes(NODE_MODULES)) {
    let dir = path.dirname(path.resolve(entry));
    for (;;) {
      looked.push(path.join(dir, "package.json"));
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  const inCwd = path.resolve(cwd, "package.json");
  if (!looked.includes(inCwd)) looked.push(inCwd);
  return { found: looked.find((file) => fs.existsSync(file)), looked };
};

/** The `name` in a package.json. Throws when there is none to read. */
export const readPackageName = (file?: string): string => {
  let target = file;
  if (target === undefined) {
    const { found, looked } = locatePackageJson();
    if (found === undefined) {
      throw new Error(
        `APP_NAME is not set and there is no package.json to take a name from (looked in ${looked.join(", ")}). Set APP_NAME.`,
      );
    }
    target = found;
  }
  let name: unknown;
  let cause: unknown;
  try {
    ({ name } = JSON.parse(fs.readFileSync(target, "utf-8")) as {
      name?: unknown;
    });
  } catch (error) {
    cause = error;
  }
  if (typeof name !== "string" || name.trim().length === 0) {
    throw new Error(
      `APP_NAME is not set and no package name could be read from ${target}. Set APP_NAME, or give that package.json a name.`,
      { cause },
    );
  }
  return name.trim();
};

/**
 * The app's name: `APP_NAME` when it is set and not blank, otherwise the
 * package's name without its scope. `scripts/bootstrap-fork.sh` renames the
 * package and the image carries package.json, so a fork deployed with no
 * `APP_NAME` is named after the fork. There is no fixed fallback: one would
 * name every such fork after the template (ADR-0060).
 */
export const resolveAppName = (
  fromEnv: string | undefined,
  packageName: () => string = readPackageName,
): string => {
  const explicit = fromEnv?.trim();
  if (explicit) return explicit;
  const scoped = packageName();
  const name = scoped.replace(/^@[^/]+\//, "").trim();
  if (name.length === 0) {
    throw new Error(
      `APP_NAME is not set and the package name "${scoped}" leaves no name once its scope is dropped. Set APP_NAME.`,
    );
  }
  return name;
};

export const APP_NAME = resolveAppName(process.env.APP_NAME);
export const APP_SHORT_NAME = APP_NAME.replace(/-backend$/, "");

const toTitleCase = (s: string): string =>
  s
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

export const APP_DISPLAY_NAME = toTitleCase(APP_SHORT_NAME);
