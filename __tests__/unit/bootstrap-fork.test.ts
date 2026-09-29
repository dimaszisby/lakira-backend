import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

/**
 * SaaS-readiness caveat C1 (audit-2026-09-29 § 5): a fresh fork's `npm test` failed because
 * bootstrap-fork.sh renamed the database credentials in `.env` but not in `.env.test` or the
 * init SQL. This runs the real script in a scratch copy holding only the files it rewrites, and
 * checks that the three files the test chain reads agree with each other.
 */
const ROOT = path.resolve(__dirname, "../..");
const FIXTURE_FILES = [
  "scripts/bootstrap-fork.sh",
  "package.json",
  ".env.example",
  ".env.test.example",
  "docker/db/init/01-create-dbs.sql",
];

const bootstrap = (name: string): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bootstrap-fork-"));
  for (const file of FIXTURE_FILES) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, file), path.join(dir, file));
  }
  execFileSync("bash", ["scripts/bootstrap-fork.sh", "--name", name], {
    cwd: dir,
    stdio: "pipe",
  });
  return dir;
};

const readEnv = (file: string): Record<string, string> =>
  Object.fromEntries(
    fs
      .readFileSync(file, "utf-8")
      .split("\n")
      .map((line) => line.match(/^([A-Z0-9_]+)=(.*)$/))
      .filter((match): match is RegExpMatchArray => match !== null)
      .map((match) => [match[1], match[2].trim()]),
  );

const createdDatabases = (file: string): string[] =>
  [...fs.readFileSync(file, "utf-8").matchAll(/^CREATE DATABASE (\S+);/gm)].map(
    (match) => match[1],
  );

// A Postgres identifier that is valid without quoting.
const UNQUOTED_IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

// This checks the template, so it only means something before the tree is forked. In a fork the
// script exits early ("Already renamed") and the templates no longer carry `lakira_`; the Fork
// Smoke workflow (ADR-0051) covers a fork end to end instead.
const IS_TEMPLATE =
  JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf-8")).name ===
  "lakira-backend";
const describeTemplate = IS_TEMPLATE ? describe : describe.skip;

describeTemplate("bootstrap-fork.sh (SaaS-readiness C1)", () => {
  const dirs: string[] = [];
  afterAll(() => {
    for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
  });

  describe.each([
    ["my-app", "my_app"],
    ["acme-backend", "acme"],
  ])("--name %s", (name, slug) => {
    let dir: string;
    let env: Record<string, string>;
    let envTest: Record<string, string>;
    let databases: string[];

    beforeAll(() => {
      dir = bootstrap(name);
      dirs.push(dir);
      env = readEnv(path.join(dir, ".env"));
      envTest = readEnv(path.join(dir, ".env.test"));
      databases = createdDatabases(
        path.join(dir, "docker/db/init/01-create-dbs.sql"),
      );
    });

    it("gives .env.test the same database login that Compose creates from .env", () => {
      expect(envTest.DB_USER).toBe(env.DB_USER);
      expect(envTest.DB_PASSWORD).toBe(env.DB_PASSWORD);
    });

    it("creates, in the init SQL, the test database that .env.test names", () => {
      expect(databases).toEqual([envTest.DB_NAME]);
    });

    it("points TEST_DATABASE_URL at that login and database", () => {
      const url = new URL(envTest.TEST_DATABASE_URL);
      expect(url.username).toBe(envTest.DB_USER);
      expect(url.password).toBe(envTest.DB_PASSWORD);
      expect(url.pathname).toBe(`/${envTest.DB_NAME}`);
    });

    it(`derives every database identifier from "${slug}", valid without quoting`, () => {
      for (const identifier of [
        env.DB_USER,
        env.DB_NAME,
        envTest.DB_USER,
        envTest.DB_NAME,
        ...databases,
      ]) {
        expect(identifier).toMatch(UNQUOTED_IDENTIFIER);
        expect(identifier.startsWith(`${slug}_`)).toBe(true);
      }
    });

    it("leaves no upstream identifier in the files the test chain reads", () => {
      for (const file of [
        ".env",
        ".env.test",
        "docker/db/init/01-create-dbs.sql",
      ]) {
        expect(fs.readFileSync(path.join(dir, file), "utf-8")).not.toMatch(
          /lakira_/i,
        );
      }
    });
  });
});
