import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Where the generated OpenAPI spec lives. The one definition: the generator, the
 * normalizer, the validator and the contract-test runners all import it. Plain
 * JavaScript, like `scripts/logger.js`, so the runners can import it under Node
 * without tsx.
 *
 * The file is named after the package, because `scripts/bootstrap-fork.sh`
 * renames the package and with it the path in `docs:openapi:check`. When each
 * script carried the filename as a literal, a fork's gate looked for a file
 * nothing wrote (audit 2026-10-03, S2).
 */
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

/** @type {{ name?: unknown }} */
const { name: packageName } = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "package.json"), "utf-8"),
);

if (typeof packageName !== "string" || packageName.length === 0) {
  throw new Error(
    "package.json has no name, so the OpenAPI spec path cannot be derived.",
  );
}

export const OPENAPI_SPEC_DIR = path.join(repoRoot, "docs/reference/api");

export const OPENAPI_SPEC_FILE = path.join(
  OPENAPI_SPEC_DIR,
  `${packageName}-openapi.json`,
);
