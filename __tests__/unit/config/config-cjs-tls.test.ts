import { describe, it, expect } from "@jest/globals";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Kit database-tls-and-staging-refusals, D-01 (audit 2026-10-20, X1). The
 * migration config reads process.env itself, outside the Zod schema, so it
 * refuses an unverified production connection on its own. Loaded in a child
 * process with an environment of its own, from an empty directory, so no .env
 * file is read.
 */
const CONFIG = path.resolve(__dirname, "../../../src/config/config.cjs");
const URL_PASSWORD = "Pw-not-to-be-printed";

const load = (env: Record<string, string>) => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "config-cjs-"));
  try {
    return spawnSync(
      process.execPath,
      ["-e", `require(${JSON.stringify(CONFIG)})`],
      { cwd, env, encoding: "utf-8" },
    );
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
};

const productionWith = (rejectUnauthorized: string) =>
  load({
    NODE_ENV: "production",
    PRODUCTION_DATABASE_URL: `postgres://app:${URL_PASSWORD}@db.example:5432/app`,
    DB_SSL_REJECT_UNAUTHORIZED: rejectUnauthorized,
  });

describe("config.cjs and DB_SSL_REJECT_UNAUTHORIZED", () => {
  it("refuses false in production, naming the variable and not the URL", () => {
    const result = productionWith("false");

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("DB_SSL_REJECT_UNAUTHORIZED");
    expect(result.stderr).not.toContain(URL_PASSWORD);
  });

  it("hands the migrations the CA in DB_SSL_CA (D-04)", () => {
    const ca =
      "-----BEGIN CERTIFICATE-----\nMIIBfake\n-----END CERTIFICATE-----";
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "config-cjs-"));
    try {
      const result = spawnSync(
        process.execPath,
        [
          "-e",
          `process.stdout.write(JSON.stringify(require(${JSON.stringify(CONFIG)}).production.dialectOptions.ssl))`,
        ],
        {
          cwd,
          encoding: "utf-8",
          env: {
            NODE_ENV: "production",
            PRODUCTION_DATABASE_URL: "postgres://app:pw@db.example:5432/app",
            // One line, as a platform may store it.
            DB_SSL_CA: ca.replace(/\n/g, "\\n"),
          },
        },
      );

      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        rejectUnauthorized: true,
        ca,
      });
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("loads with true in production", () => {
    expect(productionWith("true").status).toBe(0);
  });

  it("loads with false in staging, the explicit opt-out", () => {
    const result = load({
      NODE_ENV: "staging",
      STAGING_DATABASE_URL: `postgres://app:${URL_PASSWORD}@db.example:5432/app`,
      DB_SSL_REJECT_UNAUTHORIZED: "false",
    });

    expect(result.status).toBe(0);
  });
});
