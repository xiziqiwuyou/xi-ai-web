import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const passthrough = process.argv.slice(2);
let appServer = null;
let runtimeDataDir = "";

function runNode(args, { env = process.env, stdio = "inherit" } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: rootDir,
      env,
      stdio,
      windowsHide: true
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code: code ?? 1, signal }));
  });
}

function reserveLoopbackPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Unable to allocate an isolated E2E port."));
        return;
      }
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

async function waitForHealth(baseUrl, child, output) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30_000) {
    if (child.exitCode !== null) {
      throw new Error(`E2E app server exited before becoming ready.\n${output().slice(-2_000)}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // The server may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`E2E app server did not become ready.\n${output().slice(-2_000)}`);
}

async function stopServer() {
  if (!appServer || appServer.exitCode !== null) return;
  appServer.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => appServer.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 7_000))
  ]);
  if (appServer.exitCode === null) {
    appServer.kill("SIGKILL");
    await Promise.race([
      new Promise((resolve) => appServer.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 2_000))
    ]);
  }
}

async function cleanup() {
  await stopServer();
  if (runtimeDataDir) {
    await fs.promises.rm(runtimeDataDir, { recursive: true, force: true });
  }
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    void cleanup().finally(() => process.exit(1));
  });
}

let exitCode = 1;
try {
  const externalBaseUrl = String(process.env.PLAYWRIGHT_BASE_URL || "").trim();
  let baseUrl = externalBaseUrl;
  if (!externalBaseUrl) {
    if (process.env.PLAYWRIGHT_SKIP_BUILD !== "true") {
      const build = await runNode(["node_modules/vite/bin/vite.js", "build"]);
      if (build.code !== 0) throw new Error(`E2E production build failed with exit code ${build.code}.`);
    }

    const port = await reserveLoopbackPort();
    baseUrl = `http://127.0.0.1:${port}`;
    runtimeDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "xi-ai-web-e2e-"));
    let serverOutput = "";
    appServer = spawn(process.execPath, ["server/index.mjs", "--production"], {
      cwd: rootDir,
      env: {
        ...process.env,
        NODE_ENV: "production",
        PORT: String(port),
        DATA_DIR: runtimeDataDir,
        ADMIN_PASSWORD: "playwright-admin"
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    appServer.stdout.on("data", (chunk) => {
      serverOutput = `${serverOutput}${chunk}`.slice(-8_000);
    });
    appServer.stderr.on("data", (chunk) => {
      serverOutput = `${serverOutput}${chunk}`.slice(-8_000);
    });
    await waitForHealth(baseUrl, appServer, () => serverOutput);
  }

  const result = await runNode(
    ["node_modules/@playwright/test/cli.js", "test", ...passthrough],
    { env: { ...process.env, PLAYWRIGHT_BASE_URL: baseUrl } }
  );
  exitCode = result.code;
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
} finally {
  await cleanup();
}

process.exit(exitCode);
