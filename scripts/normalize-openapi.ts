import * as fs from "fs";
import prettier from "prettier";
import logger from "./logger.js";
import { OPENAPI_SPEC_FILE as outputFile } from "./openapi-spec-path.js";

async function normalizeOpenApiSpec() {
  const raw = fs.readFileSync(outputFile, "utf-8");
  const prettierConfig = (await prettier.resolveConfig(outputFile)) ?? {};

  const formatted = await prettier.format(raw, {
    ...prettierConfig,
    filepath: outputFile,
    parser: "json",
  });

  fs.writeFileSync(outputFile, formatted, { encoding: "utf-8" });
}

normalizeOpenApiSpec().catch((error) => {
  logger.error("[OpenAPI] Failed to normalize specification:", error);
  process.exitCode = 1;
});
