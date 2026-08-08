import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const rootDir = path.resolve(import.meta.dirname, "../..");
const adminUsername = "xizi2333";
const adminPassword = "mcp-admin-test-password";

async function freePort() {
  const server = http.createServer();
  await new Promise((resolve, reject) => server.listen(0, "127.0.0.1", resolve).once("error", reject));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function startMcpServer() {
  const calls = [];
  const server = http.createServer(async (req, res) => {
    calls.push(req.url);
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : {};
    res.setHeader("content-type", "application/json");
    if (body.method === "initialize") {
      res.setHeader("mcp-session-id", "session-test-only");
      res.end(JSON.stringify({
        jsonrpc: "2.0",
        id: body.id,
        result: {
          protocolVersion: "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: "fixture" }
        }
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
            description: "A bounded fixture tool",
            inputSchema: { type: "object" }
          }]
        }
      }));
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: "unknown" }));
  });
  await new Promise((resolve, reject) => server.listen(0, "127.0.0.1", resolve).once("error", reject));
  return { server, calls, endpoint: `http://127.0.0.1:${server.address().port}/mcp` };
}

async function startApp(dataDir, upstreamBaseUrl) {
  const port = await freePort();
  const child = spawn(process.execPath, ["server/index.mjs"], {
    cwd: rootDir,
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: dataDir,
      NODE_ENV: "development",
      ADMIN_USERNAME: adminUsername,
      ADMIN_PASSWORD: adminPassword,
      UPSTREAM_BASE_URL: upstreamBaseUrl,
      ALLOW_LOCAL_UPSTREAM: "true",
      MCP_ALLOW_LOCAL_ENDPOINTS: "true",
      MCP_ALLOW_INSECURE_HTTP: "true"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server exited early:\n${output}`);
    try {
      const health = await fetch(`${baseUrl}/api/health`);
      if (health.ok) {
        const login = await fetch(`${baseUrl}/api/admin/login`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ username: adminUsername, password: adminPassword })
        });
        if (!login.ok) throw new Error(`admin login failed with ${login.status}`);
        return {
          child,
          baseUrl,
          cookie: String(login.headers.get("set-cookie") || "").split(";", 1)[0]
        };
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  child.kill();
  throw new Error(`server did not become ready:\n${output}`);
}

async function stopApp(child) {
  if (child.exitCode !== null) return;
  child.kill();
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000))
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

async function api(runtime, pathname, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("content-type", headers.get("content-type") || "application/json");
  if (pathname.startsWith("/api/admin/")) headers.set("cookie", runtime.cookie);
  const response = await fetch(`${runtime.baseUrl}${pathname}`, { ...init, headers });
  const raw = await response.text();
  return { response, body: raw ? JSON.parse(raw) : null };
}

test("MCP Admin profiles stay private, discover only by ID, and round-trip metadata", { timeout: 60_000 }, async (t) => {
  const mcp = await startMcpServer();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "xi-ai-mcp-admin-"));
  t.after(async () => {
    await new Promise((resolve) => mcp.server.close(resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  const runtime = await startApp(dataDir, "http://127.0.0.1:9");
  t.after(() => stopApp(runtime.child));

  let result = await api(runtime, "/api/admin/mcp-servers", {
    method: "POST",
    body: JSON.stringify({ label: "Fixture MCP", endpoint: mcp.endpoint, enabled: true })
  });
  assert.equal(result.response.status, 201);
  const profile = result.body;
  assert.equal(profile.label, "Fixture MCP");
  assert.equal(profile.endpoint, mcp.endpoint);

  const beforeDiscovery = mcp.calls.length;
  result = await api(runtime, `/api/admin/mcp-servers/${encodeURIComponent(profile.id)}/discover`, {
    method: "POST",
    body: JSON.stringify({ endpoint: "https://attacker.example.test/ignored" })
  });
  assert.equal(result.response.status, 400);
  assert.equal(mcp.calls.length, beforeDiscovery);
  result = await api(runtime, `/api/admin/mcp-servers/${encodeURIComponent(profile.id)}/discover`, {
    method: "POST",
    body: JSON.stringify({})
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.discovery.tools[0].name, "fixture.read");
  assert.equal(mcp.calls.length - beforeDiscovery, 3);

  result = await api(runtime, "/api/public/bootstrap");
  assert.equal(result.response.status, 200);
  assert.equal(Object.hasOwn(result.body, "mcpServers"), false);
  assert.equal(JSON.stringify(result.body).includes(mcp.endpoint), false);

  result = await api(runtime, "/api/admin/metadata-export");
  assert.equal(result.response.status, 200);
  assert.equal(result.body.mcpServers.length, 1);

  const unsafeImport = structuredClone(result.body);
  unsafeImport.mcpServers[0].apiKey = "secret";
  result = await api(runtime, "/api/admin/metadata-import", {
    method: "PATCH",
    body: JSON.stringify(unsafeImport)
  });
  assert.equal(result.response.status, 400);
  assert.equal(JSON.stringify(result.body).includes("secret"), false);

  result = await api(runtime, `/api/admin/mcp-servers/${encodeURIComponent(profile.id)}`, {
    method: "PATCH",
    body: JSON.stringify({ enabled: false })
  });
  assert.equal(result.response.status, 200);
  result = await api(runtime, `/api/admin/mcp-servers/${encodeURIComponent(profile.id)}/discover`, {
    method: "POST",
    body: JSON.stringify({})
  });
  assert.equal(result.response.status, 409);
  assert.equal(result.body.error.code, "MCP_PROFILE_DISABLED");

  result = await api(runtime, `/api/admin/mcp-servers/${encodeURIComponent(profile.id)}/tools/call`, {
    method: "POST",
    body: JSON.stringify({ name: "fixture.read", arguments: {} })
  });
  assert.equal(result.response.status, 501);
  assert.equal(result.body.error.code, "MCP_EXECUTION_NOT_AVAILABLE");
  assert.equal(mcp.calls.some((url) => url.includes("call")), false);

  result = await api(runtime, `/api/admin/mcp-servers/${encodeURIComponent(profile.id)}`, { method: "DELETE" });
  assert.equal(result.response.status, 204);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dataDir, "app-data.json"), "utf8")).mcpServers, []);
});
