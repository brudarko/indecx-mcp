#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { startHttp } from "./http.js";

const key = process.env.INDECX_COMPANY_KEY ?? "";
if (!key.trim() || /[\r\n]/.test(key)) {
  console.error("Set INDECX_COMPANY_KEY before starting indecx-mcp.");
  process.exit(1);
}
const transport = process.env.MCP_TRANSPORT ?? "stdio";
if (transport === "stdio") {
  await createServer(key).connect(new StdioServerTransport());
} else if (transport === "http") {
  const port = Number(process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid PORT");
  const http = startHttp(key, {
    host: process.env.HOST ?? "127.0.0.1", port,
    token: process.env.MCP_BEARER_TOKEN,
  });
  process.on("SIGTERM", () => http.close());
  process.on("SIGINT", () => http.close());
} else {
  throw new Error("MCP_TRANSPORT must be stdio or http");
}
