import { expect, test } from "@playwright/test";
import { readWorkspaceRecords } from "./support/app-fixture";

const baseId = "55555555-5555-4555-8555-555555555555";
const createdBaseId = "77777777-7777-4777-8777-777777777777";
const documentId = "66666666-6666-4666-8666-666666666666";

const profiles = [
  {
    id: "openai-text-embedding-3-small",
    vendor: "openai",
    label: "OpenAI Text Embedding 3 Small",
    actualModel: "text-embedding-3-small",
    dimensions: 1536,
    fingerprint: "a".repeat(64),
    defaultBaseUrl: "https://api.openai.com/v1",
    protocol: "openai-embeddings",
    maxBatchInputs: 32,
    maxInputTokens: 8192,
    bytesPerComponent: 4,
    storageType: "vector"
  },
  {
    id: "qwen-text-embedding-v4",
    vendor: "qwen",
    label: "Qwen Text Embedding V4",
    actualModel: "text-embedding-v4",
    dimensions: 1024,
    fingerprint: "b".repeat(64),
    defaultBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    protocol: "qwen-openai-compatible-embeddings",
    maxBatchInputs: 10,
    maxInputTokens: 8192,
    bytesPerComponent: 4,
    storageType: "vector"
  }
] as const;

type FixtureOptions = {
  failCosUpload?: boolean;
};

