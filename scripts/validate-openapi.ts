import * as fs from "fs";
import logger from "./logger.js";
import { OPENAPI_SPEC_FILE as specFile } from "./openapi-spec-path.js";
import { validateOpenApiDocument } from "./openapi-checks.js";

/**
 * Structural validation of the generated OpenAPI document.
 *
 * `docs:openapi:check` only diffs the generated spec against the committed one, so a
 * spec that is *self-consistently* wrong passes it: both sides contain the same defect
 * and match perfectly. That is how a dangling
 * `#/components/responses/TooManyRequestsError` reached `dev` — it broke
 * lakira-frontend's `api:types:generate`, because this spec is a contract another repo
 * compiles against, while every gate here stayed green.
 *
 * This checks the document is *valid*, not merely *unchanged*.
 */

try {
  const doc = JSON.parse(fs.readFileSync(specFile, "utf-8")) as Record<
    string,
    unknown
  >;
  const { problems, operationCount, refCount, schemaCount } =
    validateOpenApiDocument(doc);

  logger.info(
    `[OpenAPI] Validated ${operationCount} operations, ${refCount} $refs, and ${schemaCount} schemas.`,
  );

  if (problems.length > 0) {
    logger.error(
      `[OpenAPI] Specification is invalid — ${problems.length} problem(s):`,
    );
    problems.forEach((p) => logger.error(`  - ${p}`));
    process.exit(1);
  }

  logger.info("[OpenAPI] Specification is structurally valid.");
} catch (error) {
  logger.error("[OpenAPI] Failed to validate specification:", error);
  process.exit(1);
}
