#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import { spawn } from "node:child_process";
import logger from "../../../../scripts/logger.js";
import { OPENAPI_SPEC_FILE } from "../../../../scripts/openapi-spec-path.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../../../..");
const schemathesisDir = path.join(
  repoRoot,
  "tests",
  "contract",
  "schemathesis",
);
const specPath = OPENAPI_SPEC_FILE;

const DEFAULT_TAGS =
  process.env.SCHEMATHESIS_STAGING_ENDPOINT_TAGS ??
  "Auth,Analytics,Metrics,Metric Logs,Metric Settings,Metric Categories,Trends";

function buildTags(tagString) {
  return tagString
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", ...options });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve(undefined);
        return;
      }

      reject(
        new Error(
          `Command "${[command, ...args].join(" ")}" exited with code ${code}`,
        ),
      );
    });
  });
}

function findBundledSchemathesisCli() {
  const candidates = [
    path.join(repoRoot, ".venv-schemathesis", "bin", "schemathesis"),
    path.join(
      repoRoot,
      ".venv-schemathesis",
      "Scripts",
      process.platform === "win32" ? "schemathesis.exe" : "schemathesis",
    ),
  ];
  return candidates.find((candidate) => fsSync.existsSync(candidate));
}

function resolveSchemathesisCli() {
  const configured = process.env.SCHEMATHESIS_CLI?.trim();
  if (configured) {
    return configured;
  }
  return findBundledSchemathesisCli() ?? "schemathesis";
}

async function main() {
  const baseUrl = process.env.SCHEMATHESIS_STAGING_BASE_URL;
  const token = process.env.SCHEMATHESIS_STAGING_TOKEN;
  const cli = resolveSchemathesisCli();
  if (!baseUrl || !token) {
    logger.error(
      "[schemathesis:staging] Missing SCHEMATHESIS_STAGING_BASE_URL or SCHEMATHESIS_STAGING_TOKEN environment variables.",
    );
    process.exitCode = 1;
    return;
  }

  try {
    await fs.access(specPath);
  } catch {
    logger.error(
      `[schemathesis:staging] OpenAPI spec not found at ${specPath}. Run "npm run docs:openapi:generate" before executing Schemathesis.`,
    );
    process.exitCode = 1;
    return;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportDir = path.join(schemathesisDir, "reports", "staging", timestamp);
  await fs.mkdir(reportDir, { recursive: true });

  const junitPath = path.join(reportDir, "schemathesis-staging.xml");
  const harPath = path.join(reportDir, "schemathesis-staging.har");

  const args = [
    "run",
    specPath,
    "--url",
    baseUrl,
    "--checks",
    "all",
    "--phases",
    process.env.SCHEMATHESIS_STAGING_PHASES ??
      "examples,coverage,fuzzing,stateful",
    "--workers",
    process.env.SCHEMATHESIS_STAGING_WORKERS ?? "auto",
    "--max-examples",
    process.env.SCHEMATHESIS_STAGING_MAX_EXAMPLES ?? "50",
    "--report",
    "junit,har",
    "--report-junit-path",
    junitPath,
    "--report-har-path",
    harPath,
    "--header",
    `Authorization: Bearer ${token}`,
  ];

  const tags = buildTags(DEFAULT_TAGS);
  tags.forEach((tag) => {
    args.push("--include-tag", tag);
  });

  if (process.env.SCHEMATHESIS_STAGING_ENDPOINTS) {
    process.env.SCHEMATHESIS_STAGING_ENDPOINTS.split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .forEach((endpoint) => {
        args.push("--include-operation-id", endpoint);
      });
  }

  logger.info("[schemathesis:staging] Running Schemathesis with args:", args);
  logger.info(`[schemathesis:staging] Using Schemathesis CLI: ${cli}`);

  try {
    await runCommand(cli, args, { cwd: repoRoot });
    logger.info(
      `[schemathesis:staging] Completed. Reports stored under ${reportDir}`,
    );
  } catch (error) {
    if (error.code === "ENOENT") {
      logger.error(
        `[schemathesis:staging] Unable to find "${cli}". Install Schemathesis via "pip install -r tests/contract/schemathesis/requirements.txt" or point SCHEMATHESIS_CLI to the binary.`,
      );
    } else {
      logger.error("[schemathesis:staging] Schemathesis run failed", error);
    }
    process.exitCode = 1;
  }
}

main();
