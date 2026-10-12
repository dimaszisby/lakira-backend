import fs from "fs";
import path from "path";

/**
 * Audit 2026-10-03, S10 (kit fork-test-credentials, D-04). A port published as "5432:5432" binds
 * every interface, so the database, Redis, the broker and the mail catcher were reachable from
 * the network with credentials anyone can guess. This reads docker-compose.yml, so it fails in
 * seconds and needs no Docker.
 */
const COMPOSE = path.resolve(__dirname, "../../docker-compose.yml");

// Every `ports:` entry of every service, as { service, spec }.
const publishedPorts = (): { service: string; spec: string }[] => {
  const result: { service: string; spec: string }[] = [];
  let inServices = false;
  let service: string | null = null;
  let inPorts = false;
  for (const line of fs.readFileSync(COMPOSE, "utf-8").split("\n")) {
    if (/^\S/.test(line)) {
      inServices = /^services:/.test(line);
      service = null;
      inPorts = false;
      continue;
    }
    // A comment never opens or closes a block.
    if (!inServices || /^\s*#/.test(line)) continue;
    const name = line.match(/^ {2}([a-z0-9_-]+):/);
    if (name) {
      service = name[1];
      inPorts = false;
      continue;
    }
    if (/^ {4}\S/.test(line)) {
      inPorts = /^ {4}ports:/.test(line);
      continue;
    }
    const entry = line.match(/^ {6}- "?([^"#\s]+)"?/);
    if (service && inPorts && entry) result.push({ service, spec: entry[1] });
  }
  return result;
};

const LOOPBACK = /^127\.0\.0\.1:\d+:\d+$/;

describe("docker-compose.yml published ports (S10)", () => {
  it("publishes the backing services on loopback only", () => {
    const backing = publishedPorts().filter(({ service }) => service !== "app");

    expect(backing.map(({ service, spec }) => `${service} ${spec}`)).toEqual([
      "db 127.0.0.1:5432:5432",
      "redis 127.0.0.1:6379:6379",
      "rabbitmq 127.0.0.1:5672:5672",
      "rabbitmq 127.0.0.1:15672:15672",
      "rabbitmq 127.0.0.1:15692:15692",
      "mailpit 127.0.0.1:8025:8025",
      "mailpit 127.0.0.1:1025:1025",
    ]);
  });

  // The two shapes the line reader above would not see.
  it("declares its ports as a block list and never uses the host network", () => {
    const compose = fs.readFileSync(COMPOSE, "utf-8");

    expect(compose).not.toMatch(/^\s*ports:\s*\[/m);
    expect(compose).not.toMatch(/^\s*network_mode:/m);
  });

  // A service added later with a bare "host:container" port fails here.
  it("leaves the app as the only service published on every interface", () => {
    const open = publishedPorts().filter(({ spec }) => !LOOPBACK.test(spec));

    expect(open).toEqual([{ service: "app", spec: "8001:5000" }]);
  });
});
