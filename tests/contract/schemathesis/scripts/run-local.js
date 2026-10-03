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
const seedPath = path.join(repoRoot, "tmp", "contract-seed.json");
const DEFAULT_HOOK_MODULE =
  process.env.SCHEMATHESIS_HOOKS ?? "tests.contract.hooks.seeded_ids";
const hookFilePath = path.join(
  repoRoot,
  "tests",
  "contract",
  "hooks",
  "seeded_ids.py",
);

const DEFAULT_TAGS =
  process.env.SCHEMATHESIS_LOCAL_ENDPOINT_TAGS ??
  "Auth,Analytics,Metrics,Metric Logs,Metric Settings,Metric Categories,Trends,Organizations";
// Operations inside an included tag that the gate cannot fuzz meaningfully. Each is
// passed as --exclude-name, and each carries its reason (fuzz-organization-routes kit).
const EXCLUDED_OPERATIONS = [
  {
    name: "POST /invites/accept",
    // A valid token exists only in an invite email, so every generated body is a random
    // token the API rightly answers with 400. Included, it passes but tests only that
    // rejection and adds a "schema validation mismatch" warning (observed 2026-09-29).
    reason: "no reachable valid token; would test only the 400 path",
  },
];
const HEALTH_TIMEOUT_MS = Number(
  process.env.SCHEMATHESIS_HEALTH_TIMEOUT_MS ?? 10000,
);
const LOCAL_PROFILE_PRESETS = {
  quick: {
    mode: "positive",
    checks:
      "not_a_server_error,status_code_conformance,content_type_conformance,response_headers_conformance,response_schema_conformance,positive_data_acceptance",
    phases: "examples",
    workers: "2",
    maxExamples: "10",
    maxFailures: "10",
    suppressHealthChecks: "too_slow,filter_too_much",
  },
  gate: {
    mode: "positive",
    checks:
      "not_a_server_error,status_code_conformance,content_type_conformance,response_headers_conformance,response_schema_conformance,positive_data_acceptance",
    phases: "examples,coverage,fuzzing",
    workers: "2",
    maxExamples: "15",
    maxFailures: "15",
    suppressHealthChecks: "too_slow,filter_too_much",
    // Fixed, arbitrary seed: a gate verdict must be reproducible on an
    // unchanged tree. `full` and `exploratory` deliberately have no preset
    // seed so they keep drawing fresh Hypothesis input each run.
    seed: "42",
  },
  full: {
    mode: "positive",
    checks:
      "not_a_server_error,status_code_conformance,content_type_conformance,response_headers_conformance,response_schema_conformance,positive_data_acceptance",
    phases: "examples,coverage,fuzzing,stateful",
    workers: "4",
    maxExamples: "50",
    maxFailures: "30",
    suppressHealthChecks: "too_slow,filter_too_much",
  },
  exploratory: {
    mode: "all",
    checks: "all",
    phases: "examples,coverage,fuzzing,stateful",
    workers: "4",
    maxExamples: "50",
  },
};

