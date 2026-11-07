import fs from "node:fs";
import path from "node:path";

// Reads process.env directly — intentional bypass of envManager. logger.ts
// imports this module, so going through envManager would make every import of
// the logger, in a test or a script, parse and validate the whole environment.
// The entry points import envManager first, and it loads .env, so a .env value
// is already in process.env when this module runs (app-name-review-leftovers).

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
 * What an app name must look like: the rule `scripts/bootstrap-fork.sh`
 * applies to `--name`, which a test keeps the same. The name becomes the
 * refresh cookie's name, which Express refuses to set with a space in it, and
 * the queue names, where a dot adds a segment to every routing key
 * (app-name-review-leftovers D-01).
 */
export const APP_NAME_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

const NAME_RULE = `It must match ${APP_NAME_PATTERN.source}: lowercase letters and digits, with single hyphens between them, starting with a letter. The name becomes the refresh cookie's name and the queue names.`;

const withoutScope = (packageName: string): string =>
  packageName.replace(/^@[^/]+\//, "").trim();

/**
 * The app's name: `APP_NAME` when it is set and not blank, otherwise the
 * package's name without its scope. `scripts/bootstrap-fork.sh` renames the
 * package and the image carries package.json, so a fork deployed with no
 * `APP_NAME` is named after the fork. There is no fixed fallback: one would
 * name every such fork after the template (ADR-0060). A name that fails
 * `APP_NAME_PATTERN` is refused, wherever it came from.
 */
export const resolveAppName = (
  fromEnv: string | undefined,
  packageName: () => string = readPackageName,
): string => {
  const explicit = fromEnv?.trim();
  if (explicit) {
    if (!APP_NAME_PATTERN.test(explicit)) {
      throw new Error(
        `APP_NAME "${explicit}" is not a valid app name. ${NAME_RULE}`,
      );
    }
    return explicit;
  }
  const scoped = packageName();
  const name = withoutScope(scoped);
  if (name.length === 0) {
    throw new Error(
      `APP_NAME is not set and the package name "${scoped}" leaves no name once its scope is dropped. Set APP_NAME.`,
    );
  }
  if (!APP_NAME_PATTERN.test(name)) {
    throw new Error(
      `The package name "${scoped}" gives the app name "${name}", which is not a valid app name. ${NAME_RULE} Rename the package, or set APP_NAME.`,
    );
  }
  return name;
};

/**
 * Both names, when `APP_NAME` is set and differs from the package's name
 * without its scope. The variable wins (ADR-0060), so this is reported, not
 * refused: a template's `APP_NAME` copied onto a fork's platform names the
 * fork after the template. Never throws; with no package to read there is
 * nothing to compare (app-name-review-leftovers D-03).
 */
export const appNameMismatch = (
  fromEnv: string | undefined,
  packageName: () => string = readPackageName,
): { appName: string; packageName: string } | undefined => {
  const explicit = fromEnv?.trim();
  if (!explicit) return undefined;
  let fromPackage: string;
  try {
    fromPackage = withoutScope(packageName());
  } catch {
    return undefined;
  }
  return explicit === fromPackage
    ? undefined
    : { appName: explicit, packageName: fromPackage };
};

export const APP_NAME = resolveAppName(process.env.APP_NAME);
export const APP_SHORT_NAME = APP_NAME.replace(/-backend$/, "");

const toTitleCase = (s: string): string =>
  s
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

export const APP_DISPLAY_NAME = toTitleCase(APP_SHORT_NAME);

/** `appNameMismatch` for this process's `APP_NAME`, for the entry points to log. */
export const currentAppNameMismatch = () =>
  appNameMismatch(process.env.APP_NAME);
