import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import express from "express";
import {
  createKnowledgeRouter,
  knowledgeErrorMiddleware
} from "../../server/knowledge-cloud/routes.mjs";
import { KNOWLEDGE_ERROR_CODES } from "../../server/knowledge-cloud/errors.mjs";

async function withServer(runtime, work) {
  const app = express();
  app.use("/api/kb", createKnowledgeRouter(runtime));
  app.use((error, req, res, next) => {
    req.knowledgeRuntime = runtime;
    knowledgeErrorMiddleware(error, req, res, next);
  });
  const server = http.createServer(app);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  try {
    await work(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("disabled knowledge reports status but rejects feature routes", async () => {
  await withServer(
    {
      enabled: false,
      available: false,
      state: "disabled",
      reasonCode: KNOWLEDGE_ERROR_CODES.DISABLED
    },
    async (baseUrl) => {
      const health = await fetch(`${baseUrl}/api/kb/health`);
      const healthBody = await health.json();
      assert.equal(health.status, 200);
      assert.equal(healthBody.knowledge.state, "disabled");
      assert.equal(health.headers.get("x-request-id"), healthBody.requestId);

      const route = await fetch(`${baseUrl}/api/kb/bases`);
      const body = await route.json();
      assert.equal(route.status, 503);
      assert.equal(body.error.code, KNOWLEDGE_ERROR_CODES.DISABLED);
      assert.equal(route.headers.get("x-request-id"), body.error.requestId);
    }
  );
});

test("enabled but invalid knowledge fails closed with a sanitized reason", async () => {
  await withServer(
    {
      enabled: true,
      available: false,
      state: "unavailable",
      reasonCode: KNOWLEDGE_ERROR_CODES.MIGRATIONS_REQUIRED
    },
    async (baseUrl) => {
      const health = await fetch(`${baseUrl}/api/kb/health`);
      assert.equal(health.status, 503);
      const route = await fetch(`${baseUrl}/api/kb/bases`);
      const body = await route.json();
      assert.equal(route.status, 503);
      assert.equal(body.error.code, KNOWLEDGE_ERROR_CODES.UNAVAILABLE);
      assert.equal(body.error.details.reasonCode, KNOWLEDGE_ERROR_CODES.MIGRATIONS_REQUIRED);
    }
  );
});

test("ready foundation returns a typed 404 for routes owned by later phases", async () => {
  await withServer(
    {
      enabled: true,
      available: true,
      state: "ready",
      reasonCode: null,
      schemaVersion: 2,
      vectorVersion: "0.8.1"
    },
    async (baseUrl) => {
      const route = await fetch(`${baseUrl}/api/kb/not-yet-implemented`);
      const body = await route.json();
      assert.equal(route.status, 404);
      assert.equal(body.error.code, KNOWLEDGE_ERROR_CODES.ROUTE_NOT_FOUND);
    }
  );
});

test("malformed knowledge JSON is a typed 400 instead of an internal error", async () => {
  await withServer(
    {
      enabled: true,
      available: true,
      state: "ready",
      reasonCode: null,
      schemaVersion: 2,
      vectorVersion: "0.8.1"
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/kb/bases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{not-json"
      });
      const body = await response.json();
      assert.equal(response.status, 400);
      assert.equal(body.error.code, KNOWLEDGE_ERROR_CODES.INVALID_REQUEST);
      assert.equal(response.headers.get("x-request-id"), body.error.requestId);
    }
  );
});

test("knowledge routes reject oversized JSON before route handling", async () => {
  await withServer(
    {
      enabled: true,
      available: true,
      state: "ready",
      reasonCode: null,
      schemaVersion: 3,
      vectorVersion: "0.8.1"
    },
    async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/kb/bases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: "x".repeat(70 * 1024) })
      });
      const body = await response.json();
      assert.equal(response.status, 413);
      assert.equal(body.error.code, KNOWLEDGE_ERROR_CODES.REQUEST_TOO_LARGE);
      assert.equal(response.headers.get("x-request-id"), body.error.requestId);
    }
  );
});
