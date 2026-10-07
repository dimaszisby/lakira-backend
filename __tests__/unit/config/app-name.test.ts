import { afterEach, describe, expect, it, jest } from "@jest/globals";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { withTestEnv } from "@/tests/env-test-utils.js";

// app-name.ts reads process.env.APP_NAME at module-load time and derives
// APP_SHORT_NAME / APP_DISPLAY_NAME from it. Each case here uses withTestEnv
// to set the override, then jest.isolateModulesAsync re-imports the module so
// the derivation runs against the case-specific value.

const loadAppName = async () => {
  let mod!: typeof import("@/config/app-name.js");
  await jest.isolateModulesAsync(async () => {
    mod = await import("@/config/app-name.js");
  });
  return mod;
};

describe("app-name", () => {
  it("derives 'lakira' / 'Lakira' from APP_NAME='lakira-backend' (upstream default)", async () => {
    await withTestEnv(
      async () => {
        const { APP_NAME, APP_SHORT_NAME, APP_DISPLAY_NAME } =
          await loadAppName();
        expect(APP_NAME).toBe("lakira-backend");
        expect(APP_SHORT_NAME).toBe("lakira");
        expect(APP_DISPLAY_NAME).toBe("Lakira");
      },
      { overrides: { APP_NAME: "lakira-backend" } },
    );
  });

  it("strips a trailing '-backend' suffix from APP_SHORT_NAME", async () => {
    await withTestEnv(
      async () => {
        const { APP_NAME, APP_SHORT_NAME, APP_DISPLAY_NAME } =
          await loadAppName();
        expect(APP_NAME).toBe("my-cool-app-backend");
        expect(APP_SHORT_NAME).toBe("my-cool-app");
        expect(APP_DISPLAY_NAME).toBe("My Cool App");
      },
      { overrides: { APP_NAME: "my-cool-app-backend" } },
    );
  });

  it("keeps the name as-is when there is no '-backend' suffix", async () => {
    await withTestEnv(
      async () => {
        const { APP_SHORT_NAME, APP_DISPLAY_NAME } = await loadAppName();
        expect(APP_SHORT_NAME).toBe("my-app");
        expect(APP_DISPLAY_NAME).toBe("My App");
      },
      { overrides: { APP_NAME: "my-app" } },
    );
  });

  it("handles single-word names without a hyphen", async () => {
    await withTestEnv(
      async () => {
        const { APP_SHORT_NAME, APP_DISPLAY_NAME } = await loadAppName();
        expect(APP_SHORT_NAME).toBe("foo");
        expect(APP_DISPLAY_NAME).toBe("Foo");
      },
      { overrides: { APP_NAME: "foo" } },
    );
  });
});

