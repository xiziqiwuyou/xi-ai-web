import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const rootDir = path.resolve(import.meta.dirname, "../..");

async function freePort() {
  const server = http.createServer();
  await new Promise((resolve, reject) => server.listen(0, "127.0.0.1", resolve).once("error", reject));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

function parseFrame(frame) {
  const event = frame.split(/\r?\n/u).find((line) => line.startsWith("event:"))?.slice(6).trim();
  const data = frame.split(/\r?\n/u).filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim()).join("\n");
  return event && data ? { event, data: JSON.parse(data) } : null;
}

async function stop(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 2_000))
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

test("Chat MCP approval executes exactly one remote tool call after confirmation", { timeout: 60_000 }, async (t) => {
  const mcpCalls = [];
  const providerBodies = [];
  let providerToolName = "";
  const upstream = http.createServer(async (req, res) => {
    const body = await readJson(req);
    res.setHeader("content-type", "application/json");
    if (req.url === "/mcp") {
      if (body.method === "initialize") {
        res.setHeader("mcp-session-id", "route-session");
        res.end(JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: { protocolVersion: "2025-06-18", capabilities: { tools: {} } }
        }));
        return;
      }
      if (body.method === "notifications/initialized") {
        res.statusCode = 202;
        res.end();
        return;
      }
      if (body.method === "tools/list") {
        res.end(JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            tools: [{
              name: "fixture.read",
              title: "Fixture read",
              description: "Read-only fixture",
              inputSchema: { type: "object", properties: { query: { type: "string" } } }
            }]
          }
        }));
        return;
      }
      if (body.method === "tools/call") {
        mcpCalls.push({ body, headers: req.headers });
        res.end(JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: { content: [{ type: "text", text: "remote fixture result" }] }
        }));
        return;
      }
    }
    if (req.url === "/v1/responses") {
      providerBodies.push(body);
      if (!providerToolName) providerToolName = body.tools?.[0]?.name || "";
      const isFollowUp = Boolean(body.previous_response_id || body.input?.some?.((item) => item.type === "function_call_output"));
      res.end(JSON.stringify(isFollowUp
        ? { id: "response-2", output: [{ type: "message", content: [{ type: "output_text", text: "approved answer" }] }], usage: {} }
        : { id: "response-1", output: [{ type: "function_call", call_id: "call-1", name: providerToolName, arguments: JSON.stringify({ query: "safe" }) }] }));
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: "not found" }));
  });
  await new Promise((resolve, reject) => upstream.listen(0, "127.0.0.1", resolve).once("error", reject));
  t.after(() => upstream.close());

  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "xi-ai-mcp-chat-"));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const port = await freePort();
  const child = spawn(process.execPath, ["server/index.mjs"], {
    cwd: rootDir,
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: dataDir,
      NODE_ENV: "development",
      ADMIN_USERNAME: "xizi2333",
      ADMIN_PASSWORD: "mcp-chat-test-password",
      UPSTREAM_BASE_URL: `http://127.0.0.1:${upstream.address().port}`,
      ALLOW_LOCAL_UPSTREAM: "true",
      MCP_ALLOW_LOCAL_ENDPOINTS: "true",
      MCP_ALLOW_INSECURE_HTTP: "true",
      KNOWLEDGE_ENABLED: "false",
      LANGFLOW_ENABLED: "false"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  t.after(() => stop(child));
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  const baseUrl = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`server exited: ${output}`);
    try {
      if ((await fetch(`${baseUrl}/api/health`)).ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
    if (attempt === 199) throw new Error(`server did not start: ${output}`);
  }

  const login = await fetch(`${baseUrl}/api/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "xizi2333", password: "mcp-chat-test-password" })
  });
  const adminCookie = String(login.headers.get("set-cookie") || "").split(";", 1)[0];
  const adminHeaders = { "content-type": "application/json", cookie: adminCookie };
  const create = await fetch(`${baseUrl}/api/admin/mcp-servers`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({ label: "Fixture MCP", endpoint: `http://127.0.0.1:${upstream.address().port}/mcp`, enabled: true })
  });
  const profile = await create.json();
  assert.equal(profile.executionEnabled, false);
  await fetch(`${baseUrl}/api/admin/mcp-execution`, {
    method: "PATCH",
    headers: adminHeaders,
    body: JSON.stringify({ enabled: true })
  });
  const allow = await fetch(`${baseUrl}/api/admin/mcp-servers/${profile.id}/execution`, {
    method: "PUT",
    headers: adminHeaders,
    body: JSON.stringify({ executionEnabled: true, allowedToolNames: ["fixture.read"] })
  });
  assert.equal(allow.status, 200);

  const bootstrap = await (await fetch(`${baseUrl}/api/public/bootstrap`)).json();
  const publicTool = bootstrap.mcpExecution.tools[0];
  assert.equal(publicTool.name, "fixture.read");
  assert.equal("endpoint" in publicTool, false);
  const sessionResponse = await fetch(`${baseUrl}/api/chat/mcp/session`);
  const cookie = String(sessionResponse.headers.get("set-cookie") || "").split(";", 1)[0];
  const { csrfToken } = await sessionResponse.json();

  const invalidApprovalPayload = await fetch(`${baseUrl}/api/chat/mcp/approvals/unknown/approve`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie, "x-mcp-csrf": csrfToken },
    body: JSON.stringify({ profileId: profile.id })
  });
  assert.equal(invalidApprovalPayload.status, 400);
  assert.equal(mcpCalls.length, 0);
  assert.equal(providerBodies.length, 0);

  const chat = await fetch(`${baseUrl}/api/chat/stream`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      content: "read the fixture",
      displayContent: "read the fixture",
      modelId: "openai-gpt-5-6-luna",
      connection: { apiKey: "sk-chat-mcp-test" },
      allowedTools: [],
      mcpToolIds: [publicTool.id],
      streamOutput: false
    })
  });
  assert.equal(chat.status, 200);
  const reader = chat.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const events = [];
  let approval;
  while (!approval) {
    const next = await reader.read();
    if (next.done) break;
    buffer += decoder.decode(next.value, { stream: true });
    const frames = buffer.split(/\r?\n\r?\n/u);
    buffer = frames.pop() || "";
    for (const frame of frames) {
      const parsed = parseFrame(frame);
      if (!parsed) continue;
      events.push(parsed);
      if (parsed.event === "mcp_approval_required") approval = parsed.data.approval;
    }
  }
  assert.ok(approval, JSON.stringify({ events, output, providerBodies, mcpCalls }));
  assert.equal(mcpCalls.length, 0);
  const forgedApproval = await fetch(`${baseUrl}/api/chat/mcp/approvals/${approval.id}/approve`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie, "x-mcp-csrf": "forged-csrf-token-that-is-long-enough-000000" },
    body: "{}"
  });
  assert.equal(forgedApproval.status, 403);
  assert.equal(mcpCalls.length, 0);
  const approved = await fetch(`${baseUrl}/api/chat/mcp/approvals/${approval.id}/approve`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie, "x-mcp-csrf": csrfToken },
    body: "{}"
  });
  assert.equal(approved.status, 200);
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    buffer += decoder.decode(next.value, { stream: true });
    const frames = buffer.split(/\r?\n\r?\n/u);
    buffer = frames.pop() || "";
    for (const frame of frames) {
      const parsed = parseFrame(frame);
      if (parsed) events.push(parsed);
    }
  }
  assert.equal(events.at(-1)?.event, "done");
  assert.equal(mcpCalls.length, 1);
  assert.deepEqual(mcpCalls[0].body.params.arguments, { query: "safe" });
  assert.equal(mcpCalls[0].headers.authorization, undefined);
  assert.equal(providerBodies.length, 2);
  assert.equal(events.some((event) => event.event === "error"), false);
  const replay = await fetch(`${baseUrl}/api/chat/mcp/approvals/${approval.id}/approve`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie, "x-mcp-csrf": csrfToken },
    body: "{}"
  });
  assert.equal(replay.status, 409);
  assert.equal(mcpCalls.length, 1);

  const rejectedChat = await fetch(`${baseUrl}/api/chat/stream`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      content: "reject this call",
      modelId: "openai-gpt-5-6-luna",
      connection: { apiKey: "sk-chat-mcp-test" },
      allowedTools: [],
      mcpToolIds: [publicTool.id],
      streamOutput: false
    })
  });
  const rejectedReader = rejectedChat.body.getReader();
  let rejectedBuffer = "";
  let rejectedApproval;
  const rejectedEvents = [];
  while (!rejectedApproval) {
    const next = await rejectedReader.read();
    if (next.done) break;
    rejectedBuffer += decoder.decode(next.value, { stream: true });
    const frames = rejectedBuffer.split(/\r?\n\r?\n/u);
    rejectedBuffer = frames.pop() || "";
    for (const frame of frames) {
      const parsed = parseFrame(frame);
      if (!parsed) continue;
      rejectedEvents.push(parsed);
      if (parsed.event === "mcp_approval_required") rejectedApproval = parsed.data.approval;
    }
  }
  assert.ok(rejectedApproval);
  const rejected = await fetch(`${baseUrl}/api/chat/mcp/approvals/${rejectedApproval.id}/reject`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie, "x-mcp-csrf": csrfToken },
    body: "{}"
  });
  assert.equal(rejected.status, 200);
  while (true) {
    const next = await rejectedReader.read();
    if (next.done) break;
    rejectedBuffer += decoder.decode(next.value, { stream: true });
    const frames = rejectedBuffer.split(/\r?\n\r?\n/u);
    rejectedBuffer = frames.pop() || "";
    for (const frame of frames) {
      const parsed = parseFrame(frame);
      if (parsed) rejectedEvents.push(parsed);
    }
  }
  assert.equal(rejectedEvents.some((event) => event.event === "error"), true);
  assert.equal(rejectedEvents.at(-1)?.event, "done");
  assert.equal(mcpCalls.length, 1);
  assert.equal(providerBodies.length, 3);

  await fetch(`${baseUrl}/api/admin/mcp-execution`, {
    method: "PATCH",
    headers: adminHeaders,
    body: JSON.stringify({ enabled: false })
  });
  const denied = await fetch(`${baseUrl}/api/chat/stream`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      content: "must be denied",
      modelId: "openai-gpt-5-6-luna",
      connection: { apiKey: "sk-chat-mcp-test" },
      mcpToolIds: [publicTool.id]
    })
  });
  assert.equal(denied.status, 409);
  assert.equal(mcpCalls.length, 1);
  assert.equal(providerBodies.length, 3);
});
