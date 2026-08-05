import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const rootDir = path.resolve(import.meta.dirname, "../..");
const adminUsername = "xizi2333";
const adminPassword = "model-vendor-test-password";
const adminCookies = new Map();

async function freePort() {
  const server = (await import("node:net")).createServer();
  await new Promise((resolve, reject) => server.listen(0, "127.0.0.1", resolve).once("error", reject));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function startServer(dataDir) {
  const port = await freePort();
  const child = spawn(process.execPath, ["server/index.mjs"], {
    cwd: rootDir,
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: dataDir,
      NODE_ENV: "development",
      ADMIN_USERNAME: adminUsername,
      ADMIN_PASSWORD: adminPassword
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
      if (response.ok) {
        const login = await fetch(`${baseUrl}/api/admin/login`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ username: adminUsername, password: adminPassword })
        });
        if (!login.ok) throw new Error(`admin login failed with ${login.status}`);
        adminCookies.set(baseUrl, String(login.headers.get("set-cookie") || "").split(";", 1)[0]);
        return { child, baseUrl };
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  child.kill();
  throw new Error(`server did not become ready:\n${output}`);
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  child.kill();
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000))
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

async function api(baseUrl, pathname, init = {}) {
  const headers = new Headers(init.headers || {});
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (pathname.startsWith("/api/admin/") && adminCookies.get(baseUrl) && !headers.has("cookie")) {
    headers.set("cookie", adminCookies.get(baseUrl));
  }
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...init,
    headers
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  return { response, body };
}

