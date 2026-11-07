import fs from "fs";
import path from "path";

/**
 * Issue #272, ADR-0090. `start:staging` migrated and then started the server,
 * with `--migrations-path` on `node dist/server.js` instead of sequelize-cli, so
 * the migrations looked for a `migrations/` folder that does not exist and
 * staging could not start. Migrations are run by CI before a deploy, never by a
 * process that starts the app, and a migrate command carries both of its flags.
 */
const ROOT = path.resolve(__dirname, "../..");
const scripts = (
  JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf-8")) as {
    scripts: Record<string, string>;
  }
).scripts;

/** Each command a script chains with `&&`, `||` or `;`. */
const commands = (script: string) =>
  script.split(/&&|\|\||;/).map((command) => command.trim());

describe("package.json scripts (#272, ADR-0090)", () => {
  it("no script that starts the server or the worker runs migrations", () => {
    const starters = Object.entries(scripts).filter(([name]) =>
      /^(start|worker)(:|$)/.test(name),
    );

    expect(starters.length).toBeGreaterThan(0);
    expect(
      starters
        .filter(([, script]) => script.includes("sequelize-cli"))
        .map(([name]) => name),
    ).toEqual([]);
  });

  it("every migrate command passes its config and its migrations folder to sequelize-cli", () => {
    const migrateCommands = Object.entries(scripts).flatMap(([name, script]) =>
      commands(script)
        .filter((command) => /sequelize-cli db:migrate/.test(command))
        .map((command) => ({ name, command })),
    );

    expect(migrateCommands.length).toBeGreaterThan(0);
    expect(
      migrateCommands
        .filter(
          ({ command }) =>
            !command.includes("--config src/config/config.cjs") ||
            !command.includes("--migrations-path src/migrations"),
        )
        .map(({ name }) => name),
    ).toEqual([]);
  });
});