function buildTags(tagString) {
  return tagString
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function runCommand(command, args, options = {}) {
  const { captureStdout, ...spawnOptions } = options;
  return new Promise((resolve, reject) => {
    const stdio = captureStdout ? ["inherit", "pipe", "inherit"] : "inherit";
    const child = spawn(command, args, { stdio, ...spawnOptions });
    let capturedStdout = "";
    if (captureStdout) {
      child.stdout.on("data", (chunk) => {
        process.stdout.write(chunk);
        capturedStdout += chunk.toString();
      });
    }
    child.on("error", (error) => {
      error.capturedStdout = capturedStdout;
      reject(error);
    });
    child.on("exit", (code) => {
      if (code === 0) {
        resolve(capturedStdout);
        return;
      }

      const error = new Error(
        `Command "${[command, ...args].join(" ")}" exited with code ${code}`,
      );
      error.capturedStdout = capturedStdout;
      reject(error);
    });
  });
}

async function writeEffectiveSeed(reportDir, capturedStdout) {
  const match = capturedStdout?.match(/^Seed:\s*(\S+)/m);
  if (!match) {
    return;
  }
  await fs.writeFile(path.join(reportDir, "seed.txt"), `${match[1]}\n`);
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

function resolveLocalProfile(input) {
  const raw = String(input ?? "quick")
    .trim()
    .toLowerCase();
  if (raw in LOCAL_PROFILE_PRESETS) {
    return raw;
  }
  logger.warn(
    `[schemathesis:local] Unknown SCHEMATHESIS_LOCAL_PROFILE="${raw}". Falling back to "quick".`,
  );
  return "quick";
}

async function main() {
  const baseUrl =
    process.env.SCHEMATHESIS_LOCAL_BASE_URL ?? "http://localhost:4000/api/v1";
  let seedData = null;
  try {
    const raw = await fs.readFile(seedPath, "utf8");
    seedData = JSON.parse(raw);
  } catch {
    // Seed file is optional; hooks will no-op if absent.
  }

  const token =
    process.env.SCHEMATHESIS_LOCAL_TOKEN ?? seedData?.primaryUser?.token;
  if (!token) {
    logger.error(
      "[schemathesis:local] Missing SCHEMATHESIS_LOCAL_TOKEN. Export a contract-test JWT (see tmp/contract-seed.json).",
    );
    process.exitCode = 1;
    return;
  }

  try {
    await fs.access(specPath);
  } catch {
    logger.error(
      `[schemathesis:local] OpenAPI spec not found at ${specPath}. Run "npm run docs:openapi:generate" first.`,
    );
    process.exitCode = 1;
    return;
  }

  const healthUrl = `${baseUrl.replace(/\/$/, "")}/health`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  try {
    const response = await fetch(healthUrl, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(
        `[schemathesis:local] Healthcheck at ${healthUrl} returned ${response.status}.`,
      );
    }
  } catch (error) {
    logger.error(
      `[schemathesis:local] Backend not reachable at ${healthUrl}. Start the server via "npm run contract:local:full" or ensure "npm run start:test" is running with DISABLE_RATE_LIMITING=true.`,
    );
    logger.error(error.message);
    process.exitCode = 1;
    return;
  } finally {
    clearTimeout(timer);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportBaseDir = path.join(schemathesisDir, "reports", "local");
  await fs.mkdir(reportBaseDir, { recursive: true });
  const reportDir = path.join(reportBaseDir, timestamp);
  await fs.mkdir(reportDir, { recursive: true });

  const junitPath = path.join(reportDir, "schemathesis-local.xml");
  const harPath = path.join(reportDir, "schemathesis-local.har");
  const profile = resolveLocalProfile(process.env.SCHEMATHESIS_LOCAL_PROFILE);
  const preset = LOCAL_PROFILE_PRESETS[profile];
  const mode = process.env.SCHEMATHESIS_LOCAL_MODE ?? preset.mode;
  const checks =
    process.env.SCHEMATHESIS_LOCAL_CHECKS ?? preset.checks ?? "all";
  const phases = process.env.SCHEMATHESIS_LOCAL_PHASES ?? preset.phases;
  const workers = process.env.SCHEMATHESIS_LOCAL_WORKERS ?? preset.workers;
  const maxExamples =
    process.env.SCHEMATHESIS_LOCAL_MAX_EXAMPLES ?? preset.maxExamples;
  const suppressHealthChecks =
    process.env.SCHEMATHESIS_LOCAL_SUPPRESS_HEALTH_CHECKS ??
    preset.suppressHealthChecks;
  const maxFailures =
    process.env.SCHEMATHESIS_LOCAL_MAX_FAILURES ?? preset.maxFailures;
  const requestTimeout = process.env.SCHEMATHESIS_LOCAL_REQUEST_TIMEOUT;
  const seed = process.env.SCHEMATHESIS_LOCAL_SEED ?? preset.seed;
  const cli = resolveSchemathesisCli();

  const args = [
    "run",
    specPath,
    "--url",
    baseUrl,
    "--mode",
    mode,
    "--checks",
    checks,
    "--phases",
    phases,
    "--workers",
    workers,
    "--max-examples",
    maxExamples,
    "--report",
    "junit,har",
    "--report-junit-path",
    junitPath,
    "--report-har-path",
    harPath,
    "--header",
    `Authorization: Bearer ${token}`,
  ];
  if (suppressHealthChecks) {
    suppressHealthChecks
      .split(",")
      .map((check) => check.trim())
      .filter(Boolean)
      .forEach((check) => {
        args.push("--suppress-health-check", check);
      });
  }
  if (maxFailures) {
    args.push("--max-failures", maxFailures);
  }
  if (requestTimeout) {
    args.push("--request-timeout", requestTimeout);
  }
  if (seed) {
    args.push("--seed", seed);
  }
  try {
    await fs.access(hookFilePath);
  } catch {
    logger.warn(
      `[schemathesis:local] Hooks file missing at ${hookFilePath}. Seeded ID overrides will be skipped.`,
    );
  }

  const tags = buildTags(DEFAULT_TAGS);
  tags.forEach((tag) => {
    args.push("--include-tag", tag);
  });

  EXCLUDED_OPERATIONS.forEach(({ name }) => {
    args.push("--exclude-name", name);
  });

  if (process.env.SCHEMATHESIS_LOCAL_ENDPOINTS) {
    process.env.SCHEMATHESIS_LOCAL_ENDPOINTS.split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .forEach((endpoint) => {
        args.push("--include-operation-id", endpoint);
      });
  }

  logger.info(
    `[schemathesis:local] Profile "${profile}" resolved to mode=${mode}, phases=${phases}, workers=${workers}, maxExamples=${maxExamples}, maxFailures=${maxFailures ?? "unset"}, suppressHealthChecks=${suppressHealthChecks ?? "unset"}, seed=${seed ?? 'unset (Schemathesis will pick one and print it as "Seed: <value>" at the end of this run)'}.`,
  );
  logger.info(`[schemathesis:local] Using Schemathesis CLI: ${cli}`);
  logger.info("[schemathesis:local] Running Schemathesis with args:", args);

  try {
    const env = {
      ...process.env,
      SCHEMATHESIS_LOCAL_TOKEN: token,
      SCHEMATHESIS_LOCAL_MODE_EFFECTIVE: mode,
      SCHEMATHESIS_SEED_FILE: process.env.SCHEMATHESIS_SEED_FILE ?? seedPath,
      SCHEMATHESIS_HOOKS: process.env.SCHEMATHESIS_HOOKS ?? DEFAULT_HOOK_MODULE,
      PYTHONPATH: [repoRoot, process.env.PYTHONPATH]
        .filter(Boolean)
        .join(path.delimiter),
    };
    const capturedStdout = await runCommand(cli, args, {
      cwd: repoRoot,
      env,
      captureStdout: true,
    });
    await writeEffectiveSeed(reportDir, capturedStdout);
    logger.info(
      `[schemathesis:local] Completed. Reports stored under ${reportDir}`,
    );
  } catch (error) {
    await writeEffectiveSeed(reportDir, error.capturedStdout);
    if (error.code === "ENOENT") {
      logger.error(
        `[schemathesis:local] Unable to find "${cli}". Install Schemathesis via "pip install -r tests/contract/schemathesis/requirements.txt" or point SCHEMATHESIS_CLI to the binary.`,
      );
    } else {
      logger.error("[schemathesis:local] Schemathesis run failed", error);
    }
    process.exitCode = 1;
  }
}

main();
