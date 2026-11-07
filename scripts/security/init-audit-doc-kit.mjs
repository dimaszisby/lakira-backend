#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const TEMPLATE_DIR = path.join(
  ROOT,
  "docs/reference/security/audit-run-template",
);
const AUDIT_DIR = path.join(ROOT, "docs/internal/audits/security");

const TEMPLATE_MAP = [
  ["run-README.md", "README.md"],
  ["audit-plan.md", "audit-plan.md"],
  ["audit-checklist.md", "audit-checklist.md"],
  ["threat-model.md", "threat-model.md"],
  ["control-matrix.md", "control-matrix.md"],
  ["findings-log.md", "findings-log.md"],
  ["remediation-plan.md", "remediation-plan.md"],
  ["decisions.md", "decisions.md"],
  ["incidents.md", "incidents.md"],
  ["metrics-tracker.md", "metrics-tracker.md"],
  ["portfolio-summary.md", "portfolio-summary.md"],
];

const usage = () => {
  console.log(
    "Usage: node scripts/security/init-audit-doc-kit.mjs --date YYYY-MM-DD [--force]",
  );
};

const parseArgs = () => {
  const args = process.argv.slice(2);
  let date = null;
  let force = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--date") {
      date = args[i + 1] ?? null;
      i += 1;
    } else if (arg === "--force") {
      force = true;
    } else if (!arg.startsWith("--") && !date) {
      date = arg;
    }
  }

  return { date, force };
};

const isValidIsoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const replacePlaceholders = (template, date) => {
  const generatedAt = new Date().toISOString();
  return template
    .replaceAll("{{AUDIT_DATE}}", date)
    .replaceAll("{{AUDIT_DATE_COMPACT}}", date.replaceAll("-", ""))
    .replaceAll("{{GENERATED_AT_UTC}}", generatedAt);
};

const ensureTemplatesExist = async () => {
  for (const [templateName] of TEMPLATE_MAP) {
    const templatePath = path.join(TEMPLATE_DIR, templateName);
    try {
      await fs.access(templatePath);
    } catch {
      throw new Error(`Template not found: ${templatePath}`);
    }
  }
};

const hasAnyRequiredFiles = async (targetDir) => {
  try {
    const entries = await fs.readdir(targetDir);
    const required = new Set(TEMPLATE_MAP.map(([, out]) => out));
    return entries.some((entry) => required.has(entry));
  } catch {
    return false;
  }
};

const init = async () => {
  const { date, force } = parseArgs();

  if (!date || !isValidIsoDate(date)) {
    usage();
    throw new Error("Invalid or missing date. Expected YYYY-MM-DD.");
  }

  await ensureTemplatesExist();

  const targetDir = path.join(AUDIT_DIR, `audit-${date}`);
  const existsWithFiles = await hasAnyRequiredFiles(targetDir);

  if (existsWithFiles && !force) {
    throw new Error(
      `Audit folder already contains files: ${targetDir}. Use --force to overwrite template targets.`,
    );
  }

  await fs.mkdir(targetDir, { recursive: true });

  for (const [templateName, outputName] of TEMPLATE_MAP) {
    const templatePath = path.join(TEMPLATE_DIR, templateName);
    const outputPath = path.join(targetDir, outputName);
    const raw = await fs.readFile(templatePath, "utf8");
    const rendered = replacePlaceholders(raw, date);
    await fs.writeFile(outputPath, rendered, "utf8");
  }

  console.log(`[security:init] Initialized audit doc kit at ${targetDir}`);
  for (const [, outputName] of TEMPLATE_MAP) {
    console.log(
      `- ${path.join("docs/internal/audits/security", `audit-${date}`, outputName)}`,
    );
  }
};

init().catch((error) => {
  console.error(`[security:init] ${error.message}`);
  process.exit(1);
});
