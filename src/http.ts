// http.ts - the ONLY entry point. This server exists purely to run on
// Render (or any cloud host) over Streamable HTTP. No stdio mode here -
// keeping this build focused, per the decision to go all-in on HTTP.

import "dotenv/config";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { createServer } from "./server.js";
import type { Request, Response, NextFunction } from "express";

const PORT = Number(process.env.PORT) || 3000;

// Front-door lock: every /mcp request must carry the right key.
// Set MCP_API_KEY in Render env vars. Requests without it get a 401.
const MCP_API_KEY = process.env.MCP_API_KEY;
if (!MCP_API_KEY) {
  console.error("FATAL: MCP_API_KEY environment variable is not set.");
  process.exit(1);
}

function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  const provided = req.headers["x-api-key"];
  if (!provided || provided !== MCP_API_KEY) {
    res.status(401).json({ error: "Unauthorized: missing or invalid x-api-key header" });
    return;
  }
  next();
}

// Render sets this automatically once deployed - locks down which Host
// headers we'll accept, closing the DNS-rebinding warning.
const allowedHosts = process.env.RENDER_EXTERNAL_HOSTNAME
  ? [process.env.RENDER_EXTERNAL_HOSTNAME]
  : undefined;

const app = createMcpExpressApp({ host: "0.0.0.0", allowedHosts });

// Health check - what you'll see hitting the bare Render URL in a browser.
app.get("/", (_req, res) => {
  res.status(200).json({ status: "ok", service: "sf-mcp", transport: "streamable-http" });
});

// The real MCP endpoint. Stateless: a fresh server + transport per
// request. Simple and reliable - good starting point.
app.post("/mcp", requireApiKey, async (req, res) => {
  try {
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    res.on("close", () => {
      transport.close();
      server.close();
    });
  } catch (err) {
    console.error("Error handling MCP request:", err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

app.get("/mcp", requireApiKey, (_req, res) => {
  res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null });
});
app.delete("/mcp", requireApiKey, (_req, res) => {
  res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`sf-mcp listening on port ${PORT} (Streamable HTTP)`);
});
