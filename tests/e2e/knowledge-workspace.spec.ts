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
  authenticated?: boolean;
  failCosUpload?: boolean;
  seedReadyDocument?: boolean;
};

async function installWorkspaceApi(page: import("@playwright/test").Page, options: FixtureOptions = {}) {
  const calls: string[] = [];
  const retrievalRequests: Array<Record<string, any>> = [];
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
  const chunks = new Map<string, any[]>();

  if (options.seedReadyDocument) {
    const base = bases.get(baseId);
    base.activeIndexVersion = 1;
    base.pendingIndexVersion = null;
    documents.set(baseId, [{
      id: documentId,
      knowledgeBaseId: baseId,
      displayName: "已索引手册.txt",
      declaredMimeType: "text/plain",
      verifiedMimeType: "text/plain",
      declaredBytes: "128",
      verifiedBytes: "128",
      declaredChecksumSha256: null,
      checksumSha256: "a".repeat(64),
      objectVersionId: "source-v1",
      objectEtag: "etag-v1",
      uploadExpiresAt: null,
      status: "ready",
      parserVersion: "fixture-v1",
      errorCode: null,
      version: 2,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:01:00.000Z"
    }]);
    chunks.set(documentId, [{
      id: "99999999-9999-4999-8999-999999999999",
      documentId,
      documentName: "已索引手册.txt",
      ordinal: 0,
      text: "活动索引中的原始分块文本。",
      textBytes: "39",
      tokenEstimate: 7,
      locator: { type: "text_lines", startLine: 1, endLine: 2 },
      enabled: true,
      revision: 1,
      draft: false,
      embeddingStatus: "ready",
      strategyId: "balanced",
      capacity: { activeChunkBytes: "39", activeVectorBytes: "6144", draftChunkBytes: "0" },
      createdAt: "2026-01-01T00:01:00.000Z",
      updatedAt: "2026-01-01T00:01:00.000Z"
    }]);
  }

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
      await route.fulfill({ json: options.authenticated === false
        ? { authenticated: false }
        : {
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
    if (request.method() === "GET" && pathname === "/api/kb/chunk-strategy-presets") {
      await route.fulfill({ json: { items: [
        { id: "compact", label: "紧凑", maxCharacters: 900, overlapCharacters: 80 },
        { id: "balanced", label: "均衡", maxCharacters: 1400, overlapCharacters: 160 },
        { id: "context_rich", label: "长上下文", maxCharacters: 2200, overlapCharacters: 240 }
      ] } });
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
    if (request.method() === "POST" && pathname === "/api/kb/retrieval") {
      expect(request.headers()["x-knowledge-csrf"]).toBe("workspace-csrf");
      const input = request.postDataJSON() as Record<string, any>;
      retrievalRequests.push(input);
      const noResult = input.query === "无匹配查询";
      const selectedChunkId = "99999999-9999-4999-8999-999999999999";
      const makeCandidate = (
        suffix: string,
        selected: boolean,
        filteredReason: string | null,
        vectorRank: number | null,
        fulltextRank: number | null
      ) => ({
        knowledgeBaseId: baseId,
        documentId,
        chunkId: selected ? selectedChunkId : `${suffix.repeat(8)}-${suffix.repeat(4)}-4${suffix.repeat(3)}-8${suffix.repeat(3)}-${suffix.repeat(12)}`,
        ranks: { vector: vectorRank, fulltext: fulltextRank },
        scores: {
          vector: vectorRank === null ? null : 0.93 - (vectorRank * 0.03),
          fulltext: fulltextRank === null ? null : 0.88 - (fulltextRank * 0.02),
          relevance: selected ? 0.91 : 0.61,
          rrf: 0.032 / Math.max(1, vectorRank || fulltextRank || 1)
        },
        selected,
        filteredReason,
        citationId: selected ? "C1" : null
      });
      const citation = {
        id: "C1",
        knowledgeBaseId: baseId,
        knowledgeBaseName: "产品资料",
        documentId,
        documentName: "已索引手册.txt",
        chunkId: selectedChunkId,
        chunkOrdinal: 0,
        locator: { type: "text_lines", startLine: 1, endLine: 2 },
        score: 0.91,
        relevance: 0.91,
        mode: input.mode,
        source: {
          method: "GET",
          openPath: `/api/kb/sources/${documentId}/${selectedChunkId}`
        }
      };
      const candidates = noResult ? [] : [
        makeCandidate("9", true, null, 1, 2),
        makeCandidate("1", false, "minimum_relevance", 8, 7),
        makeCandidate("2", false, "adjacent_chunk", 2, 3),
        makeCandidate("3", false, "top_k", 4, 1),
        makeCandidate("4", false, "token_budget", 3, 4)
      ];
      const profilesTrace = input.mode === "fulltext" ? [] : [{
        fingerprint: profiles[0].fingerprint,
        dimensions: profiles[0].dimensions,
        indexVersions: [1],
        knowledgeBaseIds: [baseId]
      }];
      await route.fulfill({ json: {
        mode: input.mode,
        knowledgeBaseIds: input.knowledgeBaseIds,
        topK: input.topK,
        candidateCount: input.candidateCount,
        minimumRelevance: input.minimumRelevance,
        maxTopK: 20,
        queryBytes: Buffer.byteLength(input.query, "utf8"),
        context: noResult ? "" : "[C1] 产品发布前需要完成回归测试。",
        contextBytes: noResult ? 0 : 52,
        contextTokens: noResult ? 0 : 14,
        contextTokenBudget: input.contextTokenBudget,
        contextTruncated: false,
        chunks: noResult ? [] : [{
          citationId: "C1",
          knowledgeBaseId: baseId,
          documentId,
          chunkId: selectedChunkId,
          ordinal: 0,
          text: "产品发布前需要完成回归测试。",
          tokenEstimate: 14,
          score: 0.91,
          relevance: 0.91,
          mode: input.mode
        }],
        citations: noResult ? [] : [citation],
        profileGroups: input.mode === "fulltext" ? [] : [{
          embeddingProfileId: profiles[0].id,
          vendor: profiles[0].vendor,
          actualModel: profiles[0].actualModel,
          dimensions: profiles[0].dimensions,
          indexVersions: [1],
          knowledgeBaseIds: [baseId]
        }],
        trace: {
          originalQuery: input.query,
          effectiveQuery: noResult ? input.query : `${input.query} 发布计划`,
          mode: input.mode,
          options: {
            candidateCount: input.candidateCount,
            minimumRelevance: input.minimumRelevance,
            contextTokenBudget: input.contextTokenBudget,
            queryRewrite: { enabled: true },
            rerank: { enabled: true, allowFallback: true }
          },
          stages: {
            preflight: { durationMs: 1.25, baseCount: 1 },
            embedding: { durationMs: input.mode === "fulltext" ? 0 : 4.5, groupCount: input.mode === "fulltext" ? 0 : 1 },
            recall: { durationMs: 8.75, vectorCandidates: input.mode === "fulltext" ? 0 : 9, fullTextCandidates: input.mode === "vector" ? 0 : 8 },
            filter: { fusedCandidates: candidates.length, belowMinimumRelevance: noResult ? 0 : 1, adjacentSuppressed: noResult ? 0 : 1 },
            context: { selectedCandidates: noResult ? 0 : 1, contextTokens: noResult ? 0 : 14, tokenBudget: input.contextTokenBudget, truncated: false }
          },
          candidates,
          profiles: profilesTrace,
          timing: { totalMs: 19.4 }
        },
        requestId: "retrieval-fixture"
      } });
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
    const chunkListMatch = pathname.match(/^\/api\/kb\/documents\/([^/]+)\/chunks$/);
    if (request.method() === "GET" && chunkListMatch) {
      const items = chunks.get(chunkListMatch[1]) || [];
      await route.fulfill({ json: {
        items,
        nextCursor: null,
        capacity: {
          sourceBytes: "128",
          normalizedBytes: "96",
          activeChunkBytes: "39",
          activeVectorBytes: "6144",
          draftChunkBytes: items.some((item) => item.draft) ? items[0].textBytes : "0"
        }
      } });
      return;
    }
    const chunkPreviewMatch = pathname.match(/^\/api\/kb\/documents\/([^/]+)\/chunks\/preview$/);
    if (request.method() === "POST" && chunkPreviewMatch) {
      const input = request.postDataJSON();
      await route.fulfill({ json: {
        strategy: { id: input.chunkStrategyId, label: "紧凑", maxCharacters: 900, overlapCharacters: 80 },
        sourceCharacters: 15,
        sourceBytes: "39",
        sourceTruncated: false,
        totalChunks: 1,
        items: [{ ordinal: 0, text: "活动索引中的原始分块文本。", textBytes: "39", tokenEstimate: 7, locator: { type: "strategy_preview", characterStart: 0, characterEnd: 15 } }],
        previewTruncated: false
      } });
      return;
    }
    const chunkRevisionMatch = pathname.match(/^\/api\/kb\/chunks\/([^/]+)$/);
    if (request.method() === "PATCH" && chunkRevisionMatch) {
      const input = request.postDataJSON();
      const item = [...chunks.values()].flat().find((chunk) => chunk.id === chunkRevisionMatch[1]);
      Object.assign(item, {
        text: input.text,
        textBytes: String(Buffer.byteLength(input.text, "utf8")),
        tokenEstimate: Math.ceil([...input.text].length / 4),
        enabled: input.enabled,
        revision: item.revision + 1,
        draft: true,
        capacity: { ...item.capacity, draftChunkBytes: String(Buffer.byteLength(input.text, "utf8")) }
      });
      await route.fulfill({ json: { chunk: item, activeIndexUnchanged: true, shadowReindexRequired: true } });
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

  return { calls, bases, documents, retrievalRequests };
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
    const request = indexedDB.open("xi-ai-web-workspace");
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
    const request = indexedDB.open("xi-ai-web-workspace");
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

test("owners preview, edit and disable chunk drafts without changing the active index", async ({ page }) => {
  const fixture = await installWorkspaceApi(page, { seedReadyDocument: true });
  await page.goto("/knowledge");
  await page.getByRole("button", { name: "查看 已索引手册.txt 分块" }).click();
  await expect(page.getByRole("heading", { name: "已索引手册.txt" })).toBeVisible();
  await expect(page.getByText("6.0 KB", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /紧凑/ }).click();
  await page.getByRole("button", { name: "预览" }).click();
  await expect(page.getByText("1 个预览分块")).toBeVisible();

  await page.getByRole("textbox", { name: "分块文本" }).fill("仅存在于草稿修订中的文本。");
  await page.getByRole("checkbox", { name: "启用分块" }).uncheck();
  await page.getByRole("button", { name: "保存草稿" }).click();
  await expect(page.getByRole("status").filter({ hasText: "活动索引未变更" })).toBeVisible();
  await expect(page.getByText("已停用 · 草稿")).toBeVisible();
  expect(fixture.calls).toContain("PATCH /api/kb/chunks/99999999-9999-4999-8999-999999999999");

  const overflow = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth
  }));
  expect(overflow.document).toBeLessThanOrEqual(overflow.viewport);
});

test("retrieval lab stays behind the owner session", async ({ page }) => {
  await installWorkspaceApi(page, { authenticated: false, seedReadyDocument: true });
  await page.goto("/knowledge");

  await expect(page.getByRole("heading", { name: "登录知识库" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "检索实验室" })).toHaveCount(0);
});

test("retrieval lab sends request-only traced parameters and renders desktop or mobile diagnostics", async ({ page }, testInfo) => {
  const fixture = await installWorkspaceApi(page, { seedReadyDocument: true });
  await page.goto("/knowledge");
  await expect(page.getByRole("heading", { name: "检索实验室" })).toBeVisible();
  await expect(page.getByRole("button", { name: "向量", exact: true })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "配置" }).first().click();
  await page.locator('.knowledge-cloud-connection-form input[type="password"]').fill("sk-retrieval-session-only");
  await page.getByRole("button", { name: "保存到本次会话" }).click();
  const sessionBefore = await page.evaluate(() => ({ ...sessionStorage }));

  const hybridMode = page.getByRole("button", { name: "混合", exact: true });
  await hybridMode.focus();
  await page.keyboard.press("Space");
  await expect(hybridMode).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("spinbutton", { name: "Top K" }).fill("4");
  await page.getByRole("spinbutton", { name: "候选数" }).fill("17");
  await page.getByRole("spinbutton", { name: "最低相关度" }).fill("0.65");
  await page.getByRole("spinbutton", { name: "Token 预算" }).fill("1536");
  await page.getByRole("textbox", { name: "测试查询" }).fill("发布节奏");
  const run = page.getByRole("button", { name: "运行检索" });
  await run.focus();
  await page.keyboard.press("Enter");

  await expect.poll(() => fixture.retrievalRequests.length).toBe(1);
  expect(fixture.retrievalRequests[0]).toEqual({
    query: "发布节奏",
    knowledgeBaseIds: [baseId],
    embeddingConnections: { openai: { apiKey: "sk-retrieval-session-only" } },
    mode: "hybrid",
    topK: 4,
    candidateCount: 17,
    minimumRelevance: 0.65,
    contextTokenBudget: 1536,
    trace: true
  });
  const summary = page.getByLabel("检索摘要");
  await expect(summary.getByText("发布节奏", { exact: true })).toBeVisible();
  await expect(summary.getByText("发布节奏 发布计划", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "阶段追踪" })).toBeVisible();
  await expect(page.getByText("向量 9 · 全文 8", { exact: true })).toBeVisible();
  await expect(page.locator(".knowledge-retrieval-candidates li.selected")).toContainText("向量排名");
  await expect(page.locator(".knowledge-retrieval-candidates li.selected")).toContainText("全文排名");
  for (const reason of ["低于相关度", "相邻分块抑制", "超出 Top K", "超出 Token 预算"]) {
    await expect(page.getByText(reason, { exact: true })).toBeVisible();
  }
  await expect(page.getByText("[C1] 已索引手册.txt", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(profiles[0].fingerprint, { exact: true })).toBeVisible();
  await expect(page.getByText("19.4 ms", { exact: true })).toBeVisible();
  expect(await page.locator("body").innerText()).not.toContain("sk-retrieval-session-only");

  const fulltextMode = page.getByRole("button", { name: "全文", exact: true });
  await fulltextMode.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("textbox", { name: "测试查询" }).fill("无匹配查询");
  await page.getByRole("button", { name: "运行检索" }).focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => fixture.retrievalRequests.length).toBe(2);
  expect(fixture.retrievalRequests[1]).toMatchObject({
    query: "无匹配查询",
    mode: "fulltext",
    trace: true
  });
  expect(fixture.retrievalRequests[1]).not.toHaveProperty("embeddingConnections");
  await expect(page.getByText("未检索到可靠结果", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => ({ ...sessionStorage }))).toEqual(sessionBefore);

  const layout = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    controls: [...document.querySelectorAll<HTMLElement>([
      ".knowledge-retrieval-bases label",
      ".knowledge-retrieval-modes button",
      ".knowledge-retrieval-parameters input",
      ".knowledge-retrieval-query textarea",
      ".knowledge-retrieval-actions button"
    ].join(","))].filter((element) => element.offsetParent !== null).map((element) => ({
      height: element.getBoundingClientRect().height,
      width: element.getBoundingClientRect().width
    }))
  }));
  expect(layout.document).toBeLessThanOrEqual(layout.viewport);
  expect(layout.controls.every((control) => control.width > 0)).toBe(true);
  if (testInfo.project.name.startsWith("mobile")) {
    expect(layout.controls.every((control) => control.height >= 44)).toBe(true);
  }
});
