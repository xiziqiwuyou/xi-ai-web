import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const requestedBaseUrl = process.env.UI_RUNTIME_URL || process.env.SMOKE_URL || "http://localhost:8787";
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseUrlObject = new URL(requestedBaseUrl);
const baseUrl = `${baseUrlObject.origin}${baseUrlObject.pathname === "/" ? "" : baseUrlObject.pathname}`;
const appPort = Number(baseUrlObject.port || (baseUrlObject.protocol === "https:" ? 443 : 80));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForEndpoint(url, timeoutMs, label) {
  const start = Date.now();
  let lastError = null;
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      lastError = new Error(`${label} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(250);
  }
  throw new Error(`${label} is unavailable: ${lastError?.message || "timeout"}`);
}

async function isPortOpen(host, port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const done = (open) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(open);
    };
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
    socket.setTimeout(500, () => done(false));
  });
}

async function ensureAppServer() {
  const healthUrl = `${baseUrl}/api/health`;
  try {
    await waitForEndpoint(healthUrl, 1200, "Local app server");
    return { close() {} };
  } catch {
    // Start a disposable app server when the requested local port is free.
  }

  if (baseUrlObject.hostname !== "localhost" && baseUrlObject.hostname !== "127.0.0.1") {
    throw new Error(`UI_RUNTIME_URL is unavailable and cannot be auto-started: ${baseUrl}`);
  }
  if (await isPortOpen(baseUrlObject.hostname, appPort)) {
    throw new Error(`Port ${appPort} is occupied, but ${healthUrl} is not healthy.`);
  }

  const child = spawn("node", ["server/index.mjs"], {
    cwd: rootDir,
    env: { ...process.env, PORT: String(appPort) },
    stdio: "pipe"
  });
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });
  await waitForEndpoint(healthUrl, 20000, "Started app server").catch((error) => {
    throw new Error(`${error.message}\nServer output:\n${output.slice(-1200)}`);
  });
  return {
    close() {
      child.kill();
    }
  };
}

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

async function fetchJson(url) {
  const response = await fetch(url);
  const text = await response.text();
  if (!response.ok) throw new Error(`${url} returned ${response.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : {};
}

const appServer = await ensureAppServer();
try {
  const bootstrap = await fetchJson(`${baseUrl}/api/public/bootstrap`);
  assert(bootstrap.settings?.siteName === "xi-ai-web", "Public bootstrap should expose xi-ai-web as the site name");
  const menuIds = Array.isArray(bootstrap.menuItems)
    ? bootstrap.menuItems.map((item) => item.id)
    : [];
  assert(
    JSON.stringify(menuIds) === JSON.stringify(["chat", "image", "mindmap", "agents", "apps", "gallery"]),
    "Public bootstrap should expose only the six core menu items"
  );

  const topBar = readProjectFile("src/app/TopBar.tsx");
  const shellCss = readProjectFile("src/styles/rednote-flat-v2.shell.css");
  const responsiveCss = readProjectFile("src/styles/rednote-flat-v2.responsive.css");
  assert(topBar.includes("className=\"top-module-nav\""), "Top navigation should render the module nav");
  assert(topBar.includes("top-module-button active"), "Top navigation should expose active module styling");
  assert(!topBar.includes("global-search-input"), "Top search should remain removed from TopBar");
  assert(shellCss.includes("flex: 1 0 104px"), "Top module buttons should be wide enough to fill the row");
  assert(shellCss.includes("border-radius: 18px"), "Top module buttons should use rounded styling");
  assert(responsiveCss.includes("topButton") === false, "Responsive CSS should not depend on old runtime-only markers");

  console.log("Runtime UI checks passed");
} finally {
  appServer.close();
}
