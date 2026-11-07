import http from "http";
import net from "net";
import { attachClientErrorHandler } from "@/shared/middleware/client-error.js";

/**
 * Proves the malformed-request path end to end: Node's own HTTP parser has to
 * reject the request for `clientError` to fire at all, so this drives a real
 * socket rather than supertest. Before `attachClientErrorHandler`, Node answered
 * with a bodyless 400 and no Content-Type, which is what tripped
 * `content_type_conformance` in the Schemathesis gate.
 */
const startServer = async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end('{"status":"success"}');
  });
  attachClientErrorHandler(server);

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as net.AddressInfo;
  return { server, port: address.port };
};

const sendRaw = (port: number, payload: string) =>
  new Promise<string>((resolve, reject) => {
    const socket = net.connect(port, "127.0.0.1", () => socket.write(payload));
    let received = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => (received += chunk));
    socket.on("end", () => resolve(received));
    socket.on("error", reject);
  });

describe("malformed HTTP requests", () => {
  let server: http.Server;
  let port: number;

  beforeAll(async () => {
    ({ server, port } = await startServer());
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it("answers an illegal header byte with the JSON error envelope", async () => {
    // \x7f (DEL) is not a legal header-value character, so the parser aborts.
    const raw = await sendRaw(
      port,
      "GET / HTTP/1.1\r\nHost: localhost\r\nCookie: a=\x7f\r\n\r\n",
    );

    const [head, body] = raw.split("\r\n\r\n");

    expect(head).toContain("400 Bad Request");
    expect(head).toContain("Content-Type: application/json; charset=utf-8");
    expect(JSON.parse(body)).toEqual({
      status: "fail",
      message: "Malformed HTTP request",
    });
  });

  it("still serves well-formed requests normally", async () => {
    const raw = await sendRaw(
      port,
      "GET / HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n",
    );

    expect(raw).toContain("200 OK");
    expect(raw).toContain('{"status":"success"}');
  });
});
