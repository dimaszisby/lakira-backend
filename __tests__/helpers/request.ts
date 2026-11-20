import http, { type RequestListener } from "http";
import type { AddressInfo } from "net";
import supertest from "supertest";

/**
 * supertest, with every server it starts listening on loopback (#243).
 *
 * supertest wraps an app in `http.createServer`, calls `listen(0)` with no host,
 * and sends the request to `127.0.0.1`. A listen with no host binds every
 * interface, and on macOS such a bind can be given a port another process holds
 * on `127.0.0.1` alone. The request then reaches that process, the more specific
 * binding, and the test reads whatever it answers: `Parse Error: Expected HTTP/`,
 * `socket hang up`, or another server's 401 or 404. A loopback listen is never
 * given a port held on loopback, so here the server and the request always meet.
 *
 * Import this, never `supertest` itself; `__tests__/unit/helpers/request.test.ts`
 * fails on a file that does, and on a test `listen` that names no loopback host.
 */
export const LOOPBACK = "127.0.0.1";

// supertest reads the port the moment a request is built, and a listen that
// names a host binds only after a lookup. So a request is built on this
// placeholder, and its server listens, and the URL gets the real port, when the
// request is sent.
const PLACEHOLDER = `http://${LOOPBACK}:0`;

type App = Parameters<typeof supertest>[0];
type Options = Parameters<typeof supertest>[1];
type Sent = {
  url: string;
  end: (callback?: (...args: unknown[]) => void) => Sent;
  _server?: http.Server;
};
type Methods = Record<string, (path: string, ...rest: unknown[]) => Sent>;

const METHODS = [...http.METHODS.map((name) => name.toLowerCase()), "del"];

const sendFrom = (server: http.Server, test: Sent, path: string): Sent => {
  const end = test.end.bind(test);
  test.end = (callback) => {
    const send = () => {
      const { port } = server.address() as AddressInfo;
      test.url = `http://${LOOPBACK}:${port}${path}`;
      end(callback);
    };
    // An agent's requests share one server: one already listening is used as
    // it is, and closed by the request that opened it, as supertest does.
    if (server.listening) return (send(), test);
    server.listen(0, LOOPBACK, () => {
      test._server = server; // supertest closes it once the response is read
      send();
    });
    return test;
  };
  return test;
};

/** Points each request method of `target` at a loopback server from `serverFor`. */
const routeThrough = <T>(target: T, serverFor: () => http.Server): T => {
  const methods = target as unknown as Methods;
  for (const method of METHODS) {
    const build = methods[method];
    if (typeof build !== "function") continue;
    methods[method] = (path, ...rest) =>
      sendFrom(serverFor(), build.call(target, path, ...rest), path);
  }
  return target;
};

const asServer = (app: App) => () => http.createServer(app as RequestListener);

// A server per request, as supertest builds for an app: requests from one handle
// in flight together never share, or close, each other's server.
const request = (app: App, options?: Options) =>
  typeof app === "function"
    ? routeThrough(supertest(PLACEHOLDER, options), asServer(app))
    : supertest(app, options);

// One server for all of an agent's requests, as supertest's agent keeps.
const agent = (app?: App, options?: Options) => {
  if (typeof app !== "function") return supertest.agent(app, options);
  const server = asServer(app)();
  return routeThrough(supertest.agent(PLACEHOLDER, options), () => server);
};

export default Object.assign(request, {
  agent,
  Test: supertest.Test,
}) as typeof supertest;
