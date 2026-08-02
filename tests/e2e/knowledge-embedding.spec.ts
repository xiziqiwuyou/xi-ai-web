import { expect, test } from "@playwright/test";

const storageKey = "xi-ai-web-knowledge-embedding-connections";
const baseId = "55555555-5555-4555-8555-555555555555";
const documentId = "66666666-6666-4666-8666-666666666666";

async function installEmbeddingApi(page: import("@playwright/test").Page) {
  let ready = false;
  let embeddingCalls = 0;
  const outbound: unknown[] = [];

  await page.route("**/api/kb/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (request.method() === "GET" && pathname === "/api/kb/public-config") {
      await route.fulfill({
        json: {
          registrationMode: "invite_only",
          accountRules: { usernameMinLength: 3, usernameMaxLength: 64, passwordMinLength: 10, passwordMaxLength: 128 },
          recoveryCodeShownOnce: true
        }
      });
      return;
    }
    if (request.method() === "GET" && pathname === "/api/kb/auth/session") {
      await route.fulfill({
        json: {
          authenticated: true,
          csrfToken: "fixture-csrf",
          account: { id: "fixture-account", username: "Alice", status: "active", quotaBytes: 5368709120 }
        }
      });
      return;
    }
    if (request.method() === "GET" && pathname === "/api/kb/embedding-profiles") {
      await route.fulfill({
        json: {
          items: [{
            id: "openai-text-embedding-3-small",
            vendor: "openai",
            label: "OpenAI Text Embedding 3 Small",
            actualModel: "text-embedding-3-small",
            dimensions: 1536,
            fingerprint: "f".repeat(64),
            defaultBaseUrl: "https://api.openai.com/v1",
            protocol: "openai-embeddings",
            maxBatchInputs: 32,
            maxInputTokens: 8192,
            bytesPerComponent: 4,
            storageType: "vector"
          }]
        }
      });
      return;
    }
    if (request.method() === "GET" && pathname === "/api/kb/bases") {
      await route.fulfill({
        json: {
          items: [{
            id: baseId,
            name: "产品资料",
            description: "",
            status: "active",
            embeddingProfile: {
              id: "openai-text-embedding-3-small",
              vendor: "openai",
              label: "OpenAI Text Embedding 3 Small",
              actualModel: "text-embedding-3-small",
              dimensions: 1536,
              fingerprint: "f".repeat(64),
              defaultBaseUrl: "https://api.openai.com/v1",
              protocol: "openai-embeddings",
              maxBatchInputs: 32,
              maxInputTokens: 8192,
              bytesPerComponent: 4,
              storageType: "vector"
            },
            chunkVersion: 1,
            activeIndexVersion: ready ? 1 : null,
            pendingIndexVersion: ready ? null : 1,
            version: 1,
            documentCount: 1,
            readyDocumentCount: ready ? 1 : 0,
            logicalBytes: ready ? "6144" : "0",
            embeddingProgress: {
              totalChunks: 1,
              readyChunks: ready ? 1 : 0,
              pendingChunks: ready ? 0 : 1,
              leasedChunks: 0,
              failedChunks: 0,
              lastErrorCode: null
            },
            createdAt: null,
            updatedAt: null,
            archivedAt: null
          }]
        }
      });
      return;
    }
    if (request.method() === "GET" && pathname === `/api/kb/bases/${baseId}/documents`) {
      await route.fulfill({
        json: {
          items: [{
            id: documentId,
            knowledgeBaseId: baseId,
            displayName: "guide.txt",
            declaredMimeType: "text/plain",
            verifiedMimeType: "text/plain",
            declaredBytes: "10",
            verifiedBytes: "10",
            declaredChecksumSha256: null,
            checksumSha256: null,
            objectVersionId: null,
            objectEtag: null,
            uploadExpiresAt: null,
            status: ready ? "ready" : "awaiting_embedding",
            parserVersion: "1",
            errorCode: null,
            version: 1,
            createdAt: null,
            updatedAt: null
          }]
        }
      });
      return;
    }
    if (request.method() === "POST" && pathname === `/api/kb/documents/${documentId}/embedding-batches/next`) {
      const body = request.postDataJSON();
      outbound.push(body);
      embeddingCalls += 1;
      ready = true;
      await route.fulfill({
        json: {
          done: true,
          batch: { id: "batch-1", status: "completed", chunkCount: 1, vectorBytes: "6144", completedAt: null, idempotent: false },
          progress: { totalChunks: 1, readyChunks: 1, pendingChunks: 0, leasedChunks: 0, failedChunks: 0, lastErrorCode: null },
          providerCall: true
        }
      });
      return;
    }
    if (request.method() === "POST" && pathname === "/api/kb/auth/logout") {
      await route.fulfill({ json: { ok: true } });
      return;
    }
    await route.fulfill({ status: 500, json: { error: { message: `unexpected ${request.method()} ${pathname}` } } });
  });

  return {
    calls: () => embeddingCalls,
    outbound
  };
}

test("knowledge embedding credentials stay in sessionStorage and resume pending indexing", async ({ page }) => {
  const fixture = await installEmbeddingApi(page);
  await page.goto("/knowledge");

  await expect(page.getByRole("heading", { name: "Alice 的知识空间" })).toBeVisible();
  await expect(page.getByText("待配置", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "继续索引" })).toBeDisabled();

  await page.getByRole("button", { name: "配置" }).first().click();
  await page.locator('.knowledge-cloud-connection-form input[type="password"]').fill("sk-browser-session-only");
  await page.getByRole("button", { name: "保存到本次会话" }).click();

  await expect(page.getByText("当前会话已连接", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "继续索引" })).toBeEnabled();
  const persisted = await page.evaluate((key) => ({
    session: sessionStorage.getItem(key),
    local: localStorage.getItem(key),
    provider: sessionStorage.getItem("cherry-web-user-provider")
  }), storageKey);
  expect(persisted.session).toContain("sk-browser-session-only");
  expect(persisted.local).toBeNull();
  expect(persisted.provider).toBeNull();

  await page.getByRole("button", { name: "继续索引" }).click();
  await expect(page.getByRole("button", { name: "索引已就绪" })).toBeVisible();
  expect(fixture.calls()).toBe(1);
  expect(fixture.outbound).toHaveLength(1);
  expect(fixture.outbound[0]).toMatchObject({
    embeddingProfileId: "openai-text-embedding-3-small",
    connection: { apiKey: "sk-browser-session-only" }
  });

  await page.reload();
  await expect(page.getByText("当前会话已连接", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "退出知识库账号" }).click();
  expect(await page.evaluate((key) => sessionStorage.getItem(key), storageKey)).toBeNull();
});
