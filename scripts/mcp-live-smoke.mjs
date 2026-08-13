import assert from "node:assert/strict";
import { callMcpTool, discoverMcpTools } from "../server/mcp/client.mjs";
import { assertSafeMcpEndpoint } from "../server/mcp/security.mjs";

const endpoint = String(process.env.MCP_LIVE_ENDPOINT || "").trim();
const expectedTool = String(process.env.MCP_LIVE_EXPECT_TOOL || "").trim();
const callTool = String(process.env.MCP_LIVE_CALL_TOOL || "").trim();
const callArgumentsSource = String(process.env.MCP_LIVE_CALL_ARGUMENTS_JSON || "{}");
const timeoutMs = Math.max(2_000, Math.min(30_000, Number(process.env.MCP_LIVE_TIMEOUT_MS || 12_000)));

if (!endpoint) {
  console.log("SKIP: MCP_LIVE_ENDPOINT is not configured; no real public MCP smoke was executed.");
  process.exit(0);
}

const target = await assertSafeMcpEndpoint(endpoint, {
  production: true,
  allowLocal: false,
  allowInsecureHttp: false
});
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(new Error("MCP live smoke timeout")), timeoutMs);
timeout.unref?.();

try {
  const discovery = await discoverMcpTools({
    profileId: "operator-live-smoke",
    endpoint: target.url,
    signal: controller.signal,
    production: true,
    allowLocal: false,
    allowInsecureHttp: false
  });
  assert(discovery.tools.length > 0, "The MCP endpoint returned no usable tools");
  if (expectedTool) {
    assert(
      discovery.tools.some((tool) => tool.name === expectedTool),
      "The expected MCP tool was not discovered"
    );
  }
  let callSummary = null;
  if (callTool) {
    assert(
      discovery.tools.some((tool) => tool.name === callTool),
      "The requested MCP smoke tool was not discovered"
    );
    let callArguments;
    try {
      callArguments = JSON.parse(callArgumentsSource);
    } catch {
      throw new Error("MCP_LIVE_CALL_ARGUMENTS_JSON must be valid JSON");
    }
    assert(
      callArguments && typeof callArguments === "object" && !Array.isArray(callArguments),
      "MCP_LIVE_CALL_ARGUMENTS_JSON must contain a JSON object"
    );
    const result = await callMcpTool({
      endpoint: target.url,
      toolName: callTool,
      arguments: callArguments,
      signal: controller.signal,
      production: true,
      allowLocal: false,
      allowInsecureHttp: false
    });
    callSummary = {
      tool: callTool,
      isError: result.isError,
      contentItems: result.content.length,
      hasStructuredContent: result.structuredContent !== undefined
    };
  }
  console.log(JSON.stringify({
    ok: true,
    host: target.hostname,
    protocolVersion: discovery.protocolVersion,
    toolCount: discovery.tools.length,
    truncated: discovery.truncated,
    call: callSummary
  }));
} finally {
  clearTimeout(timeout);
}
