import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
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
  const body = Buffer.concat(chunks).toString("utf8");
  return body ? JSON.parse(body) : {};
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

test("user MCP connection stays session-bound and executes exactly once after approval", { timeout: 60_000 }, async (t) => {
  const mcpRequests = [];
  const mcpCalls = [];
  const providerBodies = [];
  const upstream = http.createServer(async (req, res) => {
    const body = await readJson(req);
    res.setHeader("content-type", "application/json");
    if (req.url === "/mcp") {
      mcpRequests.push({ body, headers: req.headers });
      if (body.method === "initialize") {
        res.setHeader("mcp-session-id", "user-route-session");
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
          result: { content: [{ type: "text", text: "user MCP result" }] }
        }));
        return;
      }
    }
    if (req.url === "/v1/responses") {
      providerBodies.push(body);
      const followUp = Boolean(body.previous_response_id || body.input?.some?.((item) => item.type === "function_call_output"));
      const toolName = body.tools?.[0]?.name;
      res.end(JSON.stringify(followUp
        ? { id: "user-response-2", output: [{ type: "message", content: [{ type: "output_text", text: "approved user answer" }] }], usage: {} }
        : { id: "user-response-1", output: [{ type: "function_call", call_id: "user-call-1", name: toolName, arguments: JSON.stringify({ query: "safe" }) }] }));
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: "not found" }));
  });
  await new Promise((resolve, reject) => upstream.listen(0, "127.0.0.1", resolve).once("error", reject));
  t.after(() => upstream.close());

  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "xi-ai-user-mcp-"));
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
      ADMIN_PASSWORD: "user-mcp-test-password",
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
    body: JSON.stringify({ username: "xizi2333", password: "user-mcp-test-password" })
  });
  const adminCookie = String(login.headers.get("set-cookie") || "").split(";", 1)[0];
  const invalidPolicy = await fetch(`${baseUrl}/api/admin/mcp-execution`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: adminCookie },
    body: JSON.stringify({ userConnectionsEnabled: true })
  });
  assert.equal(invalidPolicy.status, 409);
  await fetch(`${baseUrl}/api/admin/mcp-execution`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: adminCookie },
    body: JSON.stringify({ enabled: true, userConnectionsEnabled: true })
  });

  const publicBootstrap = await (await fetch(`${baseUrl}/api/public/bootstrap`)).json();
  assert.equal(publicBootstrap.mcpExecution.userConnectionsEnabled, true);
  assert.equal(publicBootstrap.mcpExecution.tools.length, 0);

  const sessionResponse = await fetch(`${baseUrl}/api/chat/mcp/session`);
  const cookie = String(sessionResponse.headers.get("set-cookie") || "").split(";", 1)[0];
  const proof = await sessionResponse.json();
  assert.deepEqual(proof.connections, []);

  const wrongCsrf = await fetch(`${baseUrl}/api/chat/mcp/connections`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie,
      "x-mcp-csrf": "wrong-csrf-token-that-is-long-enough-000000"
    },
    body: JSON.stringify({ endpoint: `http://127.0.0.1:${upstream.address().port}/mcp` })
  });
  assert.equal(wrongCsrf.status, 403);
  assert.equal(mcpRequests.length, 0);

  const connectedResponse = await fetch(`${baseUrl}/api/chat/mcp/connections`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie, "x-mcp-csrf": proof.csrfToken },
    body: JSON.stringify({ endpoint: `http://127.0.0.1:${upstream.address().port}/mcp` })
  });
  assert.equal(connectedResponse.status, 201);
  const connection = await connectedResponse.json();
  assert.equal("endpoint" in connection, false);
  assert.equal("label" in connection, false);
  assert.equal(connection.tools[0].source, "user");
  assert.equal(mcpRequests.every((request) => !request.headers.authorization && !request.headers.cookie), true);

  const forged = await fetch(`${baseUrl}/api/chat/stream`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      content: "forged",
      modelId: "openai-gpt-5-6-luna",
      connection: { apiKey: "sk-user-mcp-test" },
      mcpToolIds: ["umcp_tool_forged-selector"]
    })
  });
  assert.equal(forged.status, 400);
  assert.equal(providerBodies.length, 0);
  assert.equal(mcpCalls.length, 0);

  const chat = await fetch(`${baseUrl}/api/chat/stream`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      content: "read from user service",
      modelId: "openai-gpt-5-6-luna",
      connection: { apiKey: "sk-user-mcp-test" },
      mcpToolIds: [connection.tools[0].id],
      streamOutput: false
    })
  });
  assert.equal(chat.status, 200);
  const reader = chat.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let approval;
  const events = [];
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
  assert.ok(approval);
  assert.equal(mcpCalls.length, 0);
  const approved = await fetch(`${baseUrl}/api/chat/mcp/approvals/${approval.id}/approve`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie, "x-mcp-csrf": proof.csrfToken },
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
  assert.equal(mcpCalls[0].headers.authorization, undefined);
  assert.equal(mcpCalls[0].headers.cookie, undefined);
  assert.equal(providerBodies.length, 2);

  const disconnected = await fetch(`${baseUrl}/api/chat/mcp/connections/${connection.id}`, {
    method: "DELETE",
    headers: { "content-type": "application/json", cookie, "x-mcp-csrf": proof.csrfToken },
    body: "{}"
  });
  assert.equal(disconnected.status, 204);
  const stale = await fetch(`${baseUrl}/api/chat/stream`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      content: "stale connection",
      modelId: "openai-gpt-5-6-luna",
      connection: { apiKey: "sk-user-mcp-test" },
      mcpToolIds: [connection.tools[0].id]
    })
  });
  assert.equal(stale.status, 400);
  assert.equal(mcpCalls.length, 1);
  assert.equal(providerBodies.length, 2);

  await fetch(`${baseUrl}/api/admin/mcp-execution`, {
    method: "PATCH",
    headers: { "content-type": "application/json", cookie: adminCookie },
    body: JSON.stringify({ userConnectionsEnabled: false })
  });
  const disabled = await fetch(`${baseUrl}/api/chat/mcp/connections`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie, "x-mcp-csrf": proof.csrfToken },
    body: JSON.stringify({ endpoint: `http://127.0.0.1:${upstream.address().port}/mcp` })
  });
  assert.equal(disabled.status, 409);
  assert.equal(mcpCalls.length, 1);
});
