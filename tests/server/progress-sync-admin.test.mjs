import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const rootDir = path.resolve(import.meta.dirname, "../..");

async function freePort() {
  const server = net.createServer();
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
      ADMIN_USERNAME: "xizi2333",
      ADMIN_PASSWORD: "progress-sync-admin-password",
      PROGRESS_SYNC_RATE_LIMIT_MAX: "1"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  const origin = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server exited early:\n${output}`);
    try {
      if ((await fetch(`${origin}/api/health`)).ok) return { child, origin };
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

async function json(origin, pathname, init = {}) {
  const response = await fetch(`${origin}${pathname}`, init);
  return { response, body: await response.json() };
}

test("Admin progress-sync settings update the live public boundary", { timeout: 30_000 }, async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "xi-ai-progress-sync-admin-"));
  const runtime = await startServer(dataDir);
  t.after(async () => {
    await stopServer(runtime.child);
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  const login = await fetch(`${runtime.origin}/api/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "xizi2333", password: "progress-sync-admin-password" })
  });
  assert.equal(login.status, 200);
  const cookie = String(login.headers.get("set-cookie") || "").split(";", 1)[0];

  let result = await json(runtime.origin, "/api/admin/bootstrap", { headers: { cookie } });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.settings.progressSync.enabled, true);

  result = await json(runtime.origin, "/api/admin/settings", {
    method: "PATCH",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      ...result.body.settings,
      progressSync: {
        enabled: false,
        ttlSeconds: 240,
        maxPayloadMb: 9,
        maxIpJoinAttempts: 3,
        maxSessionJoinAttempts: 2
      }
    })
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.progressSync.enabled, false);

  result = await json(runtime.origin, "/api/progress-sync/status");
  assert.deepEqual(result.body, {
    enabled: false,
    ttlSeconds: 240,
    maxPayloadBytes: 9 * 1024 * 1024
  });

  result = await json(runtime.origin, "/api/progress-sync/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({})
  });
  assert.equal(result.response.status, 503);
  assert.equal(result.body.error.code, "PROGRESS_SYNC_DISABLED");
  assert.equal(result.response.headers.get("cache-control"), "no-store, max-age=0");

  result = await json(runtime.origin, "/api/progress-sync/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({})
  });
  assert.equal(result.response.status, 429);
  assert.equal(result.response.headers.get("cache-control"), "no-store, max-age=0");
});

test("OneAPI settings handoff stays opt-in and cannot be changed by import or backup restore", { timeout: 30_000 }, async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "xi-ai-oneapi-settings-admin-"));
  const runtime = await startServer(dataDir);
  t.after(async () => {
    await stopServer(runtime.child);
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  const login = await fetch(`${runtime.origin}/api/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "xizi2333", password: "progress-sync-admin-password" })
  });
  assert.equal(login.status, 200);
  const cookie = String(login.headers.get("set-cookie") || "").split(";", 1)[0];

  let result = await json(runtime.origin, "/api/public/bootstrap");
  assert.equal(result.response.status, 200);
  assert.equal(result.body.settings.oneapiSettingsHandoffEnabled, false);
  assert.equal(Object.hasOwn(result.body.settings, "oneapiSettingsHandoffUrl"), false);
  assert.equal(Object.hasOwn(result.body.settings, "oneapiSettingsHandoffKey"), false);

  let admin = await json(runtime.origin, "/api/admin/bootstrap", { headers: { cookie } });
  result = await json(runtime.origin, "/api/admin/settings", {
    method: "PATCH",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      ...admin.body.settings,
      oneapiSettingsHandoffEnabled: true
    })
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.oneapiSettingsHandoffEnabled, true);

  result = await json(runtime.origin, "/api/public/bootstrap");
  assert.equal(result.body.settings.oneapiSettingsHandoffEnabled, true);

  const exported = await json(runtime.origin, "/api/admin/metadata-export", { headers: { cookie } });
  assert.equal(exported.response.status, 200);
  assert.equal(exported.body.settings.oneapiSettingsHandoffEnabled, true);
  exported.body.settings.oneapiSettingsHandoffEnabled = false;

  result = await json(runtime.origin, "/api/admin/metadata-import", {
    method: "PATCH",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify(exported.body)
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.settings.oneapiSettingsHandoffEnabled, true);

  const backups = await json(runtime.origin, "/api/admin/backups", { headers: { cookie } });
  assert.equal(backups.response.status, 200);
  assert(backups.body.length > 0);

  admin = await json(runtime.origin, "/api/admin/bootstrap", { headers: { cookie } });
  result = await json(runtime.origin, "/api/admin/settings", {
    method: "PATCH",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      ...admin.body.settings,
      oneapiSettingsHandoffEnabled: false
    })
  });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.oneapiSettingsHandoffEnabled, false);

  result = await json(
    runtime.origin,
    `/api/admin/backups/${encodeURIComponent(backups.body[0].name)}/restore`,
    { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({}) }
  );
  assert.equal(result.response.status, 200);
  assert.equal(result.body.settings.oneapiSettingsHandoffEnabled, false);

  result = await json(runtime.origin, "/api/public/bootstrap");
  assert.equal(result.body.settings.oneapiSettingsHandoffEnabled, false);
});
