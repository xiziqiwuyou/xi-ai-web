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

async function requestJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

function parseSse(text) {
  return text
    .split(/\r?\n\r?\n/u)
    .map((frame) => {
      const event = frame.split(/\r?\n/u).find((line) => line.startsWith("event:"))?.slice(6).trim();
      const data = frame.split(/\r?\n/u)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("\n");
      return event && data ? { event, data: JSON.parse(data) } : null;
    })
    .filter(Boolean);
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

test("Claude Chat honors model output limits and explicit stream delivery", { timeout: 30_000 }, async (t) => {
  const upstreamBodies = [];
  const upstream = http.createServer(async (req, res) => {
    const body = await requestJson(req);
    upstreamBodies.push(body);
    if (body.stream === true) {
      res.writeHead(200, { "content-type": "text/event-stream; charset=utf-8" });
      res.write('event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":3}}}\n\n');
      res.write('event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"native "}}\n\n');
      await new Promise((resolve) => setTimeout(resolve, 30));
      res.write('event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"stream"}}\n\n');
      res.end('event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":2}}\n\nevent: message_stop\ndata: {"type":"message_stop"}\n\n');
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      content: [{ type: "text", text: "buffered reply" }],
      usage: { input_tokens: 4, output_tokens: 2 }
    }));
  });
  const upstreamPort = await listen(upstream);
  t.after(() => upstream.close());

  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "xi-ai-claude-stream-"));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const app = await startApp(dataDir, `http://127.0.0.1:${upstreamPort}`);
  t.after(async () => stopApp(app.child));

  const basePayload = {
    content: "test Claude delivery",
    displayContent: "test Claude delivery",
    modelId: "claude-sonnet-5",
    connection: { apiKey: "claude-route-key" },
    allowedTools: []
  };
  const nativeResponse = await fetch(`${app.baseUrl}/api/chat/stream`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...basePayload, streamOutput: true })
  });
  assert.equal(nativeResponse.status, 200);
  const nativeEvents = parseSse(await nativeResponse.text());
  assert.equal(upstreamBodies[0].stream, true);
  assert.equal(upstreamBodies[0].max_tokens, 128_000);
  assert.equal(nativeEvents.find((event) => event.event === "meta")?.data.deliveryMode, "native-stream");
  assert.equal(nativeEvents.filter((event) => event.event === "token").map((event) => event.data.token).join(""), "native stream");
  assert.equal(nativeEvents.at(-1)?.event, "done");

  const oversizedResponse = await fetch(`${app.baseUrl}/api/chat/stream`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...basePayload, maxTokens: 128_001 })
  });
  assert.equal(oversizedResponse.status, 400);
  assert.match((await oversizedResponse.json()).error, /128000/u);
  assert.equal(upstreamBodies.length, 1);

  const bufferedResponse = await fetch(`${app.baseUrl}/api/chat/stream`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...basePayload, streamOutput: false, maxTokens: 2_048, includeUsage: true })
  });
  assert.equal(bufferedResponse.status, 200);
  const bufferedEvents = parseSse(await bufferedResponse.text());
  assert.equal(upstreamBodies[1].stream, undefined);
  assert.equal(upstreamBodies[1].max_tokens, 2_048);
  assert.equal(bufferedEvents.find((event) => event.event === "meta")?.data.deliveryMode, "buffered");
  assert.deepEqual(bufferedEvents.filter((event) => event.event === "token").map((event) => event.data.token), ["buffered reply"]);
  assert.equal(bufferedEvents.find((event) => event.event === "done")?.data.message.usage.totalTokens, 6);
});

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