test("Admin model vendor API enforces contracts and survives metadata round trips", { timeout: 45_000 }, async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "xi-ai-model-vendors-"));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  let runtime = await startServer(dataDir);
  t.after(async () => stopServer(runtime.child));

  let result = await api(runtime.baseUrl, "/api/admin/bootstrap");
  assert.equal(result.response.status, 200);
  assert.equal(result.body.modelVendors.length, 8);
  assert(result.body.modelCatalog.every((entry) => entry.vendorId && entry.vendorLabel));
  assert.deepEqual(result.body.modelCatalog.map((entry) => entry.order), result.body.modelCatalog.map((_, index) => index));

  const originalVendorIds = result.body.modelVendors.map((entry) => entry.id);
  const reorderedVendorIds = [originalVendorIds[1], originalVendorIds[0], ...originalVendorIds.slice(2)];
  result = await api(runtime.baseUrl, "/api/admin/model-vendors/order", {
    method: "PATCH",
    body: JSON.stringify({ vendorIds: reorderedVendorIds })
  });
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.body.map((entry) => entry.id), reorderedVendorIds);
  assert.deepEqual(result.body.map((entry) => entry.order), reorderedVendorIds.map((_, index) => index));

  result = await api(runtime.baseUrl, "/api/admin/model-vendors/order", {
    method: "PATCH",
    body: JSON.stringify({ vendorIds: [reorderedVendorIds[0], reorderedVendorIds[0]] })
  });
  assert.equal(result.response.status, 400);

  result = await api(runtime.baseUrl, "/api/admin/bootstrap");
  assert.deepEqual(result.body.modelVendors.map((entry) => entry.id), reorderedVendorIds);

  const originalModelIds = result.body.modelCatalog.map((entry) => entry.id);
  const reorderedModelIds = [originalModelIds[1], originalModelIds[0], ...originalModelIds.slice(2)];
  result = await api(runtime.baseUrl, "/api/admin/model-catalog/order", {
    method: "PATCH",
    body: JSON.stringify({ modelIds: reorderedModelIds })
  });
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.body.map((entry) => entry.id), reorderedModelIds);
  assert.deepEqual(result.body.map((entry) => entry.order), reorderedModelIds.map((_, index) => index));

  const reorderedFirstModelId = reorderedModelIds[0];
  result = await api(runtime.baseUrl, "/api/admin/model-catalog/order", {
    method: "PATCH",
    body: JSON.stringify({ modelIds: [reorderedFirstModelId, reorderedFirstModelId] })
  });
  assert.equal(result.response.status, 400);

  result = await api(runtime.baseUrl, "/api/admin/bootstrap");
  assert.deepEqual(result.body.modelCatalog.map((entry) => entry.id), reorderedModelIds);

  const ops = await api(runtime.baseUrl, "/api/admin/ops");
  assert.equal(ops.response.status, 200);
  assert.equal(ops.body.counts.modelVendors, result.body.modelVendors.length);
  assert.deepEqual(ops.body.modelInvocations, []);

  result = await api(runtime.baseUrl, "/api/public/bootstrap");
  assert.equal(result.response.status, 200);
  assert.equal(Object.hasOwn(result.body, "modelVendors"), false);
  assert(result.body.modelCatalog.every((entry) => entry.vendorLabel));
  assert.equal(result.body.modelCatalog[0].id, reorderedFirstModelId);
  const imageModel = result.body.modelCatalog.find((entry) => entry.capabilities.includes("image"));
  const chatOnlyModel = result.body.modelCatalog.find((entry) => (
    entry.capabilities.includes("chat") && !entry.capabilities.includes("image")
  ));
  assert(imageModel);
  assert(chatOnlyModel);
  let timing = await api(
    runtime.baseUrl,
    `/api/image/timing-estimate?modelId=${encodeURIComponent(imageModel.id)}&mode=generate&resolution=1K&aspectRatio=1%3A1&count=1`
  );
  assert.equal(timing.response.status, 200);
  assert.equal(timing.body.sampleCount, 0);
  assert.equal(timing.body.sampleLimit, 10);
  assert.equal(timing.body.source, "baseline");
  timing = await api(
    runtime.baseUrl,
    `/api/image/timing-estimate?modelId=${encodeURIComponent(chatOnlyModel.id)}&mode=generate&resolution=1K&aspectRatio=1%3A1&count=1`
  );
  assert.equal(timing.response.status, 400);

  result = await api(runtime.baseUrl, "/api/admin/model-vendors", {
    method: "POST",
    body: JSON.stringify({ label: "Acme Claude", adapter: "anthropic" })
  });
  assert.equal(result.response.status, 201);
  const customVendor = result.body;
  assert.equal(customVendor.adapter, "anthropic");

  result = await api(runtime.baseUrl, "/api/admin/model-vendors", {
    method: "POST",
    body: JSON.stringify({ label: "acme claude", adapter: "openai" })
  });
  assert.equal(result.response.status, 409);

  result = await api(runtime.baseUrl, "/api/admin/model-vendors", {
    method: "POST",
    body: JSON.stringify({ label: "Unsafe", adapter: "custom-code" })
  });
  assert.equal(result.response.status, 400);

  result = await api(runtime.baseUrl, "/api/admin/model-catalog", {
    method: "POST",
    body: JSON.stringify({
      vendorId: customVendor.id,
      vendor: "openai",
      vendorLabel: "forged",
      model: "claude-acme",
      label: "Claude Acme",
      capabilities: ["chat"],
      defaultFor: [],
      enabled: true
    })
  });
  assert.equal(result.response.status, 201);
  const customModel = result.body;
  assert.equal(customModel.vendor, "anthropic");
  assert.equal(customModel.vendorLabel, "Acme Claude");

  result = await api(runtime.baseUrl, `/api/admin/model-catalog/${customModel.id}`, {
    method: "PATCH",
    body: JSON.stringify({ vendorId: customVendor.id, vendor: "qwen", vendorLabel: "forged", label: "Claude Acme Updated" })
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.vendor, "anthropic");
  assert.equal(result.body.vendorLabel, "Acme Claude");

  result = await api(runtime.baseUrl, "/api/admin/model-catalog", {
    method: "POST",
    body: JSON.stringify({
      vendorId: customVendor.id,
      model: "claude-acme",
      label: "Duplicate Claude Acme",
      capabilities: ["chat"],
      defaultFor: [],
      enabled: true
    })
  });
  assert.equal(result.response.status, 409);

  result = await api(runtime.baseUrl, "/api/public/bootstrap");
  assert.equal(Object.hasOwn(result.body, "modelVendors"), false);
  assert.equal(result.body.modelCatalog.find((entry) => entry.id === customModel.id)?.vendorLabel, "Acme Claude");

  result = await api(runtime.baseUrl, "/api/admin/model-catalog", {
    method: "POST",
    body: JSON.stringify({ vendorId: "missing-vendor", model: "missing", label: "Missing", capabilities: ["chat"] })
  });
  assert.equal(result.response.status, 400);

  result = await api(runtime.baseUrl, `/api/admin/model-vendors/${customVendor.id}`, { method: "DELETE" });
  assert.equal(result.response.status, 409);

  result = await api(runtime.baseUrl, `/api/admin/model-catalog/${customModel.id}`, { method: "DELETE" });
  assert.equal(result.response.status, 204);
  result = await api(runtime.baseUrl, `/api/admin/model-vendors/${customVendor.id}`, { method: "DELETE" });
  assert.equal(result.response.status, 204);

  const exported = await api(runtime.baseUrl, "/api/admin/metadata-export");
  assert.equal(exported.response.status, 200);
  assert.equal(exported.body.modelVendors.some((entry) => entry.id === customVendor.id), false);
  exported.body.modelCatalog[0].vendorLabel = "forged";

  result = await api(runtime.baseUrl, "/api/admin/metadata-import", {
    method: "PATCH",
    body: JSON.stringify(exported.body)
  });
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.body.modelVendors, exported.body.modelVendors);
  assert.notEqual(result.body.modelCatalog[0].vendorLabel, "forged");

  const backups = await api(runtime.baseUrl, "/api/admin/backups");
  assert.equal(backups.response.status, 200);
  assert(backups.body.length > 0);
  const temporaryVendor = await api(runtime.baseUrl, "/api/admin/model-vendors", {
    method: "POST",
    body: JSON.stringify({ label: "Temporary Vendor", adapter: "qwen" })
  });
  assert.equal(temporaryVendor.response.status, 201);
  result = await api(
    runtime.baseUrl,
    `/api/admin/backups/${encodeURIComponent(backups.body[0].name)}/restore`,
    { method: "POST", body: JSON.stringify({}) }
  );
  assert.equal(result.response.status, 200);
  assert.equal(result.body.modelVendors.some((entry) => entry.id === temporaryVendor.body.id), false);

  const deepseekModels = result.body.modelCatalog.filter((entry) => entry.vendorId === "deepseek");
  assert(deepseekModels.length > 0);
  for (const model of deepseekModels) {
    result = await api(runtime.baseUrl, `/api/admin/model-catalog/${model.id}`, { method: "DELETE" });
    assert.equal(result.response.status, 204);
  }
  result = await api(runtime.baseUrl, "/api/admin/model-vendors/deepseek", { method: "DELETE" });
  assert.equal(result.response.status, 204);

  result = await api(runtime.baseUrl, "/api/admin/model-vendors/openai", { method: "DELETE" });
  assert.equal(result.response.status, 409);

  await stopServer(runtime.child);
  runtime = await startServer(dataDir);
  result = await api(runtime.baseUrl, "/api/admin/bootstrap");
  assert.equal(result.body.modelVendors.some((entry) => entry.id === "deepseek"), false);
  assert.equal(result.body.modelCatalog.some((entry) => entry.vendorId === "deepseek"), false);
  assert.equal(result.body.modelCatalog[0].id, reorderedFirstModelId);

  await stopServer(runtime.child);
  const singleVendorDir = fs.mkdtempSync(path.join(os.tmpdir(), "xi-ai-single-vendor-"));
  t.after(() => fs.rmSync(singleVendorDir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(singleVendorDir, "app-data.json"), JSON.stringify({
    version: 12,
    settings: { upstreamBaseUrl: "https://api.xi-ai.cn" },
    modelVendors: [
      { id: "only-vendor", label: "Only Vendor", adapter: "qwen", enabled: true, order: 0 }
    ],
    modelCatalog: [{
      id: "only-model",
      vendorId: "only-vendor",
      vendor: "openai",
      vendorLabel: "forged",
      endpointProtocol: "openai-chat",
      model: "qwen-only",
      label: "Qwen Only",
      capabilities: ["chat"],
      defaultFor: ["chat"],
      enabled: true
    }]
  }));
  runtime = await startServer(singleVendorDir);
  result = await api(runtime.baseUrl, "/api/admin/model-vendors/only-vendor", { method: "DELETE" });
  assert.equal(result.response.status, 409);
  assert.match(result.body.error, /至少/);
});
