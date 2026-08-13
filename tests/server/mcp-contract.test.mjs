import assert from "node:assert/strict";
import test from "node:test";
import {
  MCP_ERROR_CODES,
  assertMcpServerCollection,
  digestMcpToolArguments,
  mcpExecutionUnavailableError,
  normalizeMcpServerProfile,
  normalizeMcpApprovalBinding,
  normalizeMcpServers,
  normalizeMcpToolArguments,
  normalizeMcpToolDescriptors,
  parseMcpJsonRpcResult,
  projectMcpToolResult
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
    executionEnabled: false,
    allowedToolNames: [],
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt
  });
  assert.deepEqual(
    normalizeMcpServerProfile({
      label: "Allowed tools",
      endpoint: "https://mcp.example.test/tools",
      executionEnabled: true,
      allowedToolNames: ["read", "read", "search.web"]
    }, { idFactory: () => "mcp-allowed" }).allowedToolNames,
    ["read", "search.web"]
  );
  assert.throws(
    () => normalizeMcpServerProfile({ label: "x", endpoint: "https://mcp.example.test", apiKey: "secret" }),
    (error) => error.code === MCP_ERROR_CODES.PROFILE_INVALID
  );
  assert.throws(
    () => normalizeMcpServerProfile({ label: "x", endpoint: "https://mcp.example.test", allowedToolNames: ["bad name"] }),
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

test("MCP tool arguments are bounded and have a stable secret-free digest", () => {
  const first = normalizeMcpToolArguments({ nested: { b: 2, a: 1 }, list: [true, "ok"] });
  const second = normalizeMcpToolArguments({ list: [true, "ok"], nested: { a: 1, b: 2 } });
  assert.deepEqual(first, {
    nested: { b: 2, a: 1 },
    list: [true, "ok"]
  });
  assert.equal(digestMcpToolArguments(first), digestMcpToolArguments(second));
  assert.throws(
    () => normalizeMcpToolArguments([]),
    (error) => error.code === MCP_ERROR_CODES.ARGUMENTS_INVALID
  );
  assert.throws(
    () => normalizeMcpToolArguments({ constructor: "blocked" }),
    (error) => error.code === MCP_ERROR_CODES.ARGUMENTS_INVALID
  );
  assert.throws(
    () => normalizeMcpToolArguments({ value: Number.NaN }),
    (error) => error.code === MCP_ERROR_CODES.ARGUMENTS_INVALID
  );
  assert.throws(
    () => normalizeMcpToolArguments({ value: "x".repeat(4_097) }),
    (error) => error.code === MCP_ERROR_CODES.ARGUMENTS_INVALID
  );
  assert.throws(
    () => normalizeMcpToolArguments({ value: undefined }),
    (error) => error.code === MCP_ERROR_CODES.ARGUMENTS_INVALID
  );
});

test("MCP result projection is bounded, marked untrusted, and non-navigable", () => {
  const projected = projectMcpToolResult({
    isError: false,
    content: [
      { type: "text", text: "<script>alert(1)</script>" },
      {
        type: "resource",
        resource: { uri: "https://private.example/result", mimeType: "text/plain", text: "resource text" }
      },
      {
        type: "resource_link",
        uri: "https://private.example/file",
        name: "file.txt",
        description: "download me"
      }
    ],
    structuredContent: {
      safe: "<frame>",
      url: "https://private.example/result",
      apiKey: "sk-this-must-not-reach-the-model"
    }
  });
  assert.equal(projected.type, "mcp_tool_result");
  assert.equal(projected.untrusted, true);
  assert.equal(projected.content[0].text, "&lt;script&gt;alert(1)&lt;/script&gt;");
  assert.equal("uri" in projected.content[1], false);
  assert.equal("uri" in projected.content[2], false);
  assert.equal(projected.structuredContent.safe, "&lt;frame&gt;");
  assert.equal("url" in projected.structuredContent, false);
  assert.equal(projected.structuredContent.apiKey, "[redacted]");
  assert.throws(
    () => projectMcpToolResult({ content: [{ type: "image", data: "secret" }] }),
    (error) => error.code === MCP_ERROR_CODES.RESULT_INVALID
  );
  assert.throws(
    () => projectMcpToolResult({ content: [{ type: "text", text: "same" }, { type: "text", text: "same" }] }),
    (error) => error.code === MCP_ERROR_CODES.RESULT_INVALID
  );
  assert.throws(
    () => projectMcpToolResult({ content: [{ type: "text", text: "ok" }], raw: "must reject" }),
    (error) => error.code === MCP_ERROR_CODES.RESULT_INVALID
  );
});

test("MCP approval binding is closed and contains only stable identifiers", () => {
  const binding = normalizeMcpApprovalBinding({
    sessionId: "session-1",
    turnId: "turn-1",
    profileId: "mcp-test",
    toolName: "search.web",
    providerAlias: "mcp_123",
    argumentsDigest: "A".repeat(64)
  });
  assert.equal(binding.argumentsDigest, "a".repeat(64));
  assert.throws(
    () => normalizeMcpApprovalBinding({ ...binding, apiKey: "sk-secret" }),
    (error) => error.code === MCP_ERROR_CODES.APPROVAL_INVALID
  );
  assert.throws(
    () => normalizeMcpApprovalBinding({ ...binding, argumentsDigest: "preview-secret" }),
    (error) => error.code === MCP_ERROR_CODES.APPROVAL_INVALID
  );
});