async function installWorkspaceApi(page: import("@playwright/test").Page, options: FixtureOptions = {}) {
  const calls: string[] = [];
  let nextDocumentId = documentId;
  const bases = new Map<string, any>([[baseId, {
    id: baseId,
    name: "产品资料",
    description: "产品说明与发布记录",
    status: "active",
    embeddingProfile: {
      id: profiles[0].id,
      vendor: profiles[0].vendor,
      actualModel: profiles[0].actualModel,
      dimensions: profiles[0].dimensions,
      fingerprint: profiles[0].fingerprint
    },
    chunkVersion: 1,
    activeIndexVersion: null,
    pendingIndexVersion: 1,
    version: 1,
    documentCount: 0,
    readyDocumentCount: 0,
    logicalBytes: "0",
    embeddingProgress: {
      totalChunks: 0,
      readyChunks: 0,
      pendingChunks: 0,
      leasedChunks: 0,
      failedChunks: 0,
      lastErrorCode: null
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    archivedAt: null
  }]]);
  const documents = new Map<string, any[]>();

  const syncBase = (targetBaseId: string) => {
    const base = bases.get(targetBaseId);
    const items = documents.get(targetBaseId) || [];
    if (!base) return;
    base.documentCount = items.filter((item) => item.status !== "deleting").length;
    base.readyDocumentCount = items.filter((item) => item.status === "ready").length;
    base.embeddingProgress = {
      totalChunks: items.length,
      readyChunks: items.filter((item) => item.status === "ready").length,
      pendingChunks: items.filter((item) => ["awaiting_embedding", "embedding"].includes(item.status)).length,
      leasedChunks: 0,
      failedChunks: items.filter((item) => item.status === "failed").length,
      lastErrorCode: null
    };
  };

  await page.route("https://cos.example.test/**", async (route) => {
    calls.push(`${route.request().method()} COS`);
    if (options.failCosUpload) {
      await route.fulfill({ status: 503, body: "upload unavailable" });
      return;
    }
    await route.fulfill({
      status: 200,
      headers: { ETag: '"fixture-etag"', "x-cos-version-id": "fixture-version" },
      body: ""
    });
  });

  await page.route("**/api/kb/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    calls.push(`${request.method()} ${pathname}`);
    if (request.method() === "GET" && pathname === "/api/kb/public-config") {
      await route.fulfill({ json: {
        registrationMode: "invite_only",
        accountRules: { usernameMinLength: 3, usernameMaxLength: 64, passwordMinLength: 10, passwordMaxLength: 128 },
        recoveryCodeShownOnce: true
      } });
      return;
    }
    if (request.method() === "GET" && pathname === "/api/kb/auth/session") {
      await route.fulfill({ json: {
        authenticated: true,
        csrfToken: "workspace-csrf",
        account: {
          id: "fixture-account",
          username: "Alice",
          status: "active",
          quotaBytes: 5 * 1024 ** 3,
          usedBytes: 32 * 1024 ** 2,
          reservedBytes: 0
        }
      } });
      return;
    }
    if (request.method() === "GET" && pathname === "/api/kb/embedding-profiles") {
      await route.fulfill({ json: { items: profiles } });
      return;
    }
    if (request.method() === "GET" && pathname === "/api/kb/bases") {
      bases.forEach((_base, id) => syncBase(id));
      await route.fulfill({ json: { items: [...bases.values()] } });
      return;
    }
    if (request.method() === "POST" && pathname === "/api/kb/bases") {
      const input = request.postDataJSON();
      const profile = profiles.find((item) => item.id === input.embeddingProfileId) || profiles[0];
      const base = {
        ...structuredClone(bases.get(baseId)),
        id: createdBaseId,
        name: input.name,
        description: input.description || "",
        embeddingProfile: {
          id: profile.id,
          vendor: profile.vendor,
          actualModel: profile.actualModel,
          dimensions: profile.dimensions,
          fingerprint: profile.fingerprint
        }
      };
      bases.set(createdBaseId, base);
      documents.set(createdBaseId, []);
      await route.fulfill({ status: 201, json: { base } });
      return;
    }
    const baseMatch = pathname.match(/^\/api\/kb\/bases\/([^/]+)$/);
    if (request.method() === "PATCH" && baseMatch) {
      const base = bases.get(baseMatch[1]);
      const input = request.postDataJSON();
      Object.assign(base, input, { version: base.version + 1 });
      if (input.embeddingProfileId) {
        const profile = profiles.find((item) => item.id === input.embeddingProfileId);
        base.embeddingProfile = {
          id: profile.id,
          vendor: profile.vendor,
          actualModel: profile.actualModel,
          dimensions: profile.dimensions,
          fingerprint: profile.fingerprint
        };
      }
      await route.fulfill({ json: { base } });
      return;
    }
    const documentListMatch = pathname.match(/^\/api\/kb\/bases\/([^/]+)\/documents$/);
    if (request.method() === "GET" && documentListMatch) {
      await route.fulfill({ json: { items: documents.get(documentListMatch[1]) || [] } });
      return;
    }
    const grantMatch = pathname.match(/^\/api\/kb\/bases\/([^/]+)\/documents\/upload-grant$/);
    if (request.method() === "POST" && grantMatch) {
      const input = request.postDataJSON();
      const id = nextDocumentId;
      nextDocumentId = "88888888-8888-4888-8888-888888888888";
      const document = {
        id,
        knowledgeBaseId: grantMatch[1],
        displayName: input.displayName,
        declaredMimeType: input.declaredMimeType,
        verifiedMimeType: null,
        declaredBytes: String(input.declaredBytes),
        verifiedBytes: null,
        declaredChecksumSha256: null,
        checksumSha256: null,
        objectVersionId: null,
        objectEtag: null,
        uploadExpiresAt: "2026-01-01T00:15:00.000Z",
        status: "pending_upload",
        parserVersion: null,
        errorCode: null,
        version: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      };
      documents.set(grantMatch[1], [...(documents.get(grantMatch[1]) || []), document]);
      syncBase(grantMatch[1]);
      await route.fulfill({ status: 201, json: {
        document,
        upload: {
          provider: "tencent-cos",
          bucket: "fixture-1250000000",
          region: "ap-guangzhou",
          objectKey: `knowledge/fixture/${grantMatch[1]}/${id}/source/opaque`,
          uploadUrl: `https://cos.example.test/${id}?q-signature=fixture`,
          startTime: 1,
          expiredTime: 901,
          expiresAt: "2026-01-01T00:15:00.000Z",
          credentials: { tmpSecretId: "temporary-id", tmpSecretKey: "temporary-key", sessionToken: "temporary-token" },
          constraints: { contentLength: input.declaredBytes, contentType: input.declaredMimeType },
          requiredHeaders: { "Content-Type": input.declaredMimeType }
        }
      } });
      return;
    }
    const finalizeMatch = pathname.match(/^\/api\/kb\/documents\/([^/]+)\/finalize$/);
    if (request.method() === "POST" && finalizeMatch) {
      let finalized;
      let targetBaseId = "";
      for (const [candidateBaseId, items] of documents) {
        const document = items.find((item) => item.id === finalizeMatch[1]);
        if (!document) continue;
        document.status = "awaiting_embedding";
        document.verifiedMimeType = document.declaredMimeType;
        document.verifiedBytes = document.declaredBytes;
        document.objectEtag = "fixture-etag";
        document.version += 1;
        finalized = document;
        targetBaseId = candidateBaseId;
      }
      syncBase(targetBaseId);
      await route.fulfill({ json: { document: finalized, idempotent: false } });
      return;
    }
    const embeddingMatch = pathname.match(/^\/api\/kb\/documents\/([^/]+)\/embedding-batches\/next$/);
    if (request.method() === "POST" && embeddingMatch) {
      for (const [targetBaseId, items] of documents) {
        const document = items.find((item) => item.id === embeddingMatch[1]);
        if (!document) continue;
        document.status = "ready";
        document.version += 1;
        const base = bases.get(targetBaseId);
        base.activeIndexVersion = base.pendingIndexVersion;
        base.pendingIndexVersion = null;
        base.version += 1;
        syncBase(targetBaseId);
      }
      await route.fulfill({ json: {
        done: true,
        batch: { id: "batch-1", status: "completed", chunkCount: 1, vectorBytes: "6144", completedAt: null, idempotent: false },
        progress: { totalChunks: 1, readyChunks: 1, pendingChunks: 0, leasedChunks: 0, failedChunks: 0, lastErrorCode: null },
        providerCall: true
      } });
      return;
    }
    const reindexMatch = pathname.match(/^\/api\/kb\/bases\/([^/]+)\/reindex$/);
    if (request.method() === "POST" && reindexMatch) {
      const input = request.postDataJSON();
      const base = bases.get(reindexMatch[1]);
      const profile = profiles.find((item) => item.id === input.embeddingProfileId);
      base.embeddingProfile = {
        id: profile.id,
        vendor: profile.vendor,
        actualModel: profile.actualModel,
        dimensions: profile.dimensions,
        fingerprint: profile.fingerprint
      };
      base.pendingIndexVersion = (base.activeIndexVersion || 1) + 1;
      base.version += 1;
      base.embeddingProgress.pendingChunks = base.documentCount;
      base.embeddingProgress.readyChunks = 0;
      await route.fulfill({ status: 202, json: {
        accepted: true,
        reindex: {
          knowledgeBaseId: base.id,
          sourceIndexVersion: base.activeIndexVersion,
          pendingIndexVersion: base.pendingIndexVersion,
          embeddingProfileId: profile.id,
          totalChunks: base.documentCount,
          reservedBytes: "4096",
          cutover: false
        }
      } });
      return;
    }
    await route.fulfill({ status: 500, json: { error: { message: `unexpected ${request.method()} ${pathname}` } } });
  });

  return { calls, bases, documents };
}

