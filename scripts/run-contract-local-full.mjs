#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const tmpDir = path.join(repoRoot, "tmp");
const backendLogPath = path.join(tmpDir, "backend-contract.log");
const contractPort = Number(process.env.CONTRACT_LOCAL_PORT ?? 4000);
const contractBaseUrl =
  process.env.CONTRACT_LOCAL_BASE_URL ??
  `http://localhost:${contractPort}/api/v1`;
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";

function findLocalSchemathesisCLI() {
  const candidates = [
    path.join(repoRoot, ".venv-schemathesis", "bin", "schemathesis"),
    path.join(
      repoRoot,
      ".venv-schemathesis",
      "Scripts",
      process.platform === "win32" ? "schemathesis.exe" : "schemathesis",
    ),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function runStep(label, command, options = {}) {
  console.log(`\n[contract-local] ${label}`);
  const result = spawnSync(command, {
    cwd: repoRoot,
    env: { ...process.env, ...options.env },
    stdio: "inherit",
    shell: true,
  });
  if (result.status !== 0) {
    throw new Error(
      `[contract-local] Step "${label}" failed with exit code ${result.status}`,
    );
  }
}

function resolveContractToken() {
  if (process.env.SCHEMATHESIS_LOCAL_TOKEN) {
    return process.env.SCHEMATHESIS_LOCAL_TOKEN;
  }
  try {
    const seedPath = path.join(repoRoot, "tmp", "contract-seed.json");
    const parsed = JSON.parse(fs.readFileSync(seedPath, "utf8"));
    return parsed?.primaryUser?.token ?? null;
  } catch {
    return null;
  }
}

function startBackend() {
  console.log(
    `[contract-local] Starting backend server on port ${contractPort} (logs → ${backendLogPath})`,
  );
  const logStream = fs.createWriteStream(backendLogPath, { flags: "w" });
  const server = spawn(npmCmd, ["run", "start:test"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      DISABLE_RATE_LIMITING: "true",
      PORT: String(contractPort),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const forward = (chunk, writer) => {
    writer.write(chunk);
    logStream.write(chunk);
  };
  server.stdout.on("data", (chunk) => forward(chunk, process.stdout));
  server.stderr.on("data", (chunk) => forward(chunk, process.stderr));
  server.on("close", () => logStream.end());

  return server;
}

async function stopBackend(server) {
  if (!server) return;
  if (server.exitCode !== null || server.signalCode) return;
  console.log("[contract-local] Stopping backend server…");
  await new Promise((resolve) => {
    server.once("close", resolve);
    server.kill();
  });
}

async function main() {
  fs.mkdirSync(tmpDir, { recursive: true });
  runStep("Build backend", `${npmCmd} run build`);
  runStep("Generate OpenAPI spec", `${npmCmd} run docs:openapi:generate`);
  runStep("Run DB migrations (test)", `${npmCmd} run db:migrate:test`);
  runStep("Seed contract fixtures", `${npmCmd} run seed:contract-tests`);

  const server = startBackend();

  try {
    runStep(
      `Wait for tcp:${contractPort}`,
      `${npxCmd} wait-on tcp:${contractPort} --timeout 180000`,
    );
    runStep(
      "Wait for /api/v1/health",
      `${npxCmd} wait-on ${contractBaseUrl}/health --timeout 180000`,
    );

    const token = resolveContractToken();
    if (!token) {
      throw new Error(
        "[contract-local] Unable to resolve Schemathesis token (tmp/contract-seed.json missing).",
      );
    }
    const schemathesisCli =
      process.env.SCHEMATHESIS_CLI ??
      findLocalSchemathesisCLI() ??
      "schemathesis";
    const schemathesisProfile =
      process.env.SCHEMATHESIS_LOCAL_PROFILE ?? "full";
    runStep(
      `Run Schemathesis suite (profile: ${schemathesisProfile})`,
      `${npmCmd} run test:contract:schemathesis:local`,
      {
        env: {
          SCHEMATHESIS_LOCAL_TOKEN: token,
          SCHEMATHESIS_LOCAL_BASE_URL: contractBaseUrl,
          SCHEMATHESIS_LOCAL_PROFILE: schemathesisProfile,
          SCHEMATHESIS_CLI: schemathesisCli,
        },
      },
    );

    console.log(
      "\n[contract-local] All contract suites finished successfully.",
    );
  } finally {
    await stopBackend(server);
  }
}

main().catch((error) => {
  console.error("[contract-local] Full run failed:", error.message);
  process.exitCode = 1;
});
