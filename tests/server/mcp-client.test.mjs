import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { MCP_ERROR_CODES, MCP_LIMITS } from "../../server/mcp/contract.mjs";
import { discoverMcpTools, requestMcpJson } from "../../server/mcp/client.mjs";
import { APP_VERSION } from "../../server/app-version.mjs";

async function withHttpServer(handler, work) {
  const server = http.createServer(handler);
  await new Promise((resolve, reject) => server.listen(0, "127.0.0.1", resolve).once("error", reject));
  const port = server.address().port;
  const target = {
    url: `http://127.0.0.1:${port}/mcp`,
    hostname: "127.0.0.1",
    address: "127.0.0.1",
    family: 4,
    port,
    protocol: "http:"
  };
  try {
    await work(target);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("MCP discovery performs initialize, notification, and tools/list without execution", async () => {
  const calls = [];
  let lookupCalls = 0;
  const result = await discoverMcpTools({
    profileId: "mcp-profile",
    endpoint: "https://mcp.example.test/tools",
    production: true,
    lookup: async () => {
      lookupCalls += 1;
      return lookupCalls === 1
        ? [{ address: "203.0.113.10", family: 4 }]
        : [{ address: "10.0.0.8", family: 4 }];
    },
    requestImpl: async (target, body, options) => {
      calls.push({ target, body, options });
      if (body.method === "initialize") {
        return {
          status: 200,
          headers: { "mcp-session-id": "session-only" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: body.id,
            result: { protocolVersion: "2025-06-18", capabilities: {}, serverInfo: { name: "remote" } }
          })
        };
      }
      if (body.method === "notifications/initialized") return { status: 202, headers: {}, body: "" };
      return {
        status: 200,
        headers: {},
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: { tools: [{ name: "read", description: "Reads data", inputSchema: { type: "object" } }] }
        })
      };
    }
  });

  assert.equal(calls.length, 3);
  assert.equal(lookupCalls, 1);
  assert.deepEqual(calls.map((call) => call.body.method), ["initialize", "notifications/initialized", "tools/list"]);
  assert.equal(calls[0].body.params.clientInfo.version, APP_VERSION);
  assert.equal(calls[1].options.sessionId, "session-only");
  assert.equal(calls[2].options.sessionId, "session-only");
  assert.equal(calls[0].target.address, "203.0.113.10");
  assert.equal(result.profileId, "mcp-profile");
  assert.equal(result.tools[0].requiresApproval, true);
  assert.equal(result.tools[0].untrusted, true);
  assert.equal("endpoint" in result, false);
});

test("MCP discovery cancellation stops before any network request", async () => {
  const controller = new AbortController();
  controller.abort();
  let requests = 0;
  await assert.rejects(
    discoverMcpTools({
      profileId: "mcp-profile",
      endpoint: "https://mcp.example.test/tools",
      signal: controller.signal,
      production: true,
      lookup: async () => [{ address: "203.0.113.10", family: 4 }],
      requestImpl: async () => {
        requests += 1;
        throw new Error("unexpected request");
      }
    }),
    (error) => error.code === MCP_ERROR_CODES.CANCELLED
  );
  assert.equal(requests, 0);
});

test("MCP transport enforces timeout and response-size limits", async () => {
  await withHttpServer(async (req, _res) => {
    for await (const _chunk of req) {}
  }, async (target) => {
    await assert.rejects(
      requestMcpJson(target, { jsonrpc: "2.0", id: "timeout", method: "initialize", params: {} }, { timeoutMs: 25 }),
      (error) => error.code === MCP_ERROR_CODES.TIMEOUT
    );
  });

  await withHttpServer(async (req, res) => {
    for await (const _chunk of req) {}
    res.setHeader("content-type", "application/json");
    res.end(`"${"x".repeat(MCP_LIMITS.maxResponseBytes + 1)}"`);
  }, async (target) => {
    await assert.rejects(
      requestMcpJson(target, { jsonrpc: "2.0", id: "large", method: "initialize", params: {} }),
      (error) => error.code === MCP_ERROR_CODES.RESPONSE_TOO_LARGE
    );
  });
});

test("MCP discovery never turns a transport error into a successful empty result", async () => {
  await assert.rejects(
    discoverMcpTools({
      profileId: "mcp-profile",
      endpoint: "https://mcp.example.test/tools",
      production: true,
      lookup: async () => [{ address: "203.0.113.10", family: 4 }],
      requestImpl: async () => ({
        status: 200,
        headers: { "content-type": "text/event-stream" },
        body: "event: message\\n\\n"
      })
    }),
    (error) => error.code === MCP_ERROR_CODES.TRANSPORT_UNSUPPORTED
  );
});
