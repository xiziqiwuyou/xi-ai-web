import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distIndex = path.join(rootDir, "dist", "index.html");
const password = "release-check-password";
const sessionSecret = "release-check-session-secret-with-enough-length";
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "cherry-release-check-"));
const port = await findFreePort();
const baseUrl = `http://127.0.0.1:${port}`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
      const health = await getJson("/api/health");
      if (health.ok) return;
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

writeLegacyDataFixture();

const child = spawn("node", ["server/index.mjs", "--production"], {
  cwd: rootDir,
  env: {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(port),
    DATA_DIR: dataDir,
    ADMIN_PASSWORD: password,
    ADMIN_SESSION_SECRET: sessionSecret
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
    body: JSON.stringify({ password })
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
  assert(!publicJson.includes("backups"), "Public bootstrap leaked backups");
  assert(!publicJson.includes("checklist"), "Public bootstrap leaked ops checklist");

  const listGone = await request("/api/conversations");
  const detailGone = await request("/api/conversations/release-check");
  assert(listGone.response.status === 410, "Legacy conversation list route must return 410");
  assert(detailGone.response.status === 410, "Legacy conversation detail route must return 410");

  console.log(`Release check passed for ${baseUrl}`);
} catch (error) {
  console.error(output.slice(-1600));
  throw error;
} finally {
  child.kill();
  await fs.promises.rm(dataDir, { recursive: true, force: true }).catch(() => {});
}
