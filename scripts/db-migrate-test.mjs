#!/usr/bin/env node
/**
 * Helper script for `npm run db:migrate:test`.
 * Loads `.env.test` (if present) and runs Sequelize migrations against the test DB.
 */
import { spawn } from "child_process";
import path from "path";
import dotenv from "dotenv";
import logger from "./logger.js";

const cwd = process.cwd();
const envPath = path.resolve(cwd, ".env.test");
const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";

dotenv.config({ path: envPath, override: false });

const runCommand = (command, args, envOverrides = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      env: { ...process.env, ...envOverrides },
    });

    child.on("error", (error) => reject(error));
    child.on("exit", (code) => {
      if (code === 0) {
        resolve(undefined);
      } else {
        reject(
          new Error(`${command} ${args.join(" ")} exited with code ${code}`),
        );
      }
    });
  });

const run = async () => {
  await runCommand(
    npxCmd,
    [
      "sequelize-cli",
      "db:migrate",
      "--config",
      "src/config/config.cjs",
      // Passed explicitly rather than via .sequelizerc: that file used CommonJS
      // `require()` inside an ESM package, which only resolved on Node 20.
      "--migrations-path",
      "src/migrations",
    ],
    { NODE_ENV: "test" },
  );
};

run().catch((error) => {
  logger.error("[db-migrate-test] Migration failed", error);
  process.exitCode = 1;
});
