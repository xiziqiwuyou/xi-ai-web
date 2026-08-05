import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distIndex = path.join(rootDir, "dist", "index.html");
const password = "release-check-password";
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "cherry-release-check-"));
const port = await findFreePort();
const upstreamPort = await findFreePort();
const baseUrl = `http://127.0.0.1:${port}`;
const upstreamBaseUrl = `http://127.0.0.1:${upstreamPort}`;
const testApiKey = "sk-release-check-not-a-real-key";
const upstreamRequests = [];
const onePixelPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nWQAAAAASUVORK5CYII=";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function stopChild(child) {
  if (child.exitCode !== null) return;
  child.kill();
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    delay(5000)
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

async function stopServer(server) {
  if (!server.listening) return;
  await new Promise((resolve) => server.close(resolve));
}

async function readRequestJson(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    assert(total <= 2 * 1024 * 1024, "Release-check upstream request exceeded 2 MB");
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

function writeJson(res, value) {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(value));
}

const upstreamServer = http.createServer(async (req, res) => {
  try {
    const body = await readRequestJson(req);
    upstreamRequests.push({
      method: req.method,
      url: req.url,
      authorization: req.headers.authorization,
      body
    });

    if (req.url?.endsWith("/responses")) {
      writeJson(res, {
        id: "resp_release_check",
        output: [{ type: "message", content: [{ type: "output_text", text: "release-chat-ok" }] }],
        usage: { input_tokens: 3, output_tokens: 2, total_tokens: 5 }
      });
      return;
    }
    if (req.url?.endsWith("/chat/completions")) {
      writeJson(res, {
        choices: [{ message: { role: "assistant", content: "release-chat-ok" } }],
        usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 }
      });
      return;
    }
    if (req.url?.endsWith("/images/generations")) {
      if (body.prompt === "Complete image batch") {
        const count = Math.max(1, Math.min(10, Math.trunc(Number(body.n)) || 1));
        writeJson(res, { data: Array.from({ length: count }, () => ({ b64_json: onePixelPng })) });
      } else if (body.prompt === "Incomplete image batch" && Number(body.n) === 1) {
        writeJson(res, { data: [] });
      } else {
        writeJson(res, { data: [{ b64_json: onePixelPng }] });
      }
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "unsupported release-check upstream route" }));
  } catch (error) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: String(error?.message || error) }));
  }
});

await new Promise((resolve, reject) => {
  upstreamServer.once("error", reject);
  upstreamServer.listen(upstreamPort, "127.0.0.1", resolve);
});

async function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function request(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, options);
  const text = await response.text();
  return { response, text };
}

async function getJson(pathname, options = {}) {
  const result = await request(pathname, options);
  assert(result.response.ok, `${pathname} returned ${result.response.status}: ${result.text.slice(0, 300)}`);
  return result.text ? JSON.parse(result.text) : {};
}

async function waitForHealth(child) {
  const started = Date.now();
  let lastText = "";
  while (Date.now() - started < 20000) {
    try {
      const readiness = await getJson("/api/ready");
      if (readiness.ready) return;
    } catch (error) {
      lastText = error.message;
    }
    if (child.exitCode !== null) break;
    await delay(250);
  }
  throw new Error(`Production server did not become healthy. Last error: ${lastText}`);
}

function cookieFrom(response) {
  const cookie = response.headers.get("set-cookie");
  assert(cookie?.includes("cw_admin_session="), "Admin login did not set a session cookie");
  return cookie.split(";")[0];
}

function writeLegacyDataFixture() {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(
    path.join(dataDir, "app-data.json"),
    JSON.stringify(
      {
        version: 5,
        settings: {
          siteName: "Release Check Legacy",
          theme: "rednote",
          allowGuestChat: true,
          defaultModule: "chat"
        }
      },
      null,
      2
    )
  );
}

