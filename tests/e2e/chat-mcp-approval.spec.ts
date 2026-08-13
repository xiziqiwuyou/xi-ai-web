import { expect, test } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const rootDir = path.resolve(import.meta.dirname, "../..");

async function freePort() {
  const server = http.createServer();
  await new Promise<void>((resolve, reject) => server.listen(0, "127.0.0.1", resolve).once("error", reject));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

async function jsonBody(request: http.IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) as Record<string, unknown> : {};
}

async function stopProcess(child: ChildProcess) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => resolve(), 2_000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
  if (child.exitCode === null) child.kill("SIGKILL");
}

test("desktop and mobile Chat keep MCP approval inline and resume after confirmation", async ({ page }) => {
  const providerBodies: Record<string, unknown>[] = [];
  const mcpCalls: Record<string, unknown>[] = [];
  let providerToolName = "";
  const upstream = http.createServer(async (request, response) => {
    const body = await jsonBody(request);
    response.setHeader("content-type", "application/json");
    if (request.url === "/mcp") {
      if (body.method === "initialize") {
        response.setHeader("mcp-session-id", "playwright-mcp-session");
        response.end(JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: { protocolVersion: "2025-06-18", capabilities: { tools: {} } }
        }));
        return;
      }
      if (body.method === "notifications/initialized") {
        response.statusCode = 202;
        response.end();
        return;
      }
      if (body.method === "tools/list") {
        response.end(JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            tools: [{
              name: "fixture.read",
              title: "Fixture read",
              description: "Read-only browser fixture",
              inputSchema: { type: "object", properties: { query: { type: "string" } } }
            }]
          }
        }));
        return;
      }
      if (body.method === "tools/call") {
        mcpCalls.push(body);
        response.end(JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: { content: [{ type: "text", text: "approved answer" }] }
        }));
        return;
      }
    }
    if (request.url === "/v1/responses") {
      providerBodies.push(body);
      providerToolName ||= ((body.tools as Array<{ name?: string }> | undefined)?.[0]?.name || "");
      const input = body.input;
      const isFollowUp = Boolean(
        body.previous_response_id ||
        (Array.isArray(input) && input.some((item) => item && typeof item === "object" && (item as { type?: string }).type === "function_call_output"))
      );
      response.end(JSON.stringify(isFollowUp
        ? { id: "playwright-response-2", output: [{ type: "message", content: [{ type: "output_text", text: "approved answer" }] }] }
        : { id: "playwright-response-1", output: [{ type: "function_call", call_id: "playwright-call", name: providerToolName, arguments: JSON.stringify({ query: "browser" }) }] }));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: "not found" }));
  });
  await new Promise<void>((resolve, reject) => upstream.listen(0, "127.0.0.1", resolve).once("error", reject));

  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "xi-ai-mcp-playwright-"));
  const appPort = await freePort();
  const child = spawn(process.execPath, ["server/index.mjs"], {
    cwd: rootDir,
    env: {
      ...process.env,
      PORT: String(appPort),
      DATA_DIR: dataDir,
      NODE_ENV: "development",
      ADMIN_USERNAME: "xizi2333",
      ADMIN_PASSWORD: "mcp-playwright-password",
      UPSTREAM_BASE_URL: `http://127.0.0.1:${(upstream.address() as { port: number }).port}`,
      ALLOW_LOCAL_UPSTREAM: "true",
      MCP_ALLOW_LOCAL_ENDPOINTS: "true",
      MCP_ALLOW_INSECURE_HTTP: "true",
      KNOWLEDGE_ENABLED: "false",
      LANGFLOW_ENABLED: "false"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let output = "";
  child.stdout?.on("data", (chunk) => { output += String(chunk); });
  child.stderr?.on("data", (chunk) => { output += String(chunk); });
  try {
    const baseUrl = `http://127.0.0.1:${appPort}`;
    for (let attempt = 0; attempt < 240; attempt += 1) {
      if (child.exitCode !== null) throw new Error(`server exited: ${output}`);
      try {
        if ((await fetch(`${baseUrl}/api/health`)).ok) break;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 50));
      if (attempt === 239) throw new Error(`server did not start: ${output}`);
    }
    const login = await fetch(`${baseUrl}/api/admin/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "xizi2333", password: "mcp-playwright-password" })
    });
    const adminCookie = String(login.headers.get("set-cookie") || "").split(";", 1)[0];
    const adminHeaders = { "content-type": "application/json", cookie: adminCookie };
    const profileResponse = await fetch(`${baseUrl}/api/admin/mcp-servers`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({
        label: "Browser MCP",
        endpoint: `http://127.0.0.1:${(upstream.address() as { port: number }).port}/mcp`,
        enabled: true
      })
    });
    const profile = await profileResponse.json() as { id: string };
    await fetch(`${baseUrl}/api/admin/mcp-execution`, {
      method: "PATCH",
      headers: adminHeaders,
      body: JSON.stringify({ enabled: true })
    });
    const allowResponse = await fetch(`${baseUrl}/api/admin/mcp-servers/${profile.id}/execution`, {
      method: "PUT",
      headers: adminHeaders,
      body: JSON.stringify({ executionEnabled: true, allowedToolNames: ["fixture.read"] })
    });
    expect(allowResponse.ok).toBeTruthy();

    await page.addInitScript(() => {
      window.sessionStorage.setItem("cherry-web-user-provider", JSON.stringify({
        apiKey: "sk-playwright-session-key",
        lastModelId: "openai-gpt-5-6-luna"
      }));
    });
    await page.goto(baseUrl);
    const session = page.locator(".figma-chat-session").first();
    await expect(session).toBeVisible();
    const mcpTrigger = session.getByRole("button", { name: "远程 MCP 工具" });
    await expect(mcpTrigger).toBeVisible();
    await mcpTrigger.click();
    await page.getByRole("option", { name: /Browser MCP/u }).click();
    await session.getByLabel("消息内容", { exact: true }).fill("读取浏览器数据");
    await session.getByRole("button", { name: "发送", exact: true }).click();

    const approval = page.getByRole("alert").filter({ hasText: "远程工具请求确认" });
    await expect(approval).toBeVisible();
    const bounds = await approval.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual((await page.evaluate(() => window.innerHeight)) + 2);
    await approval.getByRole("button", { name: "确认并执行" }).click();
    await expect(session.getByText("approved answer", { exact: true })).toBeVisible();
    expect(mcpCalls).toHaveLength(1);
    expect(providerBodies).toHaveLength(2);
  } finally {
    await stopProcess(child);
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
