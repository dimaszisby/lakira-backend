import { describe, it, expect } from "@jest/globals";
import fs from "fs";
import http from "http";
import net from "net";
import path from "path";
import type { AddressInfo } from "net";
import request, { LOOPBACK } from "../../helpers/request.js";

/**
 * #243. supertest listened with no host, and on macOS such a listen can be given a
 * port another process holds on 127.0.0.1 alone; the request then reached that
 * process, and the test read `Parse Error: Expected HTTP/` or `socket hang up`.
 * The first case reproduces that on demand, the rest prove the helper's way out:
 * a loopback listen is never given a held port, and every test server is one.
 */
const ROOT = path.resolve(__dirname, "../../..");

const portOf = (server: net.Server) => (server.address() as AddressInfo).port;

const listenOn = (server: net.Server, port: number, host?: string) =>
  new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    if (host === undefined) server.listen(port, () => resolve());
    else server.listen(port, host, () => resolve());
  });

const close = (server: net.Server) =>
  new Promise<void>((resolve) => {
    if (server instanceof http.Server) server.closeAllConnections();
    server.close(() => resolve());
  });

/** Another process's loopback-only listener that answers bytes that are not HTTP, as Postgres or Redis would. */
const foreignListener = async () => {
  // Destroyed once written: a socket left half open would keep close() waiting.
  const server = net.createServer((socket) =>
    socket.write("RFB 003.008\n", () => socket.destroy()),
  );
  await listenOn(server, 0, LOOPBACK);
  return server;
};

const get = (port: number) =>
  new Promise<string>((resolve, reject) => {
    http
      .get(`http://${LOOPBACK}:${port}/`, (res) => {
        res.setEncoding("utf8");
        let body = "";
        res.on("data", (chunk: string) => (body += chunk));
        res.on("end", () => resolve(body));
      })
      .on("error", reject);
  });

const reportsItsAddress: http.RequestListener = (req, res) => {
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify({ localAddress: req.socket.localAddress }));
};

const onMacOS = process.platform === "darwin" ? it : it.skip;

describe("test servers listen on loopback (#243)", () => {
  onMacOS(
    "reproduces the flake on macOS: a listen with no host takes a port held on loopback, and the request reads the other process",
    async () => {
      // macOS refuses the bind now and then (about one try in five here); a fresh
      // port is the remedy, and five refusals in a row would mean the flaw is gone.
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        const foreign = await foreignListener();
        const wildcard = http.createServer((_req, res) => res.end("ok"));
        try {
          try {
            await listenOn(wildcard, portOf(foreign));
          } catch (error) {
            if ((error as { code?: string }).code === "EADDRINUSE") continue;
            throw error;
          }

          await expect(get(portOf(foreign))).rejects.toThrow(
            /Parse Error: Expected HTTP\//,
          );
          return;
        } finally {
          if (wildcard.listening) await close(wildcard);
          await close(foreign);
        }
      }
      throw new Error(
        "macOS refused a wildcard bind on a loopback-held port five times",
      );
    },
  );

  it("refuses a loopback listen on a port held on loopback, which is what keeps the helper's servers apart", async () => {
    const foreign = await foreignListener();
    const server = http.createServer();
    try {
      await expect(
        listenOn(server, portOf(foreign), LOOPBACK),
      ).rejects.toMatchObject({ code: "EADDRINUSE" });
    } finally {
      await close(foreign);
    }
  });

  it("serves a request from a server bound to 127.0.0.1, never to every interface", async () => {
    const res = await request(reportsItsAddress).get("/");

    // A listen with no host answers an IPv4 request as ::ffff:127.0.0.1.
    expect(res.body).toEqual({ localAddress: LOOPBACK });
  });

  it("does the same for an agent", async () => {
    const res = await request.agent(reportsItsAddress).get("/");

    expect(res.body).toEqual({ localAddress: LOOPBACK });
  });

  it("gives each request its own server, so a handle's requests in flight together all complete", async () => {
    const api = request(reportsItsAddress);

    const responses = await Promise.all(
      Array.from({ length: 20 }, () => api.get("/")),
    );

    expect(responses.map((res) => res.status)).toEqual(
      Array.from({ length: 20 }, () => 200),
    );
  });
});

describe("the loopback rule holds across the test tree", () => {
  const HELPER = "__tests__/helpers/request.ts";
  const THIS_FILE = "__tests__/unit/helpers/request.test.ts";

  const sources = [
    ...fs
      .readdirSync(path.join(ROOT, "__tests__"), { recursive: true })
      .map((entry) => path.join("__tests__", String(entry)))
      .filter((file) => /\.(ts|mts|js|mjs)$/.test(file)),
    ...fs.readdirSync(ROOT).filter((file) => /^jest\.setup.*\.ts$/.test(file)),
  ]
    .map((file) => file.split(path.sep).join("/"))
    .filter((file) => file !== THIS_FILE)
    .map((file) => ({
      file,
      text: fs.readFileSync(path.join(ROOT, file), "utf-8"),
    }));

  const withoutComments = (text: string) =>
    text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("imports supertest only through the helper", () => {
    const offenders = sources
      .filter(({ file }) => file !== HELPER)
      .filter(({ text }) => /from\s+["']supertest["']/.test(text))
      .map(({ file }) => file);

    expect(offenders).toEqual([]);
  });

  it("names a loopback host in every listen", () => {
    const offenders = sources.flatMap(({ file, text }) =>
      [...withoutComments(text).matchAll(/\.listen\(([^)]*)\)/g)]
        .filter(([, args]) => !/LOOPBACK|"127\.0\.0\.1"/.test(args))
        .map(([call]) => `${file}: ${call}`),
    );

    expect(offenders).toEqual([]);
  });
});
