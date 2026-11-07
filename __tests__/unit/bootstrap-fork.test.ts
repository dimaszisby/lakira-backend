import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { withTestEnv } from "../helpers/env-test-utils.js";

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
  "docker-compose.yml",
  "scripts/unlink-internal-docs.js",
  ".github/ISSUE_TEMPLATE/config.yml",
  "SECURITY.md",
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

// What bootstrap generates: `openssl rand -hex 24`.
const GENERATED_PASSWORD = /^[0-9a-f]{48}$/;

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
    // Only "-backend" is stripped, as src/config/app-name.ts does (B-51, D-07).
    ["acme-api", "acme_api"],
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

    // Audit 2026-10-03, S10: the password was `<slug>_password`, which anyone can guess.
    it("generates the database password", () => {
      expect(env.DB_PASSWORD).toMatch(GENERATED_PASSWORD);
    });

    it("writes it to every URL that logs in as the database user", () => {
      for (const url of [
        env.DEVELOPMENT_DATABASE_URL,
        env.TEST_DATABASE_URL,
        envTest.TEST_DATABASE_URL,
      ]) {
        expect(new URL(url).username).toBe(env.DB_USER);
        expect(new URL(url).password).toBe(env.DB_PASSWORD);
      }
    });

    it("leaves the URLs of another login alone", () => {
      expect(new URL(env.STAGING_DATABASE_URL).password).toBe("postgres");
      expect(new URL(env.PRODUCTION_DATABASE_URL).password).toBe("postgres");
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

    // Item 8 of the bootstrap review (fork-bootstrap-leftovers D-06): the broker
    // kept guest/guest, with its management UI on 127.0.0.1:15672.
    it("generates the broker login, the same in .env and .env.test", () => {
      expect(env.RABBITMQ_USER).toBe(slug);
      expect(env.RABBITMQ_PASSWORD).toMatch(GENERATED_PASSWORD);
      expect(env.RABBITMQ_PASSWORD).not.toBe(env.DB_PASSWORD);
      expect(envTest.RABBITMQ_USER).toBe(env.RABBITMQ_USER);
      expect(envTest.RABBITMQ_PASSWORD).toBe(env.RABBITMQ_PASSWORD);
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
      const envTest = readEnv(path.join(dir, ".env.test"));
      expect(envTest.DB_USER).toBe("my_app_user");
      expect(env.DB_PASSWORD).toMatch(GENERATED_PASSWORD);
      expect(envTest.DB_PASSWORD).toBe(env.DB_PASSWORD);
      expect(new URL(envTest.TEST_DATABASE_URL).password).toBe(env.DB_PASSWORD);
    });

    it("gives a new .env.test the password of the .env that is already there", () => {
      const dir = track(bootstrap("my-app"));
      const before = read(dir, ".env");
      fs.rmSync(path.join(dir, ".env.test"));

      run(dir, "my-app");

      const env = readEnv(path.join(dir, ".env"));
      const envTest = readEnv(path.join(dir, ".env.test"));
      expect(read(dir, ".env")).toBe(before);
      expect(envTest.DB_PASSWORD).toBe(env.DB_PASSWORD);
      expect(new URL(envTest.TEST_DATABASE_URL).password).toBe(env.DB_PASSWORD);
    });

    it("replaces the template password in env files copied by hand first", () => {
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

      expect(env.DB_PASSWORD).toMatch(GENERATED_PASSWORD);
      expect(envTest.DB_PASSWORD).toBe(env.DB_PASSWORD);
      expect(read(dir, ".env") + read(dir, ".env.test")).not.toMatch(
        /_password/,
      );
    });

    it("gives a hand-copied .env.test the password the user chose in .env", () => {
      const dir = track(
        bootstrap("my-app", (scratch) => {
          fs.writeFileSync(
            path.join(scratch, ".env"),
            ["DB_USER=lakira_user", "DB_PASSWORD=chosen-by-hand", ""].join(
              "\n",
            ),
          );
          fs.copyFileSync(
            path.join(scratch, ".env.test.example"),
            path.join(scratch, ".env.test"),
          );
        }),
      );
      const envTest = readEnv(path.join(dir, ".env.test"));

      expect(envTest.DB_PASSWORD).toBe("chosen-by-hand");
      expect(new URL(envTest.TEST_DATABASE_URL).password).toBe(
        "chosen-by-hand",
      );
    });

    // What a first run leaves when it stops after the renames: the tree reads as
    // already renamed, and .env still holds the template's secrets.
    it("finishes an .env that a run stopped part-way left on the template's secrets", () => {
      const dir = track(bootstrap("my-app"));
      fs.copyFileSync(path.join(dir, ".env.example"), path.join(dir, ".env"));
      fs.rmSync(path.join(dir, ".env.test"));

      const output = run(dir, "my-app");

      const env = readEnv(path.join(dir, ".env"));
      expect(env.JWT_SECRET).toMatch(/^[0-9a-f]{64}$/);
      expect(env.DB_PASSWORD).toMatch(GENERATED_PASSWORD);
      expect(readEnv(path.join(dir, ".env.test")).DB_PASSWORD).toBe(
        env.DB_PASSWORD,
      );
      expect(output).not.toContain(env.DB_PASSWORD);
      expect(output).not.toContain(env.JWT_SECRET);
    });

    // fork-bootstrap-leftovers D-01 (item 1): step 2b renamed every "lakira_" in
    // a user's env files, a password they chose included.
    it("renames the identifiers in a hand-made .env, and no value the user chose", () => {
      const dir = track(
        bootstrap("my-app", (scratch) => {
          fs.writeFileSync(
            path.join(scratch, ".env"),
            [
              "DB_USER=lakira_user",
              "DB_NAME=lakira_development",
              "DB_PASSWORD=lakira_secret",
              "DEVELOPMENT_DATABASE_URL=postgresql://lakira_user:lakira_secret@127.0.0.1:5432/lakira_development",
              "STAGING_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/lakira_staging",
              "SESSION_NOTE=lakira_keep",
              "",
            ].join("\n"),
          );
        }),
      );
      const env = readEnv(path.join(dir, ".env"));

      expect(env.DB_USER).toBe("my_app_user");
      expect(env.DB_NAME).toBe("my_app_development");
      expect(env.DB_PASSWORD).toBe("lakira_secret");
      expect(env.DEVELOPMENT_DATABASE_URL).toBe(
        "postgresql://my_app_user:lakira_secret@127.0.0.1:5432/my_app_development",
      );
      expect(env.STAGING_DATABASE_URL).toBe(
        "postgresql://postgres:postgres@127.0.0.1:5432/my_app_staging",
      );
      expect(env.SESSION_NOTE).toBe("lakira_keep");
    });

    // D-02 (item 7): an argument is readable by every user in the process list;
    // a process's environment only by its own user.
    it("passes no generated secret to sed as an argument", () => {
      const script = read(ROOT, "scripts/bootstrap-fork.sh");

      expect(script).not.toMatch(
        /\b(?:do_)?sed\b[^\n]*\$\{?(?:NEW_SECRET|[A-Z_]*PASSWORD)\b/,
      );
    });

    // D-03 (item 6): `sed -i` was the one branch that differs between BSD and
    // GNU, and CI runs only GNU.
    it("has no sed -i, and keeps the mode of a file it rewrites", () => {
      const dir = track(
        bootstrap("my-app", (scratch) => {
          fs.copyFileSync(
            path.join(scratch, ".env.example"),
            path.join(scratch, ".env"),
          );
          fs.chmodSync(path.join(scratch, ".env"), 0o600);
        }),
      );

      expect(read(ROOT, "scripts/bootstrap-fork.sh")).not.toMatch(/\bsed -i\b/);
      expect(fs.statSync(path.join(dir, ".env")).mode & 0o777).toBe(0o600);
      expect(readEnv(path.join(dir, ".env")).DB_USER).toBe("my_app_user");
    });

    // D-04 (item 10): step 1 renames package.json first, so a run stopped after
    // it left a tree that every later run read as finished.
    it("finishes the renames a run that stopped after step 1 left", () => {
      const dir = track(
        bootstrap("my-app", (scratch) => {
          for (const file of ["package.json", ".env.example"]) {
            const full = path.join(scratch, file);
            fs.writeFileSync(
              full,
              fs
                .readFileSync(full, "utf-8")
                .replaceAll("lakira-backend", "my-app"),
            );
          }
        }),
      );

      expect(
        fs.existsSync(path.join(dir, "docs/reference/api/my-app-openapi.json")),
      ).toBe(true);
      expect(
        createdDatabases(path.join(dir, "docker/db/init/01-create-dbs.sql")),
      ).toEqual(["my_app_test_db"]);
      expect(read(dir, ".env.test.example")).not.toMatch(/lakira_/i);
      expect(readEnv(path.join(dir, ".env.test")).DB_USER).toBe("my_app_user");
    });

    // D-05 (item 10): with no .env, the generated password replaced the one the
    // user had put in .env.test, which their database still expects.
    it("gives a new .env the login of an .env.test the user filled in alone", () => {
      const dir = track(
        fs.mkdtempSync(path.join(os.tmpdir(), "bootstrap-fork-")),
      );
      for (const file of FIXTURE_FILES) {
        fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
        fs.copyFileSync(path.join(ROOT, file), path.join(dir, file));
      }
      fs.writeFileSync(
        path.join(dir, ".env.test"),
        [
          "DB_NAME=lakira_test_db",
          "DB_USER=lakira_user",
          "DB_PASSWORD=chosen1",
          "TEST_DATABASE_URL=postgres://lakira_user:chosen1@127.0.0.1:5432/lakira_test_db",
          "",
        ].join("\n"),
      );

      const output = run(dir, "my-app");
      const env = readEnv(path.join(dir, ".env"));
      const envTest = readEnv(path.join(dir, ".env.test"));

      expect(env.DB_USER).toBe("my_app_user");
      expect(env.DB_PASSWORD).toBe("chosen1");
      expect(new URL(env.DEVELOPMENT_DATABASE_URL).password).toBe("chosen1");
      expect(new URL(env.TEST_DATABASE_URL).password).toBe("chosen1");
      expect(envTest.DB_PASSWORD).toBe("chosen1");
      expect(output).toContain("taken from the existing .env.test");
    });

    it("keeps a broker login the user chose, and gives it to .env.test", () => {
      const dir = track(
        bootstrap("my-app", (scratch) => {
          fs.writeFileSync(
            path.join(scratch, ".env"),
            fs
              .readFileSync(path.join(scratch, ".env.example"), "utf-8")
              .replace(/^RABBITMQ_USER=.*$/m, "RABBITMQ_USER=bob")
              .replace(/^RABBITMQ_PASSWORD=.*$/m, "RABBITMQ_PASSWORD=own-pass"),
          );
          fs.copyFileSync(
            path.join(scratch, ".env.test.example"),
            path.join(scratch, ".env.test"),
          );
        }),
      );
      const env = readEnv(path.join(dir, ".env"));
      const envTest = readEnv(path.join(dir, ".env.test"));

      expect([env.RABBITMQ_USER, env.RABBITMQ_PASSWORD]).toEqual([
        "bob",
        "own-pass",
      ]);
      expect([envTest.RABBITMQ_USER, envTest.RABBITMQ_PASSWORD]).toEqual([
        "bob",
        "own-pass",
      ]);
    });

    it("prints no generated secret", () => {
      const dir = track(
        fs.mkdtempSync(path.join(os.tmpdir(), "bootstrap-fork-")),
      );
      for (const file of FIXTURE_FILES) {
        fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
        fs.copyFileSync(path.join(ROOT, file), path.join(dir, file));
      }

      const output = run(dir, "my-app");
      const env = readEnv(path.join(dir, ".env"));

      for (const key of ["JWT_SECRET", "DB_PASSWORD", "RABBITMQ_PASSWORD"]) {
        expect(output).not.toContain(env[key]);
      }
    });

    it("leaves the URLs alone when the database user is not a plain identifier", () => {
      const dir = track(
        bootstrap("my-app", (scratch) => {
          fs.writeFileSync(
            path.join(scratch, ".env"),
            [
              "DB_USER=odd|user",
              "DB_PASSWORD=lakira_password",
              "DEVELOPMENT_DATABASE_URL=postgresql://odd|user:lakira_password@127.0.0.1:5432/dev",
              "",
            ].join("\n"),
          );
        }),
      );
      const env = readEnv(path.join(dir, ".env"));

      expect(env.DB_PASSWORD).toMatch(GENERATED_PASSWORD);
      expect(env.DEVELOPMENT_DATABASE_URL).toBe(
        "postgresql://odd|user:my_app_password@127.0.0.1:5432/dev",
      );
    });

    it("keeps a password the user chose, and gives it to a new .env.test", () => {
      const dir = track(
        bootstrap("my-app", (scratch) => {
          fs.writeFileSync(
            path.join(scratch, ".env"),
            ["DB_USER=lakira_user", "DB_PASSWORD=chosen-by-hand", ""].join(
              "\n",
            ),
          );
        }),
      );
      const envTest = readEnv(path.join(dir, ".env.test"));

      expect(readEnv(path.join(dir, ".env")).DB_PASSWORD).toBe(
        "chosen-by-hand",
      );
      expect(envTest.DB_PASSWORD).toBe("chosen-by-hand");
      expect(new URL(envTest.TEST_DATABASE_URL).password).toBe(
        "chosen-by-hand",
      );
    });

    // Audit 2026-10-12, W3: the password was copied to .env.test and the user was
    // not, so .env.test logged in as the template's user with the user's password.
    describe.each([
      ["a new .env.test", false],
      ["an .env.test copied from the template by hand", true],
    ])("a hand-made .env with its own database user, and %s", (_, copied) => {
      let dir: string;
      let output: string;

      beforeAll(() => {
        dir = track(fs.mkdtempSync(path.join(os.tmpdir(), "bootstrap-fork-")));
        for (const file of FIXTURE_FILES) {
          fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
          fs.copyFileSync(path.join(ROOT, file), path.join(dir, file));
        }
        fs.writeFileSync(
          path.join(dir, ".env"),
          ["DB_USER=alice", "DB_PASSWORD=chosen-by-hand", ""].join("\n"),
        );
        if (copied) {
          fs.copyFileSync(
            path.join(dir, ".env.test.example"),
            path.join(dir, ".env.test"),
          );
        }
        output = run(dir, "my-app");
      });

      it("gives .env.test that user and password, in the URL too", () => {
        const envTest = readEnv(path.join(dir, ".env.test"));
        const url = new URL(envTest.TEST_DATABASE_URL);

        expect(envTest.DB_USER).toBe("alice");
        expect(envTest.DB_PASSWORD).toBe("chosen-by-hand");
        expect(url.username).toBe("alice");
        expect(url.password).toBe("chosen-by-hand");
        expect(url.host).toBe("127.0.0.1:5432");
        expect(url.pathname).toBe("/my_app_test_db");
      });

      it("leaves the template's password on no line of .env.test", () => {
        expect(read(dir, ".env.test")).not.toMatch(/_password/);
      });

      it("says it copied the login, and on a second run neither says so nor changes a file", () => {
        const before = [read(dir, ".env"), read(dir, ".env.test")];

        const second = run(dir, "my-app");

        expect(output).toContain("copied to .env.test");
        expect(second).not.toContain("copied to .env.test");
        expect([read(dir, ".env"), read(dir, ".env.test")]).toEqual(before);
      });
    });

    // What a run before this fix left behind: the chosen password in DB_PASSWORD,
    // the template's user, and the template's password still in the URL.
    it("finishes an .env.test that an earlier run left on the template's user", () => {
      const dir = track(
        bootstrap("my-app", (scratch) => {
          fs.writeFileSync(
            path.join(scratch, ".env"),
            ["DB_USER=alice", "DB_PASSWORD=chosen-by-hand", ""].join("\n"),
          );
          fs.writeFileSync(
            path.join(scratch, ".env.test"),
            [
              "DB_USER=my_app_user",
              "DB_PASSWORD=chosen-by-hand",
              "TEST_DATABASE_URL=postgres://my_app_user:my_app_password@127.0.0.1:5432/my_app_test_db",
              "",
            ].join("\n"),
          );
        }),
      );
      const envTest = readEnv(path.join(dir, ".env.test"));

      expect(envTest.DB_USER).toBe("alice");
      expect(envTest.TEST_DATABASE_URL).toBe(
        "postgres://alice:chosen-by-hand@127.0.0.1:5432/my_app_test_db",
      );
    });

    it("rebuilds a URL in .env that named another user, with the generated password", () => {
      const dir = track(
        bootstrap("my-app", (scratch) => {
          fs.writeFileSync(
            path.join(scratch, ".env"),
            fs
              .readFileSync(path.join(scratch, ".env.example"), "utf-8")
              .replace(
                /^(DEVELOPMENT|TEST)_DATABASE_URL=postgresql:\/\/lakira_user:/gm,
                "$1_DATABASE_URL=postgresql://someone_else:",
              ),
          );
        }),
      );
      const env = readEnv(path.join(dir, ".env"));

      expect(env.DB_PASSWORD).toMatch(GENERATED_PASSWORD);
      for (const [url, database] of [
        [env.DEVELOPMENT_DATABASE_URL, "/my_app_development"],
        [env.TEST_DATABASE_URL, "/my_app_test_db"],
      ]) {
        expect(new URL(url).username).toBe(env.DB_USER);
        expect(new URL(url).password).toBe(env.DB_PASSWORD);
        expect(new URL(url).pathname).toBe(database);
      }
      expect(read(dir, ".env") + read(dir, ".env.test")).not.toMatch(
        /_password@/,
      );
      expect(new URL(env.STAGING_DATABASE_URL).password).toBe("postgres");
    });

    it("leaves a URL in .env alone when it has a user and a password of its own", () => {
      const own = "postgresql://someone_else:their-own@db.example.com:6543/dev";
      const dir = track(
        bootstrap("my-app", (scratch) => {
          fs.writeFileSync(
            path.join(scratch, ".env"),
            fs
              .readFileSync(path.join(scratch, ".env.example"), "utf-8")
              .replace(
                /^DEVELOPMENT_DATABASE_URL=.*$/m,
                `DEVELOPMENT_DATABASE_URL=${own}`,
              ),
          );
        }),
      );
      const env = readEnv(path.join(dir, ".env"));

      expect(env.DB_PASSWORD).toMatch(GENERATED_PASSWORD);
      expect(env.DEVELOPMENT_DATABASE_URL).toBe(own);
      expect(new URL(env.TEST_DATABASE_URL).password).toBe(env.DB_PASSWORD);
    });

    it("does not run APP_NAME onto the last line of an .env with no final newline", () => {
      const dir = track(
        bootstrap("my-app", (scratch) => {
          fs.writeFileSync(path.join(scratch, ".env"), "DB_USER=alice");
        }),
      );
      const env = readEnv(path.join(dir, ".env"));

      expect(env.DB_USER).toBe("alice");
      expect(env.APP_NAME).toBe("my-app");
    });

    it("says it generated the secrets only on a run that generated them", () => {
      const dir = track(
        fs.mkdtempSync(path.join(os.tmpdir(), "bootstrap-fork-")),
      );
      for (const file of FIXTURE_FILES) {
        fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
        fs.copyFileSync(path.join(ROOT, file), path.join(dir, file));
      }

      const first = run(dir, "my-app");
      const second = run(dir, "my-app");

      expect(first).toContain("generated the database password");
      expect(second).not.toContain("generated the database password");
    });

    it("changes nothing on a second run that finds both", () => {
      const dir = track(bootstrap("my-app"));
      const files = [
        ".env",
        ".env.test",
        ".env.example",
        ".env.test.example",
        "package.json",
        "FORKED-FROM.md",
        "docker/db/init/01-create-dbs.sql",
      ];
      const before = files.map((file) => read(dir, file));

      run(dir, "my-app");

      expect(files.map((file) => read(dir, file))).toEqual(before);
    });

    // The template's own short name is the one name holding "lakira" that every
    // rename leaves as it found it.
    it.each(["lakira"])("changes nothing on a second run as %s", (name) => {
      const dir = track(bootstrap(name));
      const files = [
        ".env",
        ".env.test",
        ".env.example",
        ".env.test.example",
        "docker/db/init/01-create-dbs.sql",
      ];
      const before = files.map((file) => read(dir, file));

      run(dir, name);

      expect(files.map((file) => read(dir, file))).toEqual(before);
      expect(readEnv(path.join(dir, ".env")).DB_USER).toBe("lakira_user");
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
      expect(env.DB_PASSWORD).toBeUndefined();
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
      // What is staged is the rewritten spec, not the upstream one under a new name.
      expect(
        git(dir, "show", ":docs/reference/api/my-app-openapi.json"),
      ).toContain('"title": "My App API"');
    });
  });

  // The app title-cases a name by splitting on "-", so an empty part would put
  // a stray space in the API title that the script's rewrite does not. Such a
  // name is refused before anything is renamed.
  it.each(["app-", "a--b", "app--backend", "-app", "App", "my_app"])(
    "refuses the name %s",
    (name) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bootstrap-fork-"));
      dirs.push(dir);
      for (const file of FIXTURE_FILES) {
        fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
        fs.copyFileSync(path.join(ROOT, file), path.join(dir, file));
      }

      expect(() => run(dir, name)).toThrow(/--name must match/);
      expect(
        JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf-8"))
          .name,
      ).toBe("lakira-backend");
    },
  );

  // Audit 2026-10-12, T3: the renames match their own output when the new name
  // holds the template's. "lakira-x" titled the workflow "Lakira X X Backend CI"
  // and a second run renamed lakira_x_user to lakira_x_x_user.
  it.each([
    "lakira-x",
    "my-lakira",
    "lakirax",
    "lakira-x-backend",
    "lakira-api",
  ])("refuses the name %s, which holds the template's", (name) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bootstrap-fork-"));
    dirs.push(dir);
    for (const file of FIXTURE_FILES) {
      fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
      fs.copyFileSync(path.join(ROOT, file), path.join(dir, file));
    }

    expect(() => run(dir, name)).toThrow(/--name must not contain 'lakira'/);
    expect(
      JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf-8")).name,
    ).toBe("lakira-backend");
    expect(fs.existsSync(path.join(dir, ".env"))).toBe(false);
  });

  // Audit 2026-10-05, T2 (kit fork-openapi-gate, D-04). The spec's title and
  // cookie name are derived from the app's name, and a fork's spec kept the
  // upstream's. Bootstrap cannot run the generator (it runs before npm install),
  // so it rewrites those strings itself, and has to derive them exactly as
  // src/config/app-name.ts does. "acme-api" is the name where the script's short
  // name ("acme") and the app's ("acme-api") differed until B-51 (D-07).
  describe.each(["my-app", "acme-api", "shop-backend"])(
    "the spec's content for %s",
    (name) => {
      const specPath = `docs/reference/api/${name}-openapi.json`;
      let dir: string;
      let raw: string;
      let derived: { short: string; display: string };

      beforeAll(async () => {
        dir = bootstrap(name);
        dirs.push(dir);
        raw = fs.readFileSync(path.join(dir, specPath), "utf-8");
        await withTestEnv(
          async () => {
            await jest.isolateModulesAsync(async () => {
              const appName = await import("@/config/app-name.js");
              derived = {
                short: appName.APP_SHORT_NAME,
                display: appName.APP_DISPLAY_NAME,
              };
            });
          },
          { overrides: { APP_NAME: name } },
        );
      });

      it("carries the title and description the app derives from that name", () => {
        const spec = JSON.parse(raw) as {
          info: { title: string; description: string };
        };

        expect(spec.info.title).toBe(`${derived.display} API`);
        expect(spec.info.description).toBe(
          `API documentation for the ${derived.display} application.`,
        );
      });

      it("names the refresh cookie the server sets, in both places", () => {
        // Once in the refresh route's description, and once in each of the two
        // cookie header components.
        expect(raw.split(`\`${derived.short}_refresh\``)).toHaveLength(4);
        expect(raw.split(`"name": "${derived.short}_refresh"`)).toHaveLength(2);
      });

      it("keeps nothing of the upstream's name", () => {
        expect(raw).not.toMatch(/lakira/i);
      });

      it("is still valid JSON with every path the upstream spec has", () => {
        const upstream = fs.readFileSync(
          path.join(ROOT, "docs/reference/api/lakira-backend-openapi.json"),
          "utf-8",
        );

        expect(Object.keys(JSON.parse(raw).paths)).toEqual(
          Object.keys(JSON.parse(upstream).paths),
        );
      });

      it("is left alone by a second run", () => {
        run(dir, name);

        expect(fs.readFileSync(path.join(dir, specPath), "utf-8")).toBe(raw);
      });
    },
  );
});

