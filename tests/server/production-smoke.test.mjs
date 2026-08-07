import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { handleSseDiagnostic } from "../../server/sse-diagnostic.mjs";
import {
  normalizeSmokeBaseUrl,
  publicSmokeFailure,
  runDeploymentSmoke,
  runLiveProviderSmoke
} from "../../scripts/production-smoke.mjs";

const onePixelPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nWQAAAAASUVORK5CYII=";
const dataUrl = `data:image/png;base64,${onePixelPng}`;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

function writeJson(res, status, value) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(value));
}

async function startFixture() {
  const state = {
    version: "0.0.8",
    diagnosticMode: "stream",
    failChat: false,
    requests: []
  };
  const bootstrap = {
    settings: { siteName: "xi-ai-web", oneapiSettingsHandoffEnabled: false },
    menuItems: [
      { id: "chat", label: "AI 对话", enabled: true, visible: true, order: 10 },
      { id: "image", label: "图像生成", enabled: true, visible: true, order: 20 }
    ],
    modelCatalog: [
      {
        id: "smoke-chat",
        vendor: "openai",
        endpointProtocol: "openai-responses",
        label: "Smoke Chat",
        model: "smoke-chat",
        capabilities: ["chat"],
        enabled: true
      },
      {
        id: "smoke-image",
        vendor: "openai",
        endpointProtocol: "openai-chat",
        label: "Smoke Image",
        model: "smoke-image",
        capabilities: ["image", "imageEdit"],
        enabled: true
      }
    ],
    assistants: [],
    appPresets: [],
    promptPresets: [],
    langflow: { state: "disabled" },
    langflowWorkflows: [],
    conversations: [],
    toolSettings: []
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://fixture.local");
    const pathname = url.pathname;
    try {
      if (req.method === "GET" && ["/", "/xizi2333"].includes(pathname)) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end('<main id="root"></main>');
        return;
      }
      if (req.method === "GET" && pathname === "/api/health") {
        writeJson(res, 200, { ok: true, version: state.version, adminConfigured: true });
        return;
      }
      if (req.method === "GET" && pathname === "/api/ready") {
        writeJson(res, 200, { ready: true });
        return;
      }
      if (req.method === "GET" && pathname === "/api/public/bootstrap") {
        writeJson(res, 200, bootstrap);
        return;
      }
      if (req.method === "GET" && pathname === "/api/conversations") {
        writeJson(res, 410, { error: "retired" });
        return;
      }
      if (req.method === "GET" && pathname === "/api/diagnostics/sse") {
        if (state.diagnosticMode === "html") {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end("<html><body>proxy landing page</body></html>");
        } else if (state.diagnosticMode === "buffered") {
          res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8" });
          res.end('event: probe\ndata: {"sequence":1}\n\nevent: done\ndata: {"sequence":2}\n\n');
        } else {
          handleSseDiagnostic(req, res, { delayMs: 220 });
        }
        return;
      }
      if (req.method === "POST" && pathname === "/api/chat/title") {
        const body = await requestJson(req);
        state.requests.push({ pathname, body });
        if (state.failChat) {
          writeJson(res, 502, { error: `provider rejected ${body.connection?.apiKey}` });
        } else {
          writeJson(res, 200, { title: "Production smoke" });
        }
        return;
      }
      if (req.method === "POST" && pathname === "/api/chat/stream") {
        const body = await requestJson(req);
        state.requests.push({ pathname, body });
        if (state.failChat) {
          writeJson(res, 502, { error: `provider rejected ${body.connection?.apiKey}` });
          return;
        }
        res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8" });
        res.write('event: meta\ndata: {"assistantMessageId":"smoke"}\n\n');
        await delay(15);
        res.write('event: token\ndata: {"token":"smoke-ok"}\n\n');
        await delay(15);
        res.end('event: done\ndata: {"message":{"status":"done"}}\n\n');
        return;
      }
      if (req.method === "POST" && pathname === "/api/generate/image") {
        const body = await requestJson(req);
        state.requests.push({ pathname, body });
        writeJson(res, 200, {
          status: "completed",
          assets: [{ type: "image", url: dataUrl }]
        });
        return;
      }
      writeJson(res, 404, { error: "not found" });
    } catch {
      writeJson(res, 500, { error: "fixture error" });
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  return {
    state,
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

test("smoke origin validation permits local HTTP but rejects unsafe remote forms", () => {
  assert.equal(normalizeSmokeBaseUrl("http://127.0.0.1:8787/"), "http://127.0.0.1:8787");
  assert.equal(
    normalizeSmokeBaseUrl("http://public.example.test", { allowInsecureHttp: true }),
    "http://public.example.test"
  );
  for (const value of [
    "http://public.example.test",
    "ftp://public.example.test",
    "https://user:pass@example.test",
    "https://example.test/?token=secret",
    "https://example.test/#secret"
  ]) {
    assert.throws(() => normalizeSmokeBaseUrl(value));
  }
});

test("deployment smoke verifies release identity, privacy, readiness and incremental SSE", async () => {
  const fixture = await startFixture();
  try {
    const report = await runDeploymentSmoke({
      baseUrl: fixture.baseUrl,
      expectedVersion: "0.0.8",
      minSseGapMs: 100
    });
    assert.equal(report.ok, true);
    assert.equal(report.version, "0.0.8");
    assert(report.sse.separationMs >= 100);

    await assert.rejects(
      runDeploymentSmoke({ baseUrl: fixture.baseUrl, expectedVersion: "0.0.9", minSseGapMs: 100 }),
      (error) => error?.code === "APPLICATION_VERSION_MISMATCH"
    );

    fixture.state.diagnosticMode = "buffered";
    await assert.rejects(
      runDeploymentSmoke({ baseUrl: fixture.baseUrl, expectedVersion: "0.0.8", minSseGapMs: 100 }),
      (error) => error?.code === "SSE_PROXY_BUFFERING_DETECTED"
    );

    fixture.state.diagnosticMode = "html";
    await assert.rejects(
      runDeploymentSmoke({ baseUrl: fixture.baseUrl, expectedVersion: "0.0.8", minSseGapMs: 100 }),
      (error) => error?.code === "SSE_DIAGNOSTIC_CONTENT_TYPE_INVALID"
    );
  } finally {
    await fixture.close();
  }
});

test("live provider smoke validates Chat and image bytes without exposing the Key", async () => {
  const fixture = await startFixture();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "xi-ai-live-smoke-"));
  const editImage = path.join(directory, "input.png");
  fs.writeFileSync(editImage, Buffer.from(onePixelPng, "base64"));
  const apiKey = "sk-live-smoke-secret-2468";
  try {
    const report = await runLiveProviderSmoke({
      baseUrl: fixture.baseUrl,
      apiKey,
      chatModelId: "smoke-chat",
      imageModelId: "smoke-image",
      editImagePath: editImage,
      timeoutMs: 10_000
    });
    assert.equal(report.ok, true);
    assert.deepEqual(report.cases.map((item) => [item.case, item.status]), [
      ["chat-nonstream", "passed"],
      ["chat-stream", "passed"],
      ["image-generate", "passed"],
      ["image-edit", "passed"]
    ]);
    assert(!JSON.stringify(report).includes(apiKey));
    assert.equal(fixture.state.requests.length, 4);
    assert(fixture.state.requests.every((item) => item.body.connection?.apiKey === apiKey));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
    await fixture.close();
  }
});

test("live smoke reports explicit skips and redacts hostile provider errors", async () => {
  const fixture = await startFixture();
  const apiKey = "sk-live-smoke-hostile-secret-1357";
  try {
    const skipped = await runLiveProviderSmoke({ baseUrl: fixture.baseUrl, apiKey, timeoutMs: 10_000 });
    assert.equal(skipped.ok, true);
    assert(skipped.cases.every((item) => item.status === "skipped"));

    fixture.state.failChat = true;
    const failed = await runLiveProviderSmoke({
      baseUrl: fixture.baseUrl,
      apiKey,
      chatModelId: "smoke-chat",
      timeoutMs: 10_000
    });
    assert.equal(failed.ok, false);
    assert.equal(failed.cases[0].errorCode, "CHAT_NONSTREAM_REQUEST_FAILED");
    assert.equal(failed.cases[1].errorCode, "CHAT_STREAM_REQUEST_FAILED");
    assert(!JSON.stringify(failed).includes(apiKey));
    assert(!JSON.stringify(publicSmokeFailure(new Error(apiKey))).includes(apiKey));
  } finally {
    await fixture.close();
  }
});