function writeRestoreFixture() {
  const backupDir = path.join(dataDir, "backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const backupName = "app-data-release-check.json";
  fs.writeFileSync(
    path.join(backupDir, backupName),
    JSON.stringify(
      {
        version: 5,
        settings: {
          siteName: "Release Check Restored",
          theme: "rednote",
          allowGuestChat: true,
          defaultModule: "chat"
        }
      },
      null,
      2
    )
  );
  return backupName;
}

if (!fs.existsSync(distIndex)) {
  throw new Error("dist/index.html is missing. Run npm run build before release-check.");
}

const serverSource = fs.readFileSync(path.join(rootDir, "server", "index.mjs"), "utf8");
for (const forbidden of ["node:sqlite", "DatabaseSync", "STORAGE_DRIVER", "app-data.sqlite"]) {
  assert(!serverSource.includes(forbidden), `Database-related server code is not allowed: ${forbidden}`);
}

const dockerfileSource = fs.readFileSync(path.join(rootDir, "Dockerfile"), "utf8");
const composeSource = fs.readFileSync(path.join(rootDir, "deploy", "app", "docker-compose.yml"), "utf8");
assert(/\bUSER\s+node\b/u.test(dockerfileSource), "Production image must run as the node user");
for (const required of ["read_only: true", "cap_drop:", "no-new-privileges:true", "pids_limit:", "/api/ready"]) {
  assert(composeSource.includes(required), `Compose runtime hardening is missing: ${required}`);
}

writeLegacyDataFixture();

const child = spawn("node", ["server/index.mjs", "--production"], {
  cwd: rootDir,
  env: {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(port),
    DATA_DIR: dataDir,
    ADMIN_PASSWORD: password,
    UPSTREAM_BASE_URL: upstreamBaseUrl,
    ALLOW_LOCAL_UPSTREAM: "true",
    ALLOW_ADMIN_UPSTREAM_OVERRIDE: "false",
    KNOWLEDGE_ENABLED: "false",
    LANGFLOW_ENABLED: "false"
  },
  stdio: "pipe"
});

let output = "";
child.stdout.on("data", (chunk) => {
  output += chunk.toString();
});
child.stderr.on("data", (chunk) => {
  output += chunk.toString();
});

try {
  await waitForHealth(child);

  const unauthOps = await request("/api/admin/ops");
  assert(unauthOps.response.status === 401, "Unauthenticated admin ops must return 401 in production");

  const login = await request("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "xizi2333", password })
  });
  assert(login.response.ok, `Admin login failed: ${login.response.status} ${login.text}`);
  const cookie = cookieFrom(login.response);

  const ops = await getJson("/api/admin/ops", { headers: { Cookie: cookie } });
  assert(ops.runtime?.mode === "production", "Ops runtime mode should be production");
  assert(ops.runtime?.metadataFile?.endsWith("app-data.json"), "Ops runtime should report the JSON metadata file");
  assert(ops.checklist?.some((item) => item.id === "admin-password" && item.ok), "Ops checklist did not pass admin-password");
  assert(ops.checklist?.some((item) => item.id === "session-secret" && item.ok), "Ops checklist did not pass session-secret");
  assert(fs.existsSync(path.join(dataDir, "app-data.json")), "JSON metadata file was not created");

  const metadataBootstrap = await getJson("/api/admin/bootstrap", { headers: { Cookie: cookie } });
  assert(metadataBootstrap.settings?.siteName === "Release Check Legacy", "JSON metadata was not loaded");

  const upstreamOverride = await request("/api/admin/settings", {
    method: "PATCH",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ upstreamBaseUrl: "https://override.example.test" })
  });
  assert(upstreamOverride.response.status === 400, "Production upstream lock must reject Admin overrides");

  const unsafe = await request("/api/admin/backups/bad.json/restore", {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: "{}"
  });
  assert(unsafe.response.status === 400, "Unsafe backup filename should return 400");

  const backupName = writeRestoreFixture();
  const restore = await getJson(`/api/admin/backups/${encodeURIComponent(backupName)}/restore`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: "{}"
  });
  assert(restore.restored, "Valid backup restore did not report restored=true");
  assert(restore.settings?.siteName === "Release Check Restored", "Valid backup restore did not apply restored settings");

  const audit = await getJson("/api/admin/audit-log?action=backup-restore&limit=1", {
    headers: { Cookie: cookie }
  });
  assert(Array.isArray(audit) && audit[0]?.action === "backup-restore", "Audit filter did not return backup-restore");

  const publicBootstrap = await getJson("/api/public/bootstrap");
  const publicJson = JSON.stringify(publicBootstrap);
  assert(!publicJson.includes("apiKey"), "Public bootstrap leaked apiKey");
  assert(!publicJson.includes("baseUrl"), "Public bootstrap leaked baseUrl");
  assert(!publicJson.includes("LANGFLOW_API_KEY"), "Public bootstrap leaked Langflow configuration");
  assert(
    !publicBootstrap.langflowWorkflows?.some((workflow) => Object.prototype.hasOwnProperty.call(workflow, "flowId")),
    "Public bootstrap leaked a private Langflow Flow ID"
  );
  assert(!publicJson.includes("backups"), "Public bootstrap leaked backups");
  assert(!publicJson.includes("checklist"), "Public bootstrap leaked ops checklist");

  const chatModel = publicBootstrap.modelCatalog?.find(
    (entry) => entry.enabled !== false && entry.vendor === "openai" && entry.capabilities?.includes("chat")
  );
  assert(chatModel?.id, "Release check requires an enabled OpenAI chat model");
  const chat = await request("/api/chat/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      modelId: chatModel.id,
      connection: { apiKey: testApiKey, baseUrl: "http://169.254.169.254/latest/meta-data" },
      content: "Reply with the release-check marker.",
      displayContent: "Reply with the release-check marker.",
      conversation: { id: "release-check-chat", title: "Release check", messages: [] },
      includeUsage: true
    })
  });
  assert(chat.response.ok, `Chat route failed: ${chat.response.status} ${chat.text.slice(0, 300)}`);
  assert(chat.response.headers.get("content-type")?.includes("text/event-stream"), "Chat route did not return SSE");
  assert(chat.text.includes("event: meta"), "Chat SSE did not include meta");
  assert(chat.text.includes("release-chat-ok"), "Chat SSE did not include provider text");
  assert(chat.text.includes("event: done"), "Chat SSE did not include done");

  const imageModel = publicBootstrap.modelCatalog?.find(
    (entry) => entry.enabled !== false && entry.vendor === "openai" && entry.capabilities?.includes("image")
  );
  assert(imageModel?.id, "Release check requires an enabled OpenAI image model");
  const timingEstimatePath = `/api/image/timing-estimate?modelId=${encodeURIComponent(imageModel.id)}&mode=generate&resolution=1K&aspectRatio=1%3A1&count=2`;
  const initialTimingEstimate = await getJson(timingEstimatePath);
  assert(initialTimingEstimate.sampleCount === 0, "Fresh release check must start without image timing samples");
  const imageResult = await getJson("/api/generate/image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      modelId: imageModel.id,
      connection: { apiKey: testApiKey, baseUrl: "http://127.0.0.1:9" },
      prompt: "A small red square on a white background",
      options: { count: 2, quality: "low", outputFormat: "png" }
    })
  });
  assert(imageResult.status === "completed", "Image route did not complete");
  assert(imageResult.assets?.[0]?.url?.startsWith("data:image/png;base64,"), "Image route did not normalize an image asset");
  assert(imageResult.assets?.length === 2, "Image route did not complete the requested two-image result set");
  assert(imageResult.raw?.requestedCount === 2 && imageResult.raw?.assetCount === 2, "Image result count metadata is inconsistent");
  assert(imageResult.raw?.providerRequestCount === 2, "Image result did not report its supplemental Provider request");
  assert(imageResult.timingEstimate?.sampleCount === 1, "Image response did not return the refreshed global timing estimate");
  const refreshedTimingEstimate = await getJson(timingEstimatePath);
  assert(refreshedTimingEstimate.sampleCount === 1, "Successful image generation did not persist one global timing sample");
  assert(refreshedTimingEstimate.sampleLimit === 10, "Global timing estimate must retain the recent-10 contract");

  const chatUpstream = upstreamRequests.find((item) => /\/(?:responses|chat\/completions)$/u.test(item.url || ""));
  const imageUpstreams = upstreamRequests.filter((item) => item.url?.endsWith("/images/generations"));
  const imageUpstream = imageUpstreams[0];
  assert(chatUpstream, "Chat did not reach the controlled upstream");
  assert(imageUpstream, "Image generation did not reach the controlled upstream");
  assert(imageUpstreams.length === 2, "Partial image response must trigger one bounded supplemental request");
  assert(imageUpstreams[0].body?.n === 2, "Initial image request must preserve the requested count");
  assert(imageUpstreams[1].body?.n === 1, "Supplemental image request must ask for one missing image");
  assert(chatUpstream.authorization === `Bearer ${testApiKey}`, "Chat did not forward the BYOK authorization header");
  assert(imageUpstream.authorization === `Bearer ${testApiKey}`, "Image did not forward the BYOK authorization header");

  const completeBatchOffset = upstreamRequests.length;
  const completeBatch = await getJson("/api/generate/image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      modelId: imageModel.id,
      connection: { apiKey: testApiKey },
      prompt: "Complete image batch",
      options: { count: 2, quality: "low", outputFormat: "png" }
    })
  });
  const completeBatchRequests = upstreamRequests
    .slice(completeBatchOffset)
    .filter((item) => item.url?.endsWith("/images/generations"));
  assert(completeBatch.assets?.length === 2, "Complete upstream batch did not retain both images");
  assert(completeBatch.raw?.providerRequestCount === 1, "Complete upstream batch must not trigger a supplemental request");
  assert(completeBatchRequests.length === 1 && completeBatchRequests[0].body?.n === 2, "Complete upstream batch must make one n=2 request");

  const incompleteBatchOffset = upstreamRequests.length;
  const incompleteBatch = await request("/api/generate/image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      modelId: imageModel.id,
      connection: { apiKey: testApiKey },
      prompt: "Incomplete image batch",
      options: { count: 2, quality: "low", outputFormat: "png" }
    })
  });
  const incompleteBatchRequests = upstreamRequests
    .slice(incompleteBatchOffset)
    .filter((item) => item.url?.endsWith("/images/generations"));
  assert(incompleteBatch.response.status === 502, "Incomplete bounded image batch must not be reported as completed");
  assert(incompleteBatchRequests.length === 2, "Incomplete image batch must stop after one bounded supplemental request");

  const listGone = await request("/api/conversations");
  const detailGone = await request("/api/conversations/release-check");
  assert(listGone.response.status === 410, "Legacy conversation list route must return 410");
  assert(detailGone.response.status === 410, "Legacy conversation detail route must return 410");

  for (const retiredRoute of ["/api/bootstrap", "/api/auth/status", "/api/auth/login", "/api/auth/logout"]) {
    const retired = await request(retiredRoute);
    assert(retired.response.status === 404, `${retiredRoute} must remain removed`);
  }

  const wrongUsername = await request("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "wrong-operator", password })
  });
  const wrongPassword = await request("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "xizi2333", password: "wrong-admin-password" })
  });
  assert(wrongUsername.response.status === 401 && wrongPassword.response.status === 401, "Invalid Admin credentials must return 401");
  assert(wrongUsername.text === wrongPassword.text, "Admin login must not reveal which credential was incorrect");

  const rotatedUsername = "release-operator";
  const rotatedPassword = "release-rotated-admin-password";
  const rotation = await getJson("/api/admin/credentials", {
    method: "PATCH",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({
      currentPassword: password,
      username: rotatedUsername,
      password: rotatedPassword
    })
  });
  assert(rotation.reauthenticationRequired === true && rotation.username === rotatedUsername, "Admin credential rotation did not require a new login");
  const staleSession = await request("/api/admin/ops", { headers: { Cookie: cookie } });
  assert(staleSession.response.status === 401, "Credential rotation must invalidate existing Admin sessions");
  const rotatedLogin = await request("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: rotatedUsername, password: rotatedPassword })
  });
  assert(rotatedLogin.response.ok, "Rotated Admin credentials must support a fresh login");
  const persistedCredentials = fs.readFileSync(path.join(dataDir, "admin-credentials.json"), "utf8");
  assert(!persistedCredentials.includes(password) && !persistedCredentials.includes(rotatedPassword), "Admin credential file must not contain plaintext passwords");

  console.log(`Release check passed for ${baseUrl}`);
} catch (error) {
  console.error(output.slice(-1600));
  throw error;
} finally {
  await stopChild(child);
  await stopServer(upstreamServer);
  await fs.promises.rm(dataDir, { recursive: true, force: true }).catch(() => {});
}