// Audit 2026-09-29, R12 (kit fork-residue). A fork on the template's machine
// took its Compose names, the database volume among them, and its links into
// docs/internal/, which bootstrap deletes, were dead.
describeTemplate("bootstrap-fork.sh: fork residue (R12)", () => {
  const TEMPLATE_NAMES = [
    "postgres_db",
    "redis_cache",
    "rabbitmq_queue",
    "mailpit",
    "node_app",
    "node_worker",
    "backend_network",
    "db_data_volume",
    "redis_data_volume",
    "rabbitmq_data_volume",
  ];
  const composeNames = (file: string): string[] =>
    [
      ...fs
        .readFileSync(file, "utf-8")
        .matchAll(/^\s*(?:container_name|name):\s*(\S+)/gm),
    ].map((match) => match[1]);

  const read = (dir: string, file: string) =>
    fs.readFileSync(path.join(dir, file), "utf-8");
  const dirs: string[] = [];
  const track = (dir: string) => {
    dirs.push(dir);
    return dir;
  };
  afterAll(() => {
    for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
  });

  // An ADR whose Origin line points into a kit, as 86 do, beside the links the
  // rewrite must leave alone.
  const ADR = "docs/explanation/decisions/adr-9999-example.md";
  const withDocs = (dir: string) => {
    const write = (file: string, content: string) => {
      fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
      fs.writeFileSync(path.join(dir, file), content);
    };
    write("docs/internal/initiatives/kit/decisions.md", "# D-01\n");
    write("docs/explanation/internal-notes.md", "# Notes\n");
    write(
      ADR,
      [
        "- **Origin:** `D-01` in [the kit](../../internal/initiatives/kit/decisions.md#d-01)",
        "- [Notes](../internal-notes.md) and [elsewhere](https://example.com/docs/internal/x.md)",
        "",
      ].join("\n"),
    );
    write("README.md", "See [the todos](docs/internal/todos/a.md).\n");
  };

  it("gives every Compose name the fork's slug", () => {
    const dir = track(bootstrap("my-app"));

    expect(composeNames(path.join(dir, "docker-compose.yml"))).toEqual(
      TEMPLATE_NAMES.map((name) => `my_app_${name}`),
    );
  });

  it("changes nothing in docker-compose.yml on a second run", () => {
    const dir = track(bootstrap("my-app"));
    const first = read(dir, "docker-compose.yml");

    run(dir, "my-app");

    expect(read(dir, "docker-compose.yml")).toBe(first);
  });

  it("leaves the template's names alone when the template takes its own name", () => {
    const dir = track(bootstrap("lakira-backend"));

    expect(read(dir, "docker-compose.yml")).toBe(
      fs.readFileSync(path.join(ROOT, "docker-compose.yml"), "utf-8"),
    );
  });

  it("turns each link into docs/internal into its text, and no other link", () => {
    const dir = track(bootstrap("my-app", withDocs));

    expect(fs.existsSync(path.join(dir, "docs/internal"))).toBe(false);
    expect(read(dir, ADR)).toBe(
      [
        "- **Origin:** `D-01` in the kit",
        "- [Notes](../internal-notes.md) and [elsewhere](https://example.com/docs/internal/x.md)",
        "",
      ].join("\n"),
    );
    expect(read(dir, "README.md")).toBe("See the todos.\n");
  });

  it("unlinks them too when docs/internal was removed before the run", () => {
    const dir = track(
      bootstrap("my-app", (scratch) => {
        withDocs(scratch);
        fs.rmSync(path.join(scratch, "docs/internal"), {
          recursive: true,
          force: true,
        });
      }),
    );

    expect(read(dir, "README.md")).toBe("See the todos.\n");
  });

  it("keeps the links with --keep-internal", () => {
    const dir = track(
      fs.mkdtempSync(path.join(os.tmpdir(), "bootstrap-fork-")),
    );
    for (const file of FIXTURE_FILES) {
      fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
      fs.copyFileSync(path.join(ROOT, file), path.join(dir, file));
    }
    withDocs(dir);
    const before = read(dir, ADR);

    execFileSync(
      "bash",
      ["scripts/bootstrap-fork.sh", "--name", "my-app", "--keep-internal"],
      { cwd: dir, stdio: "pipe", encoding: "utf-8" },
    );

    expect(read(dir, ADR)).toBe(before);
    expect(fs.existsSync(path.join(dir, "docs/internal"))).toBe(true);
  });
});

// ADR-0084, kit tracker-as-code D-04. The form chooser's security link and
// SECURITY.md name the repository, so a fork's reports go to the fork.
describeTemplate("bootstrap-fork.sh: the security reporting links", () => {
  const read = (dir: string, file: string) =>
    fs.readFileSync(path.join(dir, file), "utf-8");
  const dirs: string[] = [];
  afterAll(() => {
    for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
  });

  it.each([".github/ISSUE_TEMPLATE/config.yml", "SECURITY.md"])(
    "points %s at the fork's repository",
    (file) => {
      const dir = bootstrap("my-app");
      dirs.push(dir);

      expect(read(dir, file)).toContain("/my-app/security/advisories/new");
      expect(read(dir, file)).not.toContain("lakira-backend");
    },
  );
});
