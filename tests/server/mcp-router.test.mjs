import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import express from "express";
import { McpError } from "../../server/mcp/contract.mjs";
import { createMcpAdminRouter } from "../../server/mcp/routes.mjs";

const endpoint = "https://mcp.example.test/mcp";

function profile() {
  return {
    id: "mcp-test",
    label: "MCP Test",
    endpoint,
    enabled: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}

function successRequest(calls) {
  return async (_target, body) => {
    calls.push(body.method);
    if (body.method === "initialize") {
      return {
        status: 200,
        headers: {},
        body: { jsonrpc: "2.0", id: body.id, result: { protocolVersion: "2025-06-18" } }
      };
    }
    if (body.method === "notifications/initialized") return { status: 202, headers: {}, body: "" };
    return {
      status: 200,
      headers: {},
      body: { jsonrpc: "2.0", id: body.id, result: { tools: [] } }
    };
  };
}

async function withRouter(options, work) {
  let profiles = [profile()];
  const audits = [];
  const app = express();
  app.use(express.json({ limit: "64kb" }));
  app.use("/mcp-servers", createMcpAdminRouter({
    getProfiles: () => profiles,
    setProfiles: (next) => { profiles = next; },
    save: () => {},
    audit: (action, details) => audits.push({ action, details }),
    production: true,
    lookup: async () => [{ address: "203.0.113.10", family: 4 }],
    ...options
  }));
  app.use((error, _req, res, _next) => {
    if (error instanceof McpError) {
      res.status(error.status).json({ error: { code: error.code, message: error.message } });
      return;
    }
    res.status(500).json({ error: "unexpected" });
  });
  const server = http.createServer(app);
  await new Promise((resolve, reject) => server.listen(0, "127.0.0.1", resolve).once("error", reject));
  try {
    await work({
      origin: `http://127.0.0.1:${server.address().port}`,
      audits,
      getProfiles: () => profiles
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("MCP discovery rate limits by profile before a second remote handshake", async () => {
  const calls = [];
  await withRouter({ requestImpl: successRequest(calls), rateLimitMaxRequests: 1 }, async ({ origin }) => {
    let response = await fetch(`${origin}/mcp-servers/mcp-test/discover`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}"
    });
    assert.equal(response.status, 200);
    response = await fetch(`${origin}/mcp-servers/mcp-test/discover`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}"
    });
    assert.equal(response.status, 429);
    assert.equal(response.headers.get("retry-after"), "60");
    assert.deepEqual(calls, ["initialize", "notifications/initialized", "tools/list"]);
  });
});
test("MCP deletion is rejected while discovery is in flight", async () => {
  let releaseList;
  let listStarted;
  const started = new Promise((resolve) => { listStarted = resolve; });
  const release = new Promise((resolve) => { releaseList = resolve; });
  const requestImpl = async (_target, body) => {
    if (body.method === "initialize") {
      return { status: 200, headers: {}, body: { jsonrpc: "2.0", id: body.id, result: { protocolVersion: "2025-06-18" } } };
    }
    if (body.method === "notifications/initialized") return { status: 202, headers: {}, body: "" };
    listStarted();
    await release;
    return { status: 200, headers: {}, body: { jsonrpc: "2.0", id: body.id, result: { tools: [] } } };
  };

  await withRouter({ requestImpl }, async ({ origin, getProfiles }) => {
    const discovery = fetch(`${origin}/mcp-servers/mcp-test/discover`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}"
    });
    await started;
    const deletion = await fetch(`${origin}/mcp-servers/mcp-test`, { method: "DELETE" });
    assert.equal(deletion.status, 409);
    assert.equal((await deletion.json()).error.code, "MCP_DISCOVERY_IN_PROGRESS");
    assert.equal(getProfiles().length, 1);
    releaseList();
    assert.equal((await discovery).status, 200);
  });
});

test("MCP route redacts arbitrary transport errors and audits only safe metadata", async () => {
  await withRouter({
    requestImpl: async () => {
      throw new Error(`secret response from ${endpoint}?token=unsafe`);
    }
  }, async ({ origin, audits }) => {
    const response = await fetch(`${origin}/mcp-servers/mcp-test/discover`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}"
    });
    assert.equal(response.status, 502);
    const serialized = JSON.stringify(await response.json());
    assert.equal(serialized.includes(endpoint), false);
    assert.equal(serialized.includes("token=unsafe"), false);
    assert.equal(JSON.stringify(audits).includes(endpoint), false);
    assert.equal(JSON.stringify(audits).includes("token=unsafe"), false);
  });
});
