import { spawn } from "child_process";
import http from "http";
import net from "net";
import path from "path";
import {
  describe,
  it,
  expect,
  jest,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from "@jest/globals";
import app from "@/server.js";
import { redisClient } from "@/utils/redis-client.js";
import { api, authHeader, createTestUser } from "../helpers/test-utils.js";

/**
 * Runs the deploy smoke suite (`npm run test:smoke`) as CI runs it: the script itself, in
 * its own process, over HTTP against the real app (ADR-0095). Supertest would skip the
 * cookie handling the session depends on. The spawn is asynchronous: the server lives in
 * this process, and a synchronous spawn would block it from answering.
 */
const SCRIPT = path.resolve("tests/smoke/run-smoke.mjs");
const JWT_PATTERN = /eyJ[\w-]+\.[\w-]+\.[\w-]+/;

let server: http.Server;
let baseUrl: string;

beforeAll(async () => {
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as net.AddressInfo;
  baseUrl = `http://127.0.0.1:${port}/api/v1`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  // The test environment does not connect Redis; /ready would report it failed.
  jest.spyOn(redisClient, "ping").mockResolvedValue("PONG");
});

afterEach(() => {
  jest.restoreAllMocks();
});

type SmokeRun = { code: number | null; output: string };

const runSmoke = (env: Record<string, string>) =>
  new Promise<SmokeRun>((resolve, reject) => {
    // Nothing is inherited: the runner needs only what each case gives it, and an
    // inherited CI=true (GitHub Actions sets it for this suite too) would make it refuse
    // to skip. A case sets CI itself when that is what it tests.
    const child = spawn(process.execPath, [SCRIPT], {
      env: {
        SMOKE_BASE_URL: baseUrl,
        SMOKE_WAIT_TIMEOUT_MS: "5000",
        LOG_LEVEL: "info",
        ...env,
      },
    });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, output }));
  });

describe("tests/smoke/run-smoke.mjs against the real app", () => {
  it("passes every check and the whole session, and logs nothing secret", async () => {
    const { token, payload } = await createTestUser();

    const { code, output } = await runSmoke({
      SMOKE_EMAIL: payload.email,
      SMOKE_PASSWORD: payload.password,
    });

    expect(output).toContain("all 11 checks passed");
    expect(code).toBe(0);
    for (const step of [
      "session: log in",
      "session: refresh with the cookie",
      "session: read the profile",
      "session: create a metric",
      "session: delete the metric",
      "session: log out",
      "session: the logged-out cookie is refused",
    ]) {
      expect(output).toContain(`PASS  ${step}`);
    }
    expect(output).not.toContain(payload.password);
    expect(output).not.toContain(payload.email);
    expect(output).not.toMatch(JWT_PATTERN);
    expect(output).not.toMatch(/_refresh=/);

    // The metric it created is gone.
    const list = await api
      .get("/api/v1/metrics")
      .set("Authorization", authHeader(token));
    expect(list.status).toBe(200);
    expect(list.body.data.items).toHaveLength(0);
  }, 30_000);

  it("fails on a wrong password, naming the log-in step", async () => {
    const { payload } = await createTestUser();

    const { code, output } = await runSmoke({
      SMOKE_EMAIL: payload.email,
      SMOKE_PASSWORD: "not-the-password-1A!",
    });

    expect(code).toBe(1);
    expect(output).toContain("FAIL  session: log in");
    expect(output).toContain("6 later step(s) not run");
    expect(output).not.toContain("not-the-password-1A!");
  }, 30_000);

  it("skips the session outside CI when no credentials are set", async () => {
    const { code, output } = await runSmoke({});

    expect(code).toBe(0);
    expect(output).toContain("SKIP  session");
    expect(output).toContain("all 4 checks passed");
  }, 30_000);

  it("refuses to run in CI without the credentials", async () => {
    const { code, output } = await runSmoke({
      CI: "true",
      SMOKE_EXPECTED_RELEASE: "any",
    });

    expect(code).toBe(1);
    expect(output).toContain(
      "SMOKE_EMAIL and SMOKE_PASSWORD are required in CI",
    );
  }, 30_000);

  it("refuses one credential without the other", async () => {
    const { code, output } = await runSmoke({ SMOKE_EMAIL: "a@example.com" });

    expect(code).toBe(1);
    expect(output).toContain("SMOKE_EMAIL and SMOKE_PASSWORD go together");
  }, 30_000);
});
