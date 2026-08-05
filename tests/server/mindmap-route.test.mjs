import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const rootDir = path.resolve(import.meta.dirname, "../..");

async function freePort() {
  const server = (await import("node:net")).createServer();
  await new Promise((resolve, reject) => server.listen(0, "127.0.0.1", resolve).once("error", reject));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function listen(server) {
  await new Promise((resolve, reject) => server.listen(0, "127.0.0.1", resolve).once("error", reject));
  return server.address().port;
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
      UPSTREAM_BASE_URL: upstreamBaseUrl,
      ALLOW_LOCAL_UPSTREAM: "true",
      KNOWLEDGE_ENABLED: "false",
      LANGFLOW_ENABLED: "false"
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
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return { child, baseUrl };
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  child.kill();
  throw new Error(`server did not become ready:\n${output}`);
}

async function stopChild(child) {
  if (child.exitCode !== null) return;
  child.kill();
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000))
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

async function json(baseUrl, pathname, init = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...init,
    headers: init.body ? { "content-type": "application/json", ...(init.headers || {}) } : init.headers
  });
  const text = await response.text();
  return { response, body: text ? JSON.parse(text) : null };
}

test("Mind Map generation, expansion, and reorganization use one bounded structured route", { timeout: 45_000 }, async (t) => {
  const outputs = [];
  const upstreamRequests = [];
  const upstream = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : null;
    upstreamRequests.push({ url: req.url, authorization: req.headers.authorization, body });
    const output = outputs.shift() || "{}";
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ output_text: output }));
  });
  const upstreamPort = await listen(upstream);
  t.after(() => upstream.close());

  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "xi-ai-mindmap-route-"));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const app = await startApp(dataDir, `http://127.0.0.1:${upstreamPort}`);
  t.after(async () => stopChild(app.child));

  const bootstrap = await json(app.baseUrl, "/api/public/bootstrap");
  const model = bootstrap.body.modelCatalog.find((entry) => entry.enabled && entry.vendor === "openai" && entry.capabilities.includes("chat"));
  assert(model?.id);
  const connection = { apiKey: "mindmap-route-key" };

  outputs.push(JSON.stringify({
    version: 1,
    title: "发布计划",
    summary: "从目标走向上线",
    root: {
      label: "发布计划",
      children: [
        { label: "目标", children: [{ label: "成功标准", children: [] }] },
        { label: "里程碑", children: [{ label: "内测", children: [] }] },
        { label: "风险", children: [] }
      ]
    }
  }));
  let result = await json(app.baseUrl, "/api/generate/mindmap", {
    method: "POST",
    body: JSON.stringify({
      connection,
      modelId: model.id,
      prompt: "制定发布计划",
      options: { mindmap: { presetId: "project-plan", maxDepth: 4, density: "balanced", operation: "generate" } }
    })
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.mindmap.version, 1);
  assert.equal(result.body.mindmap.root.children.length, 3);
  assert.match(result.body.text, /^# 发布计划/mu);
  assert.deepEqual(result.body.raw, {
    format: "mindmap-document-v1",
    operation: "generate",
    presetId: "project-plan"
  });
  assert.equal(upstreamRequests[0].authorization, "Bearer mindmap-route-key");
  assert.match(JSON.stringify(upstreamRequests[0].body), /项目计划/u);

  const currentDocument = result.body.mindmap;
  const targetNodeId = currentDocument.root.children[0].id;
  outputs.push(JSON.stringify({
    label: "目标",
    children: [
      { label: "成功标准", children: [] },
      { label: "用户验收", note: "新增扩展内容", children: [] }
    ]
  }));
  result = await json(app.baseUrl, "/api/generate/mindmap", {
    method: "POST",
    body: JSON.stringify({
      connection,
      modelId: model.id,
      prompt: "制定发布计划",
      options: {
        mindmap: {
          presetId: "project-plan",
          maxDepth: 4,
          density: "balanced",
          operation: "expand",
          targetNodeId,
          currentDocument
        }
      }
    })
  });
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.body.mindmap.root.children[0].children.map((node) => node.label), ["成功标准", "用户验收"]);
  assert.deepEqual(result.body.mindmap.root.children[1], currentDocument.root.children[1]);

  outputs.push(JSON.stringify({
    version: 1,
    title: "发布计划",
    root: {
      label: "发布计划",
      children: [
        { label: "风险", children: [] },
        { label: "目标", children: [] },
        { label: "里程碑", children: [] }
      ]
    }
  }));
  result = await json(app.baseUrl, "/api/generate/mindmap", {
    method: "POST",
    body: JSON.stringify({
      connection,
      modelId: model.id,
      prompt: "制定发布计划",
      options: {
        mindmap: {
          presetId: "project-plan",
          maxDepth: 4,
          density: "concise",
          operation: "reorganize",
          currentDocument: result.body.mindmap
        }
      }
    })
  });
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.body.mindmap.root.children.map((node) => node.label), ["风险", "目标", "里程碑"]);

  const requestCount = upstreamRequests.length;
  result = await json(app.baseUrl, "/api/generate/mindmap", {
    method: "POST",
    body: JSON.stringify({
      connection,
      modelId: model.id,
      prompt: "无效扩展",
      options: {
        mindmap: {
          presetId: "brainstorm",
          maxDepth: 4,
          density: "balanced",
          operation: "expand",
          targetNodeId: "missing-node",
          currentDocument
        }
      }
    })
  });
  assert.equal(result.response.status, 400);
  assert.equal(upstreamRequests.length, requestCount);
});
