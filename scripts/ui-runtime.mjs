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
const expectedDestinations = [
  { id: "chat", label: "AI \u5bf9\u8bdd" },
  { id: "image", label: "\u56fe\u50cf\u751f\u6210" },
  { id: "agents", label: "\u667a\u80fd\u4f53" },
  { id: "workflows", label: "\u5de5\u4f5c\u6d41" },
  { id: "ppt", label: "AI \u4e00\u952e PPT" },
  { id: "mindmap", label: "\u601d\u7ef4\u5bfc\u56fe" },
  { id: "assistants", label: "\u52a9\u624b\u5e93" },
  { id: "translate", label: "\u7ffb\u8bd1" }
];

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
  const destinations = Array.isArray(bootstrap.menuItems)
    ? bootstrap.menuItems.map(({ id, label }) => ({ id, label }))
    : [];
  assert(
    JSON.stringify(destinations) === JSON.stringify(expectedDestinations),
    `Public bootstrap must expose the exact Figma destinations: ${JSON.stringify(destinations)}`
  );

  const topBar = readProjectFile("src/app/TopBar.tsx");
  const appShell = readProjectFile("src/app/AppShell.tsx");
  const chatModule = readProjectFile("src/features/chat/ChatModule.tsx");
  const shellCss = readProjectFile("src/styles/rednote-flat-v2.shell.css");
  const chatCss = readProjectFile("src/styles/rednote-flat-v2.chat.css");
  const responsiveCss = readProjectFile("src/styles/rednote-flat-v2.responsive.css");
  assert(topBar.includes('navigation("figma-navigation")'), "Shell should render .figma-navigation");
  assert(topBar.includes('"figma-nav-item active"'), "Figma navigation should expose active item styling");
  assert(topBar.includes('className="figma-mobile-header"'), "TopBar should render .figma-mobile-header");
  assert(topBar.includes('"figma-sidebar mobile-open"'), "TopBar should render the mobile .figma-sidebar state");
  assert(topBar.includes('"\u6253\u5f00\u529f\u80fd\u83dc\u5355"'), "Mobile navigation trigger name changed");
  assert(!topBar.includes("onRequestApiConfig"), "Public shell must not expose a persistent API configuration action");

  assert(appShell.includes('className="figma-studio-shell"'), "AppShell lacks .figma-studio-shell");
  assert(appShell.includes('className="figma-workspace"'), "AppShell lacks .figma-workspace");
  assert(appShell.includes('data-scroll-owner="public-workspace"'), "Figma workspace must own public scrolling");

  for (const requiredClass of [
    "figma-workspace-heading",
    "figma-chat-session",
    "figma-session-header",
    "figma-message-history",
    "figma-composer"
  ]) {
    assert(chatModule.includes(requiredClass), `Chat source lacks ${requiredClass}`);
  }
  for (const exactCopy of [
    "AI \u5bf9\u8bdd\u5de5\u4f5c\u53f0",
    "\u7f51\u7edc\u641c\u7d22",
    "\u56fe\u7247\u8f93\u5165",
    "\u6e05\u9664\u6d88\u606f",
    "Shift + Enter"
  ]) {
    assert(chatModule.includes(exactCopy), `Chat source lacks exact Figma copy: ${exactCopy}`);
  }

  assert(shellCss.includes("grid-template-columns: 224px minmax(0, 1fr)"), "Desktop Figma shell width changed");
  assert(shellCss.includes(".figma-navigation"), "Shell CSS lacks .figma-navigation");
  assert(shellCss.includes(".figma-nav-item"), "Shell CSS lacks .figma-nav-item");
  assert(chatCss.includes(".figma-chat-session"), "Chat CSS lacks .figma-chat-session");
  assert(chatCss.includes(".figma-composer"), "Chat CSS lacks .figma-composer");
  assert(responsiveCss.includes(".figma-sidebar.mobile-open"), "Responsive CSS lacks the mobile Figma navigation state");
  assert(!responsiveCss.includes("214px"), "The 1024px Figma rail must not use the retired 214px width");
  assert(responsiveCss.includes("grid-template-columns: 224px minmax(0, 1fr)"), "The 1024px Figma rail must keep its 224px width");

  for (const retiredToken of [
    'navigation("studio-nav")',
    'navigation("studio-mobile-nav")',
    "studio-nav-item active",
    'className="studio-mobile-header"',
    'className="studio-mobile-menu"',
    'className="top-module-nav"'
  ]) {
    assert(!topBar.includes(retiredToken), `Retired public shell token remains: ${retiredToken}`);
  }
  for (const retiredToken of ["conversation-rail", "thread-main", "composer-status-row", "mask-workflow"]) {
    assert(!chatModule.includes(retiredToken), `Retired Chat token remains: ${retiredToken}`);
  }

  console.log("Runtime UI checks passed");
} finally {
  appServer.close();
}
