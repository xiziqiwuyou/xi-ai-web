import assert from "node:assert/strict";
import test from "node:test";
import {
  MCP_ERROR_CODES,
  assertMcpServerCollection,
  mcpExecutionUnavailableError,
  normalizeMcpServerProfile,
  normalizeMcpServers,
  normalizeMcpToolDescriptors,
  parseMcpJsonRpcResult
} from "../../server/mcp/contract.mjs";

test("legacy metadata without MCP profiles normalizes to an empty collection", () => {
  assert.deepEqual(normalizeMcpServers(undefined), []);
  assert.deepEqual(normalizeMcpServers(null), []);
});
test("MCP profile normalization is bounded and strips undeclared fields", () => {
  const profile = normalizeMcpServerProfile({
    label: "  Public tools  ",
    endpoint: "https://mcp.example.test/tools",
    enabled: false
  }, { idFactory: () => "mcp-test" });
  assert.deepEqual(profile, {
    id: "mcp-test",
    label: "Public tools",
    endpoint: "https://mcp.example.test/tools",
    enabled: false,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt
  });
  assert.throws(
    () => normalizeMcpServerProfile({ label: "x", endpoint: "https://mcp.example.test", apiKey: "secret" }),
    (error) => error.code === MCP_ERROR_CODES.PROFILE_INVALID
  );
});

test("duplicate MCP IDs, labels, and endpoints are rejected on strict import", () => {
  const base = { id: "one", label: "One", endpoint: "https://one.example.test" };
  assert.throws(
    () => assertMcpServerCollection([base, { ...base, id: "two" }]),
    (error) => error.code === MCP_ERROR_CODES.PROFILE_INVALID
  );
  assert.throws(
    () => assertMcpServerCollection([base, { ...base, id: "two", endpoint: "https://two.example.test" }]),
    (error) => error.code === MCP_ERROR_CODES.PROFILE_INVALID
  );
  assert.throws(
    () => assertMcpServerCollection([base, { ...base, id: "two", label: "Two" }]),
    (error) => error.code === MCP_ERROR_CODES.PROFILE_INVALID
  );
  assert.equal(normalizeMcpServers([base, { ...base, id: "two" }]).length, 1);
});

test("MCP tool descriptors are bounded and marked untrusted", () => {
  const descriptors = normalizeMcpToolDescriptors([{
    name: "search.web",
    title: "Web search",
    description: "Searches a remote index",
    inputSchema: { type: "object", properties: { query: { type: "string" } } }
  }]);
  assert.equal(descriptors[0].name, "search.web");
  assert.equal(descriptors[0].requiresApproval, true);
  assert.equal(descriptors[0].untrusted, true);
  assert.throws(
    () => normalizeMcpToolDescriptors([
      { name: "duplicate" },
      { name: "duplicate" }
    ]),
    (error) => error.code === MCP_ERROR_CODES.PROTOCOL_ERROR
  );
  assert.throws(
    () => normalizeMcpToolDescriptors([{
      name: "too-deep",
      inputSchema: { a: { b: { c: { d: { e: { f: { g: { h: { i: true } } } } } } } } }
    }]),
    (error) => error.code === MCP_ERROR_CODES.PROTOCOL_ERROR
  );
});

test("JSON-RPC result and execution gate use closed contracts", () => {
  assert.deepEqual(parseMcpJsonRpcResult({ jsonrpc: "2.0", id: "id", result: {} }, "id"), {});
  assert.throws(
    () => parseMcpJsonRpcResult({ jsonrpc: "2.0", id: "other", result: {} }, "id"),
    (error) => error.code === MCP_ERROR_CODES.PROTOCOL_ERROR
  );
  assert.equal(mcpExecutionUnavailableError().code, MCP_ERROR_CODES.EXECUTION_NOT_AVAILABLE);
  assert.equal(mcpExecutionUnavailableError().status, 501);
});
