#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

const defaults = {
  input: path.join(ROOT, "tmp/security/security-delta-report.json"),
  policy: path.join(ROOT, "docs/reference/security/ci-gate-policy.json"),
  output: path.join(ROOT, "tmp/security/security-gate-result.json"),
};

const parseArgs = () => {
  const args = process.argv.slice(2);
  const out = { ...defaults };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--input") {
      out.input = path.resolve(ROOT, args[i + 1]);
      i += 1;
    } else if (arg === "--policy") {
      out.policy = path.resolve(ROOT, args[i + 1]);
      i += 1;
    } else if (arg === "--output") {
      out.output = path.resolve(ROOT, args[i + 1]);
      i += 1;
    }
  }

  return out;
};

const readJson = async (filePath) => {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
};

const normalize = (v) =>
  String(v ?? "")
    .trim()
    .toLowerCase();

const isAcceptedExceptionValid = (finding, policy, now) => {
  const acceptedPolicy = policy.acceptedRisk ?? {};

  if (!acceptedPolicy.requireException)
    return { ok: true, reason: "no exception required" };

  const exception = finding.exception;
  if (!exception || typeof exception !== "object") {
    return { ok: false, reason: "missing exception metadata" };
  }

  const severity = normalize(finding.severity);
  const allowed = (acceptedPolicy.allowedSeverities ?? []).map(normalize);
  if (allowed.length > 0 && !allowed.includes(severity)) {
    return {
      ok: false,
      reason: `severity ${severity} not allowed for accepted risk`,
    };
  }

  const expiresRaw = exception.expiresAtUtc;
  const expiresAt = expiresRaw ? new Date(expiresRaw) : null;
  if (acceptedPolicy.requireFutureExpiry) {
    if (!expiresAt || Number.isNaN(expiresAt.getTime())) {
      return { ok: false, reason: "missing or invalid expiresAtUtc" };
    }
    if (expiresAt <= now) {
      return { ok: false, reason: "exception is expired" };
    }

    const maxDays = Number(acceptedPolicy.maxExpiryDays ?? 0);
    if (maxDays > 0) {
      const max = new Date(now);
      max.setUTCDate(max.getUTCDate() + maxDays);
      if (expiresAt > max) {
        return {
          ok: false,
          reason: `exception expiry exceeds max ${maxDays} days`,
        };
      }
    }
  }

  return { ok: true, reason: "accepted risk valid" };
};

const evaluate = (deltaReport, policy) => {
  const findings = Array.isArray(deltaReport.findings)
    ? deltaReport.findings
    : [];
  const failOn = new Set((policy.failOnSeverities ?? []).map(normalize));
  const openStatuses = new Set((policy.openStatuses ?? []).map(normalize));
  const resolvedStatuses = new Set(
    (policy.resolvedStatuses ?? []).map(normalize),
  );
  const acceptedStatus = normalize(policy.acceptedStatus ?? "accepted");
  const mediumLowRequiredFields = policy.mediumLowBacklog?.requiredFields ?? [
    "targetFixVersion",
    "slaDueDate",
  ];

  const now = new Date();
  const blockingFindings = [];
  const backlogWarnings = [];

  for (const finding of findings) {
    const severity = normalize(finding.severity);
    const status = normalize(finding.status || "open");

    if (failOn.has(severity)) {
      if (resolvedStatuses.has(status)) continue;

      if (status === acceptedStatus) {
        const check = isAcceptedExceptionValid(finding, policy, now);
        if (!check.ok) {
          blockingFindings.push({
            id: finding.id,
            severity,
            status,
            reason: `accepted risk invalid: ${check.reason}`,
          });
        }
        continue;
      }

      if (openStatuses.has(status) || !status) {
        blockingFindings.push({
          id: finding.id,
          severity,
          status: status || "open",
          reason: "unresolved high/critical finding",
        });
      }
    }

    if (severity === "medium" || severity === "low") {
      const missing = mediumLowRequiredFields.filter(
        (field) => finding[field] === undefined || finding[field] === "",
      );
      if (missing.length > 0) {
        backlogWarnings.push({
          id: finding.id,
          severity,
          missing,
          reason: "medium/low finding missing backlog tracking fields",
        });
      }
    }
  }

  const passed = blockingFindings.length === 0;

  return {
    passed,
    gateMode: policy.mode ?? "soft",
    evaluatedAtUtc: new Date().toISOString(),
    totals: {
      findings: findings.length,
      blocking: blockingFindings.length,
      backlogWarnings: backlogWarnings.length,
    },
    blockingFindings,
    backlogWarnings,
  };
};

const main = async () => {
  const { input, policy, output } = parseArgs();

  const [deltaReport, gatePolicy] = await Promise.all([
    readJson(input),
    readJson(policy),
  ]);

  const result = evaluate(deltaReport, gatePolicy);

  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify(result, null, 2), "utf8");

  console.log("[security:gate] Gate evaluation complete");
  console.log(`[security:gate] Output: ${path.relative(ROOT, output)}`);
  console.log(
    `[security:gate] passed=${result.passed} blocking=${result.totals.blocking} backlogWarnings=${result.totals.backlogWarnings}`,
  );

  if (!result.passed) {
    for (const blocked of result.blockingFindings) {
      console.error(
        `[security:gate] BLOCK: ${blocked.id} severity=${blocked.severity} status=${blocked.status} reason=${blocked.reason}`,
      );
    }
    process.exit(1);
  }
};

main().catch((error) => {
  console.error(`[security:gate] ${error.message}`);
  process.exit(1);
});
