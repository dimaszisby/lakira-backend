// scripts/generate-openapi.ts

import * as fs from "fs";
import logger from "../src/utils/logger.js";

import { getOpenApiDocumentation } from "../src/lib/openapi/openapi-docs.js";
import {
  OPENAPI_SPEC_DIR as outputDir,
  OPENAPI_SPEC_FILE as outputFile,
} from "./openapi-spec-path.js";

async function generateOpenApiSpec() {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const document = getOpenApiDocumentation();

  const payload = `${JSON.stringify(document, null, 2)}\n`;

  fs.writeFileSync(outputFile, payload, {
    encoding: "utf-8",
  });

  logger.info(`[OpenAPI] Specification generated at ${outputFile}`);
}

generateOpenApiSpec().catch((error) => {
  logger.error("[OpenAPI] Failed to generate specification:", error);
  process.exitCode = 1;
});