test("knowledge workspace creates, uploads, indexes and starts a model rebuild", async ({ page }) => {
  const fixture = await installWorkspaceApi(page);
  await page.goto("/knowledge");
  await expect(page.getByRole("heading", { name: "Alice 的知识空间" })).toBeVisible();

  await page.getByRole("button", { name: "新建知识库" }).first().click();
  await page.getByRole("textbox", { name: "名称" }).fill("研发资料");
  await page.getByRole("textbox", { name: "描述" }).fill("研发规范与记录");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByRole("heading", { name: "研发资料" })).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles({
    name: "guide.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("knowledge workspace upload", "utf8")
  });
  await expect(page.getByText(/已进入解析/)).toBeVisible();
  await expect(page.getByText("等待向量连接", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "配置" }).first().click();
  await page.locator('.knowledge-cloud-connection-form input[type="password"]').fill("sk-workspace-session-only");
  await page.getByRole("button", { name: "保存到本次会话" }).click();
  await page.getByRole("button", { name: "继续索引" }).click();
  await expect(page.locator(".knowledge-document-status.ready", { hasText: "可检索" })).toBeVisible();

  await page.getByRole("button", { name: "切换向量模型" }).click();
  await page.getByRole("button", { name: "新向量模型", exact: true }).click();
  await page.getByRole("listbox", { name: "新向量模型", exact: true }).getByRole("option", { name: new RegExp(profiles[1].label || profiles[1].actualModel) }).click();
  await page.getByRole("button", { name: "开始重建" }).click();
  await expect(page.getByText("新索引构建中", { exact: true })).toBeVisible();
  const reindexNotice = page.getByRole("status").filter({
    hasText: "影子索引已创建，请配置对应连接后继续索引"
  });
  await expect(reindexNotice).toBeVisible();
  const noticeGeometry = await reindexNotice.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height, viewport: window.innerWidth };
  });
  expect(noticeGeometry.width).toBeGreaterThanOrEqual(Math.min(320, noticeGeometry.viewport - 32));
  expect(noticeGeometry.height).toBeLessThanOrEqual(96);
  expect(fixture.calls).toContain("PUT COS");
  expect(fixture.calls).toContain(`POST /api/kb/bases/${createdBaseId}/reindex`);

  const overflow = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth
  }));
  expect(overflow.document).toBeLessThanOrEqual(overflow.viewport);
});

test("failed local migration keeps the IndexedDB source and a resumable checkpoint", async ({ page }) => {
  await installWorkspaceApi(page, { failCosUpload: true });
  await page.goto("/knowledge");
  await expect(page.getByRole("heading", { name: "Alice 的知识空间" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => new Promise<boolean>((resolve, reject) => {
    const request = indexedDB.open("xi-ai-web-workspace", 3);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("meta", "readonly");
      const marker = tx.objectStore("meta").get("legacyMigrationV1");
      marker.onsuccess = () => resolve(marker.result?.value === true);
      marker.onerror = () => reject(marker.error);
      tx.oncomplete = () => db.close();
    };
  }))).toBe(true);
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("xi-ai-web-workspace", 3);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("knowledgeDocuments", "readwrite");
      tx.objectStore("knowledgeDocuments").put({
        id: "local-document-1",
        name: "本地手册.md",
        type: "text/markdown",
        size: 24,
        text: "# 本地手册\n\n必须保留的原文。",
        chunks: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      });
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
  }));
  await page.reload();
  await page.getByRole("button", { name: /迁移本地资料/ }).click();
  await page.getByRole("button", { name: "开始迁移" }).click();
  await expect(page.getByText("失败", { exact: true })).toBeVisible();

  const local = await readWorkspaceRecords<{ id: string }>(page, "knowledgeDocuments");
  const meta = await readWorkspaceRecords<{ key: string; value: unknown }>(page, "meta");
  expect(local.map((item) => item.id)).toContain("local-document-1");
  expect(meta.some((item) => item.key === "knowledgeCloudMigrationV1:fixture-account")).toBe(true);
  await expect(page.getByRole("button", { name: "删除已迁移本地副本" })).toHaveCount(0);
});
