import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function collectBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

async function waitForHealth(baseUrl, process) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (process.exitCode !== null) throw new Error(`automation app exited with ${process.exitCode}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // The child is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error("automation app did not become healthy");
}

const providerRequests = [];
const searchRequests = [];
const provider = http.createServer(async (request, response) => {
  const body = JSON.parse(await collectBody(request));
  if (request.url?.endsWith("/search/paas/v4/web_search")) {
    searchRequests.push({ url: request.url, body, authorization: request.headers.authorization });
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({
      search_result: [{
        title: "Independent search source",
        content: "Verified external context for the requested topic.",
        link: "https://source.example.test/verified"
      }]
    }));
    return;
  }
  providerRequests.push({ url: request.url, body });
  if (JSON.stringify(body.input || []).includes("Attempt forbidden tool.")) {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({
      id: "automation-forbidden-tool-response",
      output: [{
        type: "function_call",
        call_id: "call-forbidden-tool",
        name: "calculator_eval",
        arguments: JSON.stringify({ expression: "1+1" })
      }]
    }));
    return;
  }
  if (request.url?.endsWith("/chat/completions")) {
    if (body.stream) {
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.end([
        `data: ${JSON.stringify({ choices: [{ delta: { content: "Inline automation completed." } }] })}`,
        "",
        "data: [DONE]",
        ""
      ].join("\n"));
      return;
    }
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ choices: [{ message: { content: "Inline automation completed." } }] }));
    return;
  }
  response.writeHead(200, { "Content-Type": "application/json" });
  response.end(JSON.stringify({
    id: "automation-contract-response",
    output_text: "Inline automation completed."
  }));
});

await new Promise((resolve, reject) => {
  provider.once("error", reject);
  provider.listen(0, "127.0.0.1", resolve);
});

const providerAddress = provider.address();
const providerPort = typeof providerAddress === "object" && providerAddress ? providerAddress.port : 0;
const appPort = await reservePort();
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "xi-ai-automation-contract-"));
const legacyCreatedAt = "2026-01-01T00:00:00.000Z";
fs.writeFileSync(path.join(dataDir, "app-data.json"), JSON.stringify({
  version: 6,
  assistants: [{
    id: "legacy-general-assistant",
    name: "通用助手",
    description: "Legacy assistant metadata",
    color: "#ff2442",
    systemPrompt: "Legacy system prompt",
    createdAt: legacyCreatedAt,
    updatedAt: legacyCreatedAt
  }]
}));
const app = spawn(process.execPath, ["server/index.mjs", "--production"], {
  cwd: rootDir,
  env: {
    ...process.env,
    PORT: String(appPort),
    DATA_DIR: dataDir,
    ADMIN_PASSWORD: "automation-contract-admin",
    NODE_ENV: "test"
  },
  stdio: ["ignore", "pipe", "pipe"]
});

let appOutput = "";
app.stdout.on("data", (chunk) => { appOutput += chunk.toString(); });
app.stderr.on("data", (chunk) => { appOutput += chunk.toString(); });

const appBaseUrl = `http://127.0.0.1:${appPort}`;
const connection = {
  baseUrl: `http://127.0.0.1:${providerPort}/v1`,
  apiKey: "automation-contract-key"
};
const searchService = {
  provider: "glm",
  baseUrl: `http://127.0.0.1:${providerPort}/search`,
  apiKey: "automation-search-contract-key",
  searchEngine: "search_std",
  count: 4,
  contentSize: "medium"
};

async function runAgent(moduleId) {
  const response = await fetch(`${appBaseUrl}/api/agents/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      moduleId,
      connection,
      modelId: "openai-gpt-4-1-mini",
      agent: {
        id: "browser-agent-contract",
        name: "Browser Agent",
        systemPrompt: "Return a concise verified result.",
        skillInstructions: ["Risk review: list assumptions and rollback conditions."]
      },
      prompt: "Prepare a release decision.",
      options: { temperature: 99, topP: -5, maxTokens: 999_999 }
    })
  });
  const payload = await response.json();
  assert.equal(response.status, 200, JSON.stringify(payload));
  return payload;
}

try {
  await waitForHealth(appBaseUrl, app);
  const bootstrapResponse = await fetch(`${appBaseUrl}/api/public/bootstrap`);
  const bootstrap = await bootstrapResponse.json();
  assert.equal(bootstrapResponse.status, 200);
  assert.equal(bootstrap.assistants.length, 12, "version-6 metadata must receive the curated assistant catalog once");
  assert.deepEqual(
    [...new Set(bootstrap.assistants.map((assistant) => assistant.category))].sort(),
    ["内容创作", "商业办公", "学习研究", "生活创意", "编程开发", "通用效率"].sort()
  );
  const migratedLegacyAssistant = bootstrap.assistants.find((assistant) => assistant.id === "legacy-general-assistant");
  assert.deepEqual(migratedLegacyAssistant.tags, ["问答", "规划", "执行"]);
  assert.equal(migratedLegacyAssistant.enabled, true);
  assert.equal(migratedLegacyAssistant.updatedAt, legacyCreatedAt, "normalization must preserve update timestamps");
  assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir, "app-data.json"), "utf8")).version, 8);
  const migratedOpenAi = bootstrap.modelCatalog.find((model) => model.id === "openai-gpt-4-1-mini");
  const migratedKimi = bootstrap.modelCatalog.find((model) => model.id === "kimi-k3");
  const migratedQwenFlash = bootstrap.modelCatalog.find((model) => model.id === "qwen3-6-flash");
  assert(migratedOpenAi);
  assert(migratedKimi);
  assert(migratedQwenFlash);
  assert(migratedOpenAi.capabilities.includes("webSearch"));
  assert(migratedOpenAi.capabilities.includes("codeExecution"));
  assert(!migratedKimi.capabilities.includes("webSearch"));
  assert(migratedQwenFlash.capabilities.includes("webSearch"));
  assert(migratedQwenFlash.capabilities.includes("codeExecution"));
  const independentSearchSetting = bootstrap.toolSettings.find((tool) => tool.name === "web_search");
  assert(independentSearchSetting);
  assert.equal(independentSearchSetting.execution, "search");
  assert.equal(independentSearchSetting.requiredCapability, undefined);
  assert.deepEqual(independentSearchSetting.supportedVendors, [
    "openai",
    "anthropic",
    "gemini",
    "kimi",
    "deepseek",
    "qwen",
    "openai-compatible"
  ]);

  const agentResult = await runAgent("agents");
  const workflowResult = await runAgent("workflows");

  assert.equal(agentResult.text, "Inline automation completed.");
  assert.equal(agentResult.raw.agent.source, "browser");
  assert.equal(workflowResult.raw.sourceModule, "workflows");
  assert.equal(providerRequests.length, 2);
  assert(providerRequests.every((request) => request.url === "/v1/responses"));
  assert(providerRequests[0].body.instructions.includes("Return a concise verified result."));
  assert(providerRequests[0].body.instructions.includes("Risk review"));
  assert(providerRequests[0].body.instructions.startsWith("你正在作为智能体执行任务。"));
  assert.equal(providerRequests[0].body.input[0].content, "Prepare a release decision.");
  assert.equal(providerRequests[0].body.tools, undefined, "omitted allowedTools must fail closed");
  assert.equal(providerRequests[0].body.temperature, 2);
  assert.equal(providerRequests[0].body.top_p, 0);
  assert.equal(providerRequests[0].body.max_output_tokens, 32768);

  const invalid = await fetch(`${appBaseUrl}/api/agents/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      moduleId: "agents",
      connection,
      modelId: "openai-gpt-4-1-mini",
      agent: { name: "Invalid", systemPrompt: "", skillInstructions: [] },
      prompt: "test",
      allowedTools: []
    })
  });
  assert.equal(invalid.status, 400);
  assert.equal(providerRequests.length, 2, "invalid inline agents must be rejected before provider calls");

  const unavailableAssistant = await fetch(`${appBaseUrl}/api/agents/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      moduleId: "agents",
      connection,
      modelId: "openai-gpt-4-1-mini",
      assistantId: "missing-assistant",
      prompt: "test",
      allowedTools: []
    })
  });
  assert.equal(unavailableAssistant.status, 410);
  assert.equal(providerRequests.length, 2, "missing public assistants must not fall back or call the provider");

  const malformedTools = await fetch(`${appBaseUrl}/api/agents/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      moduleId: "agents",
      connection,
      modelId: "openai-gpt-4-1-mini",
      agent: { name: "Malformed tools", systemPrompt: "Return a result." },
      prompt: "test",
      allowedTools: "datetime_now"
    })
  });
  assert.equal(malformedTools.status, 400);
  assert.equal(providerRequests.length, 2, "malformed tool permissions must be rejected before provider calls");

  const forbiddenTool = await fetch(`${appBaseUrl}/api/agents/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      moduleId: "agents",
      connection,
      modelId: "openai-gpt-4-1-mini",
      agent: { name: "Whitelist guard", systemPrompt: "Use only the tools supplied in this request." },
      prompt: "Attempt forbidden tool.",
      allowedTools: ["datetime_now"]
    })
  });
  const forbiddenPayload = await forbiddenTool.json();
  assert.equal(forbiddenTool.status, 502);
  assert.match(forbiddenPayload.error, /not allowed for this request/i);
  assert.equal(providerRequests.length, 3, "a rejected tool call must not start another provider round");
  assert.deepEqual(providerRequests[2].body.tools.map((tool) => tool.name), ["datetime_now"]);

  const missingSearchConfig = await fetch(`${appBaseUrl}/api/agents/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      moduleId: "agents",
      connection,
      modelId: "compatible-chat",
      agent: { name: "Search config guard", systemPrompt: "Return a result." },
      prompt: "Search the web.",
      allowedTools: ["web_search"]
    })
  });
  assert.equal(missingSearchConfig.status, 400);
  assert.match((await missingSearchConfig.json()).error, /独立联网搜索服务/);
  assert.equal(searchRequests.length, 0, "missing search credentials must fail before search access");
  assert.equal(providerRequests.length, 3, "missing search credentials must fail before main provider access");

  const missingKnowledgeContext = await fetch(`${appBaseUrl}/api/agents/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      moduleId: "agents",
      connection,
      modelId: "openai-gpt-4-1-mini",
      agent: { name: "Knowledge guard", systemPrompt: "Return a result." },
      prompt: "Search local knowledge.",
      allowedTools: ["knowledge_search"]
    })
  });
  assert.equal(missingKnowledgeContext.status, 400);
  assert.match((await missingKnowledgeContext.json()).error, /本地知识|上下文/);
  assert.equal(providerRequests.length, 3, "context-dependent tools must fail before provider calls");

  const independentAgentResponse = await fetch(`${appBaseUrl}/api/agents/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      moduleId: "agents",
      connection,
      modelId: "compatible-chat",
      agent: { name: "Independent search", systemPrompt: "Use the supplied external context." },
      prompt: "Use independent web search.",
      allowedTools: ["web_search", "web_search"],
      searchService
    })
  });
  const independentAgent = await independentAgentResponse.json();
  assert.equal(independentAgentResponse.status, 200, JSON.stringify(independentAgent));
  assert.deepEqual(independentAgent.raw.tools, ["web_search"]);
  assert.equal(independentAgent.raw.toolTrace.length, 1, "independent search must be visible in the request trace");
  assert.equal(independentAgent.raw.toolTrace[0].toolName, "web_search");
  assert.equal(searchRequests.length, 1);
  assert.equal(searchRequests[0].authorization, `Bearer ${searchService.apiKey}`);
  assert.equal(providerRequests.length, 4);
  assert.equal(providerRequests[3].url, "/v1/chat/completions");
  assert.equal(providerRequests[3].body.tools, undefined, "independent search must not become a hosted main-model tool");
  assert(providerRequests[3].body.messages[0].content.includes("BEGIN UNTRUSTED EXTERNAL DATA: WEB SEARCH"));
  assert(providerRequests[3].body.messages[0].content.includes("https://source.example.test/verified"));

  const chatResponse = await fetch(`${appBaseUrl}/api/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({
      connection,
      modelId: "compatible-chat",
      assistantId: "legacy-general-assistant",
      content: "Use the selected assistant.",
      displayContent: "Use the selected assistant.",
      temperature: 0.7,
      skillInstructions: ["Visible skill contract"],
      allowedTools: ["web_search", "web_search"],
      searchService
    })
  });
  const chatStream = await chatResponse.text();
  assert.equal(chatResponse.status, 200, chatStream);
  assert.match(chatStream, /Inline automation completed\./);
  assert.equal(searchRequests.length, 2);
  assert.equal(providerRequests.length, 5);
  assert.equal(providerRequests[4].url, "/v1/chat/completions");
  assert(providerRequests[4].body.messages[0].content.includes("Legacy system prompt"));
  assert(providerRequests[4].body.messages[0].content.includes("Visible skill contract"));
  assert(providerRequests[4].body.messages[0].content.includes("BEGIN UNTRUSTED EXTERNAL DATA: WEB SEARCH"));
  assert.equal(providerRequests[4].body.tools, undefined, "Chat search must stay outside the selected model adapter");

  console.log("Automation request contracts passed");
} finally {
  if (app.exitCode === null) {
    app.kill();
    await Promise.race([
      once(app, "exit"),
      new Promise((resolve) => setTimeout(resolve, 3000))
    ]);
  }
  if (provider.listening) {
    await new Promise((resolve) => provider.close(resolve));
  }
  fs.rmSync(dataDir, { recursive: true, force: true });
  if (app.exitCode && app.exitCode !== 0) process.stderr.write(appOutput);
}
