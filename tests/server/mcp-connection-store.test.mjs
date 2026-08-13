import assert from "node:assert/strict";
import test from "node:test";
import { createMcpConnectionStore } from "../../server/mcp/connection-store.mjs";

const tools = [
  {
    name: "fixture.read",
    label: "Fixture read",
    description: "Read-only fixture",
    inputSchema: { type: "object", properties: {} }
  }
];

test("user MCP connections are opaque, session-bound, and never expose endpoints", () => {
  const removed = [];
  const store = createMcpConnectionStore({
    now: () => 10_000,
    randomBytes: (size) => Buffer.alloc(size, 4),
    onRemove: (record) => removed.push(record)
  });
  const connection = store.create({
    sessionId: "session-one",
    endpoint: "https://mcp.example.test/mcp",
    tools
  });
  assert.equal("label" in connection, false);
  assert.equal("endpoint" in connection, false);
  assert.equal(connection.tools[0].source, "user");
  assert.equal("inputSchema" in connection.tools[0], false);
  assert.equal(store.list("session-other").length, 0);
  assert.throws(
    () => store.resolveTools({ sessionId: "session-other", requestedIds: [connection.tools[0].id] }),
    (error) => error.code === "MCP_CONNECTION_NOT_FOUND"
  );
  const resolved = store.resolveTools({ sessionId: "session-one", requestedIds: [connection.tools[0].id] });
  assert.equal(resolved[0].connectionId, connection.id);
  assert.equal(store.resolveLiveTool({
    sessionId: "session-one",
    connectionId: connection.id,
    toolName: "fixture.read",
    toolId: connection.tools[0].id
  }).endpoint, "https://mcp.example.test/mcp");
  assert.equal(store.size, 1);
});

test("user MCP connections expire and disconnect invalidates by opaque profile id", () => {
  let now = 1_000;
  const removed = [];
  const store = createMcpConnectionStore({
    ttlMs: 500,
    now: () => now,
    onRemove: (record) => removed.push(record)
  });
  const connection = store.create({
    sessionId: "session-one",
    endpoint: "https://mcp.example.test/mcp",
    tools
  });
  store.disconnect({ sessionId: "session-one", connectionId: connection.id });
  assert.equal(store.size, 0);
  assert.equal(removed[0].profileId, connection.profileId);
  const expired = store.create({
    sessionId: "session-one",
    endpoint: "https://mcp.example.test/mcp",
    tools
  });
  now += 501;
  assert.equal(store.list("session-one").length, 0);
  assert.throws(
    () => store.resolveTools({ sessionId: "session-one", requestedIds: [expired.tools[0].id] }),
    (error) => error.code === "MCP_TOOL_NOT_ALLOWED"
  );
});

test("user MCP connection capacity is bounded per session", () => {
  const store = createMcpConnectionStore({ capacity: 1, maxPerSession: 1 });
  const input = {
    sessionId: "session-one",
    endpoint: "https://mcp.example.test/mcp",
    tools
  };
  store.create(input);
  assert.throws(
    () => store.create(input),
    (error) => error.code === "MCP_CONNECTION_CAPACITY"
  );
});
