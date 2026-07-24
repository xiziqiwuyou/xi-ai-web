import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import express from "express";
import { createLangflowRouter } from "../../server/langflow/routes.mjs";

const workflow = {
  id: "published-support",
  flowId: "langflow-support-flow",
  name: "Support flow",
  description: "Support conversations",
  welcomeMessage: "Welcome",
  inputPlaceholder: "Ask a question",
  tags: ["support"],
  enabled: true,
  order: 10,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

const config = {
  enabled: true,
  configured: true,
  available: true,
  baseUrl: "https://langflow.example.test",
  apiKey: "server-langflow-secret",
  workflowPath: "/api/v2/workflows",
  timeoutMs: 500
};

function streamResponse(body) {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream" }
  });
}

async function withRouter(options, callback) {
  const app = express();
  app.use("/api/workflows", createLangflowRouter(options));
  app.use((error, _req, res, _next) => {
    if (res.headersSent) return;
    res.status(error.status || 500).json({ error: error.message || "unexpected" });
  });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    return await callback(baseUrl);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function requestBody() {
  return {
    input: "Summarize this issue",
    sessionId: "session-e2e",
    modelId: "public-model-id",
    connection: {
      baseUrl: "https://user-provider.example/v1",
      apiKey: "user-provider-secret"
    }
  };
}

test("returns only published workflows and streams a conversation result", async () => {
  const calls = [];
  const response = await withRouter({
    config,
    getPublishedWorkflows: () => [workflow, { ...workflow, id: "hidden", enabled: false }],
    resolveRuntime: () => ({
      connection: requestBody().connection,
      entry: { id: "public-model-id", model: "actual-model-name", vendor: "openai" }
    }),
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return streamResponse(
        'event: token\ndata: {"token":"Hello "}\n\n' +
        'event: token\ndata: {"token":"world"}\n\n' +
        'event: done\ndata: {"text":"Hello world"}\n\n'
      );
    },
    rateLimitMaxRequests: 5
  }, async (baseUrl) => {
    const status = await fetch(`${baseUrl}/api/workflows/status`);
    assert.equal(status.status, 200);
    assert.deepEqual(await status.json(), {
      enabled: true,
      available: true,
      workflowCount: 1
    });

    const result = await fetch(`${baseUrl}/api/workflows/${workflow.id}/stream`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requestBody())
    });
    const text = await result.text();
    assert.equal(result.status, 200);
    assert.match(text, /event: meta/);
    assert.match(text, /"token":"Hello "/);
    assert.match(text, /"token":"world"/);
    assert.match(text, /event: done/);
    return result;
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://langflow.example.test/api/v2/workflows");
  assert.equal(calls[0].options.headers["x-api-key"], config.apiKey);
  assert.equal(calls[0].options.headers["X-LANGFLOW-GLOBAL-VAR-XI_API_KEY"], "user-provider-secret");
  assert.equal(calls[0].options.headers["X-LANGFLOW-GLOBAL-VAR-XI_MODEL_NAME"], "actual-model-name");
  assert.equal(JSON.parse(calls[0].options.body).flow_id, workflow.flowId);
});

test("rejects unpublished flows before invoking Langflow", async () => {
  let calls = 0;
  await withRouter({
    config,
    getPublishedWorkflows: () => [workflow],
    resolveRuntime: () => { throw new Error("runtime must not be resolved"); },
    fetchImpl: async () => {
      calls += 1;
      return streamResponse("");
    }
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/workflows/not-published/stream`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requestBody())
    });
    assert.equal(response.status, 404);
  });
  assert.equal(calls, 0);
});

test("redacts both server and BYOK secrets from upstream errors", async () => {
  await withRouter({
    config,
    getPublishedWorkflows: () => [workflow],
    resolveRuntime: () => ({
      connection: requestBody().connection,
      entry: { id: "model", model: "model", vendor: "openai" }
    }),
    fetchImpl: async () => new Response(
      "upstream server-langflow-secret user-provider-secret details",
      { status: 401, headers: { "content-type": "text/plain" } }
    )
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/workflows/${workflow.id}/stream`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requestBody())
    });
    const body = await response.json();
    assert.equal(response.status, 502);
    assert.equal(body.error.code, "LANGFLOW_UPSTREAM_ERROR");
    assert.equal(body.error.message.includes("server-langflow-secret"), false);
    assert.equal(body.error.message.includes("user-provider-secret"), false);
    assert.match(body.error.message, /REDACTED/);
  });
});

test("enforces the per-flow rate limit", async () => {
  let calls = 0;
  await withRouter({
    config,
    getPublishedWorkflows: () => [workflow],
    resolveRuntime: () => ({
      connection: requestBody().connection,
      entry: { id: "model", model: "model", vendor: "openai" }
    }),
    fetchImpl: async () => {
      calls += 1;
      return streamResponse('event: done\ndata: {}\n\n');
    },
    rateLimitWindowMs: 60_000,
    rateLimitMaxRequests: 1
  }, async (baseUrl) => {
    const request = () => fetch(`${baseUrl}/api/workflows/${workflow.id}/stream`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requestBody())
    });
    const first = await request();
    await first.text();
    const second = await request();
    assert.equal(second.status, 429);
    assert.ok(Number(second.headers.get("retry-after")) >= 1);
  });
  assert.equal(calls, 1);
});

test("reports disabled Langflow without contacting the upstream", async () => {
  let calls = 0;
  await withRouter({
    config: { ...config, enabled: false },
    getPublishedWorkflows: () => [workflow],
    resolveRuntime: () => ({
      connection: requestBody().connection,
      entry: { id: "model", model: "model", vendor: "openai" }
    }),
    fetchImpl: async () => {
      calls += 1;
      return streamResponse("");
    }
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/workflows/${workflow.id}/stream`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requestBody())
    });
    const body = await response.json();
    assert.equal(response.status, 503);
    assert.equal(body.error.code, "LANGFLOW_DISABLED");
  });
  assert.equal(calls, 0);
});
