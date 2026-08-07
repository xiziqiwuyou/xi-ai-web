import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

function listen(server) {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
}

async function startApp(dataDir, upstreamBaseUrl, extraEnv = {}) {
  const port = await freePort();
  const child = spawn(process.execPath, ["server/index.mjs"], {
    cwd: rootDir,
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: dataDir,
      NODE_ENV: "test",
      ADMIN_PASSWORD: "chat-capability-test",
      UPSTREAM_BASE_URL: upstreamBaseUrl,
      ALLOW_LOCAL_UPSTREAM: "true",
      KNOWLEDGE_ENABLED: "false",
      LANGFLOW_ENABLED: "false",
      ...extraEnv
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Server exited during startup: ${output}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return { child, baseUrl };
    } catch {
      // Retry until the process starts listening.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  child.kill("SIGTERM");
  throw new Error(`Server did not start: ${output}`);
}

async function stopApp(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 2_000))
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

test("Chat rejects image attachments for a non-vision model before upstream access", { timeout: 30_000 }, async (t) => {
  let upstreamRequests = 0;
  const upstream = http.createServer((_req, res) => {
    upstreamRequests += 1;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ output_text: "must not be reached" }));
  });
  const upstreamPort = await listen(upstream);
  t.after(() => upstream.close());

  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "xi-ai-chat-capability-"));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const app = await startApp(dataDir, `http://127.0.0.1:${upstreamPort}`);
  t.after(async () => stopApp(app.child));

  const response = await fetch(`${app.baseUrl}/api/chat/stream`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      content: "请分析这张图片",
      displayContent: "请分析这张图片",
      modelId: "openai-gpt-5-4-mini",
      connection: { apiKey: "chat-capability-key" },
      attachments: [{
        kind: "image",
        name: "blocked.png",
        mimeType: "image/png",
        size: 68,
        dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII="
      }],
      allowedTools: []
    })
  });
  const body = await response.json();
  assert.equal(response.status, 400);
  assert.match(body.error, /视觉能力|图片/u);
  assert.equal(upstreamRequests, 0);
});

test("independent search authentication failure is classified and blocks the Chat provider", { timeout: 30_000 }, async (t) => {
  const upstreamRequests = [];
  const upstream = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    upstreamRequests.push({
      url: req.url,
      authorization: req.headers.authorization,
      body: chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : null
    });
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "invalid search credential" }));
  });
  const upstreamPort = await listen(upstream);
  t.after(() => upstream.close());

  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "xi-ai-search-classification-"));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const app = await startApp(dataDir, `http://127.0.0.1:${upstreamPort}`);
  t.after(async () => stopApp(app.child));

  const forgedSearchKey = "search-route-forged-secret";
  const response = await fetch(`${app.baseUrl}/api/chat/stream`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      content: "只搜索当前这句话",
      displayContent: "只搜索当前这句话",
      modelId: "openai-gpt-5-4-mini",
      connection: { apiKey: "chat-provider-key" },
      allowedTools: ["web_search"],
      searchService: { provider: "glm", apiKey: forgedSearchKey, count: 8, contentSize: "medium" }
    })
  });
  const body = await response.json();
  assert.equal(response.status, 401);
  assert.deepEqual(body, {
    error: {
      code: "SEARCH_AUTH_FAILED",
      message: "智谱 GLM 联网搜索鉴权失败，请检查当前 API Key 是否支持该搜索服务"
    }
  });
  assert.equal(JSON.stringify(body).includes(forgedSearchKey), false);
  assert.equal(upstreamRequests.length, 1);
  assert.equal(upstreamRequests[0].url, "/paas/v4/web_search");
  assert.equal(upstreamRequests[0].authorization, "Bearer chat-provider-key");
  assert.equal(upstreamRequests[0].body.search_query, "只搜索当前这句话");
});

test("independent search timeout returns 504 before the Chat provider starts", { timeout: 30_000 }, async (t) => {
  let upstreamRequests = 0;
  const upstream = http.createServer((req) => {
    upstreamRequests += 1;
    req.resume();
  });
  const upstreamPort = await listen(upstream);
  t.after(() => upstream.close());

  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "xi-ai-search-timeout-"));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const app = await startApp(dataDir, `http://127.0.0.1:${upstreamPort}`, {
    UPSTREAM_TIMEOUT_MS: "50"
  });
  t.after(async () => stopApp(app.child));

  const response = await fetch(`${app.baseUrl}/api/chat/stream`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      content: "等待搜索超时",
      displayContent: "等待搜索超时",
      modelId: "openai-gpt-5-4-mini",
      connection: { apiKey: "chat-provider-key" },
      allowedTools: ["web_search"],
      searchService: { provider: "glm", apiKey: "same-request-key" }
    })
  });
  const body = await response.json();
  assert.equal(response.status, 504);
  assert.match(body.error, /超时/u);
  assert.equal(upstreamRequests, 1);
});
