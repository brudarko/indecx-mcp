import { createServer as createHttpServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "./server.js";

export function startHttp(key: string, options: { host: string; port: number; token?: string }) {
  const { host, port, token } = options;
  const loopback = ["127.0.0.1", "::1", "localhost"].includes(host);
  if (!loopback && (!token || token.length < 32)) throw new Error("Non-loopback HTTP requires MCP_BEARER_TOKEN (at least 32 characters)");
  const http = createHttpServer(async (req, res) => {
    // Browser origins are not needed by server-to-server MCP clients.
    if (req.headers.origin || (loopback && !["127.0.0.1", "localhost", "[::1]"].includes((req.headers.host ?? "").replace(/:\d+$/, "")))) {
      res.writeHead(403).end(); return;
    }
    if (token) {
      const received = Buffer.from(req.headers.authorization ?? "");
      const expected = Buffer.from(`Bearer ${token}`);
      if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
        res.writeHead(401, { "WWW-Authenticate": "Bearer" }).end(); return;
      }
    }
    if (req.url !== "/mcp") { res.writeHead(404).end(); return; }
    if (req.method !== "POST") { res.writeHead(405, { Allow: "POST" }).end(); return; }
    if (!req.headers["content-type"]?.includes("application/json")) { res.writeHead(415).end(); return; }
    const server = createServer(key);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => { void transport.close(); void server.close(); });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch {
      if (!res.headersSent) res.writeHead(500).end();
      else res.end();
    }
  });
  http.requestTimeout = 35_000;
  http.listen(port, host);
  return http;
}