// Audit U2, kit app-name-from-package D-01 / ADR-0060. With no APP_NAME the name
// is the package's, so a fork's image is named after the fork. The expected
// value is read from package.json here, because Fork Smoke runs this suite on a
// renamed package.
describe("app-name: the default", () => {
  const PACKAGE_JSON = path.resolve(process.cwd(), "package.json");
  const packageName = (
    JSON.parse(fs.readFileSync(PACKAGE_JSON, "utf-8")) as { name: string }
  ).name;

  const dirs: string[] = [];
  const packageJsonWith = (content: string): string => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "app-name-"));
    dirs.push(dir);
    const file = path.join(dir, "package.json");
    fs.writeFileSync(file, content);
    return file;
  };

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("is the package's name when APP_NAME is unset", async () => {
    const { resolveAppName } = await loadAppName();

    expect(resolveAppName(undefined)).toBe(packageName);
  });

  it.each(["", "   ", "\t"])(
    "is the package's name when APP_NAME is blank (%j)",
    async (blank) => {
      const { resolveAppName } = await loadAppName();

      expect(resolveAppName(blank)).toBe(packageName);
    },
  );

  it("is APP_NAME when it is set, whatever the package is called", async () => {
    const { resolveAppName } = await loadAppName();

    expect(resolveAppName("acme-api", () => "something-else")).toBe("acme-api");
  });

  it("does not read package.json when APP_NAME is set", async () => {
    const { resolveAppName } = await loadAppName();
    const readName = jest.fn(() => "unused");

    resolveAppName("acme-api", readName);

    expect(readName).not.toHaveBeenCalled();
  });

  it("drops the scope of a scoped package name", async () => {
    const { resolveAppName } = await loadAppName();

    expect(resolveAppName(undefined, () => "@acme/shop-backend")).toBe(
      "shop-backend",
    );
  });

  it("reads the name from a package.json", async () => {
    const { readPackageName } = await loadAppName();

    expect(readPackageName(packageJsonWith('{"name":"acme-api"}'))).toBe(
      "acme-api",
    );
  });

  it.each([
    ["has no name", "{}"],
    ["has an empty name", '{"name":""}'],
    ["has a name that is not a string", '{"name":7}'],
    ["is not JSON", "not json"],
  ])("throws, naming the file, when package.json %s", async (_case, body) => {
    const { readPackageName } = await loadAppName();
    const file = packageJsonWith(body);

    expect(() => readPackageName(file)).toThrow(file);
    expect(() => readPackageName(file)).toThrow("APP_NAME");
  });

  it("throws, naming the file, when package.json is missing", async () => {
    const { readPackageName } = await loadAppName();
    const file = path.join(os.tmpdir(), "app-name-missing", "package.json");

    expect(() => readPackageName(file)).toThrow(file);
  });

  it.each(["@acme/", "@acme/   "])(
    "refuses a package name that is only a scope (%j)",
    async (scopeOnly) => {
      const { resolveAppName } = await loadAppName();

      expect(() => resolveAppName(undefined, () => scopeOnly)).toThrow(
        "APP_NAME",
      );
    },
  );

  it("refuses a package name that is only whitespace", async () => {
    const { readPackageName } = await loadAppName();
    const file = packageJsonWith('{"name":"   "}');

    expect(() => readPackageName(file)).toThrow(file);
  });

  it("keeps what went wrong as the error's cause", async () => {
    const { readPackageName } = await loadAppName();
    const file = packageJsonWith("not json");

    let thrown: unknown;
    try {
      readPackageName(file);
    } catch (error) {
      thrown = error;
    }

    expect((thrown as Error).cause).toBeInstanceOf(SyntaxError);
  });

  // The constant itself, not only the function: a blank variable counts as
  // unset, and withTestEnv cannot remove one.
  it("exports the package's name when APP_NAME is blank", async () => {
    await withTestEnv(
      async () => {
        const { APP_NAME } = await loadAppName();
        expect(APP_NAME).toBe(packageName);
      },
      { overrides: { APP_NAME: "" } },
    );
  });

  describe("where package.json is looked for", () => {
    const appWith = (): { root: string; entry: string } => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "app-name-"));
      dirs.push(root);
      fs.mkdirSync(path.join(root, "dist"));
      fs.writeFileSync(path.join(root, "package.json"), '{"name":"acme-api"}');
      return { root, entry: path.join(root, "dist", "server.js") };
    };
    const emptyDir = (): string => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "app-name-"));
      dirs.push(dir);
      return dir;
    };

    it("is the entry script's package, whatever the working directory", async () => {
      const { locatePackageJson } = await loadAppName();
      const { root, entry } = appWith();

      expect(locatePackageJson(entry, emptyDir()).found).toBe(
        path.join(root, "package.json"),
      );
    });

    it("prefers the entry script's package to another one in the working directory", async () => {
      const { locatePackageJson } = await loadAppName();
      const { root, entry } = appWith();
      const other = emptyDir();
      fs.writeFileSync(path.join(other, "package.json"), '{"name":"other"}');

      expect(locatePackageJson(entry, other).found).toBe(
        path.join(root, "package.json"),
      );
    });

    it("is the working directory's when the entry script is a runner in node_modules", async () => {
      const { locatePackageJson } = await loadAppName();
      const { root } = appWith();
      const runner = path.join(root, "node_modules", "jest", "bin", "jest.js");
      fs.mkdirSync(path.dirname(runner), { recursive: true });
      fs.writeFileSync(
        path.join(root, "node_modules", "jest", "package.json"),
        '{"name":"jest"}',
      );

      expect(locatePackageJson(runner, root).found).toBe(
        path.join(root, "package.json"),
      );
    });

    it("is the working directory's when there is no entry script", async () => {
      const { locatePackageJson } = await loadAppName();
      const { root } = appWith();

      expect(locatePackageJson(undefined, root).found).toBe(
        path.join(root, "package.json"),
      );
    });

    it("finds nothing, and says where it looked, when neither has one", async () => {
      const { locatePackageJson } = await loadAppName();
      const cwd = emptyDir();
      const elsewhere = emptyDir();
      const entry = path.join(elsewhere, "dist", "server.js");

      const { found, looked } = locatePackageJson(entry, cwd);

      // A package.json above the temp directory would be a real one; none of
      // the places looked in may be inside either temp directory and exist.
      expect(looked).toContain(path.join(cwd, "package.json"));
      expect(looked).toContain(path.join(elsewhere, "dist", "package.json"));
      expect(found === undefined || !found.startsWith(os.tmpdir())).toBe(true);
    });
  });

  it("never falls back to a fixed name", async () => {
    const { resolveAppName } = await loadAppName();

    expect(() =>
      resolveAppName(undefined, () => {
        throw new Error("no package.json");
      }),
    ).toThrow("no package.json");
  });
});
