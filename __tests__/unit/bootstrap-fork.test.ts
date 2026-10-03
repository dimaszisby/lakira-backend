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
  "docs/reference/api/lakira-backend-openapi.json",
];

const run = (dir: string, name: string): string =>
  execFileSync("bash", ["scripts/bootstrap-fork.sh", "--name", name], {
    cwd: dir,
    stdio: "pipe",
    encoding: "utf-8",
  });

// `prepare` runs in the scratch copy before the script, to stage a starting state.
const bootstrap = (
  name: string,
  prepare: (dir: string) => void = () => {},
): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bootstrap-fork-"));
  for (const file of FIXTURE_FILES) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, file), path.join(dir, file));
  }
  prepare(dir);
  run(dir, name);
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

  // Audit 2026-10-03, S2 to S4: three ways the script left a fork half-renamed.
  describe("the spec file, a hand-made .env, and a second run", () => {
    const read = (dir: string, file: string) =>
      fs.readFileSync(path.join(dir, file), "utf-8");
    const track = (dir: string) => {
      dirs.push(dir);
      return dir;
    };

    it("renames the spec file to the path docs:openapi:check names (S2)", () => {
      const dir = track(bootstrap("acme-api"));
      const check = JSON.parse(read(dir, "package.json")).scripts[
        "docs:openapi:check"
      ] as string;
      const specPath = check.match(/docs\/reference\/api\/\S+\.json/)?.[0];

      expect(specPath).toBe("docs/reference/api/acme-api-openapi.json");
      expect(fs.existsSync(path.join(dir, specPath as string))).toBe(true);
      expect(
        fs.existsSync(
          path.join(dir, "docs/reference/api/lakira-backend-openapi.json"),
        ),
      ).toBe(false);
    });

    it("renames a .env that was copied from the template first (S3)", () => {
      const dir = track(
        bootstrap("my-app", (scratch) => {
          fs.copyFileSync(
            path.join(scratch, ".env.example"),
            path.join(scratch, ".env"),
          );
          fs.copyFileSync(
            path.join(scratch, ".env.test.example"),
            path.join(scratch, ".env.test"),
          );
        }),
      );
      const env = readEnv(path.join(dir, ".env"));
      const envTest = readEnv(path.join(dir, ".env.test"));

      expect(env.DB_USER).toBe("my_app_user");
      expect(envTest.DB_USER).toBe(env.DB_USER);
      expect(envTest.DB_PASSWORD).toBe(env.DB_PASSWORD);
      expect(
        createdDatabases(path.join(dir, "docker/db/init/01-create-dbs.sql")),
      ).toEqual([envTest.DB_NAME]);
      expect(read(dir, ".env") + read(dir, ".env.test")).not.toMatch(
        /lakira_/i,
      );
    });

    it("creates .env and .env.test on a second run that finds neither (S4)", () => {
      const dir = track(bootstrap("my-app"));
      fs.rmSync(path.join(dir, ".env"));
      fs.rmSync(path.join(dir, ".env.test"));

      run(dir, "my-app");

      const env = readEnv(path.join(dir, ".env"));
      expect(env.APP_NAME).toBe("my-app");
      expect(env.DB_USER).toBe("my_app_user");
      expect(env.JWT_SECRET).toMatch(/^[0-9a-f]{64}$/);
      expect(readEnv(path.join(dir, ".env.test")).DB_USER).toBe("my_app_user");
    });

    it("changes nothing on a second run that finds both", () => {
      const dir = track(bootstrap("my-app"));
      const files = [
        ".env",
        ".env.test",
        "package.json",
        "FORKED-FROM.md",
        "docker/db/init/01-create-dbs.sql",
      ];
      const before = files.map((file) => read(dir, file));

      run(dir, "my-app");

      expect(files.map((file) => read(dir, file))).toEqual(before);
    });

    it("keeps the tree's name, and its secret, when re-run with another name", () => {
      const dir = track(bootstrap("acme-api"));
      const before = read(dir, ".env");

      const output = run(dir, "beta");

      expect(JSON.parse(read(dir, "package.json")).name).toBe("acme-api");
      expect(read(dir, ".env")).toBe(before);
      expect(output).toContain("Already renamed to 'acme-api'");
      expect(
        fs.existsSync(
          path.join(dir, "docs/reference/api/acme-api-openapi.json"),
        ),
      ).toBe(true);
    });

    it("leaves a user's own values alone in a hand-made .env", () => {
      const dir = track(
        bootstrap("my-app", (scratch) => {
          fs.writeFileSync(
            path.join(scratch, ".env"),
            [
              "DB_USER=lakira_user",
              "SMTP_FROM=Lakira Team <team@lakira.example.com>",
              "",
            ].join("\n"),
          );
        }),
      );
      const env = readEnv(path.join(dir, ".env"));

      expect(env.DB_USER).toBe("my_app_user");
      expect(env.SMTP_FROM).toBe("Lakira Team <team@lakira.example.com>");
    });

    it("refuses before renaming anything when the new spec path is taken", () => {
      const dir = track(
        fs.mkdtempSync(path.join(os.tmpdir(), "bootstrap-fork-")),
      );
      for (const file of FIXTURE_FILES) {
        fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
        fs.copyFileSync(path.join(ROOT, file), path.join(dir, file));
      }
      fs.writeFileSync(
        path.join(dir, "docs/reference/api/my-app-openapi.json"),
        "{}",
      );

      expect(() => run(dir, "my-app")).toThrow(/already exists/);
      expect(JSON.parse(read(dir, "package.json")).name).toBe("lakira-backend");
      expect(fs.existsSync(path.join(dir, ".env"))).toBe(false);
    });

    // The other cases run in a plain directory, where the spec is moved with mv.
    // In a checkout it is tracked, and the drift check compares against the index.
    it("stages the spec's rename when the tree is a git checkout", () => {
      const git = (dir: string, ...args: string[]) =>
        execFileSync("git", args, {
          cwd: dir,
          stdio: "pipe",
          encoding: "utf-8",
        });
      const dir = track(
        bootstrap("my-app", (scratch) => {
          git(scratch, "init", "--quiet");
          git(scratch, "add", "docs/reference/api/lakira-backend-openapi.json");
        }),
      );

      expect(git(dir, "status", "--porcelain", "docs/reference/api")).toContain(
        "A  docs/reference/api/my-app-openapi.json",
      );
      expect(git(dir, "diff", "--stat", "docs/reference/api")).toBe("");
    });
  });
});
