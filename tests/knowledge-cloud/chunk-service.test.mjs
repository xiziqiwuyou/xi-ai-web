import assert from "node:assert/strict";
import test from "node:test";
import { createKnowledgeLibraryService } from "../../server/knowledge-cloud/library/service.mjs";

const accountId = "11111111-1111-4111-8111-111111111111";
const otherAccountId = "22222222-2222-4222-8222-222222222222";
const baseId = "33333333-3333-4333-8333-333333333333";
const documentId = "44444444-4444-4444-8444-444444444444";
const chunkId = "55555555-5555-4555-8555-555555555555";

function createHarness() {
  const active = {
    id: chunkId,
    accountId,
    knowledgeBaseId: baseId,
    documentId,
    sourceIndexVersionId: "66666666-6666-4666-8666-666666666666",
    documentName: "guide.txt",
    ordinal: 0,
    text: "First paragraph.\n\nSecond paragraph.",
    textBytes: "35",
    tokenEstimate: 9,
    locator: { type: "text_lines", startLine: 1, endLine: 3 },
    enabled: true,
    revision: 1,
    draft: false,
    embeddingStatus: "ready",
    strategyId: "balanced",
    pendingIndexVersion: null,
    activeChunkBytes: "35",
    activeVectorBytes: "4096",
    draftChunkBytes: "0",
    createdAt: "2026-08-14T00:00:00.000Z",
    updatedAt: "2026-08-14T00:00:00.000Z"
  };
  const revisions = [];
  const calls = [];
  const currentChunk = () => {
    const latest = revisions.at(-1);
    if (!latest) return structuredClone(active);
    return {
      ...structuredClone(active),
      text: latest.text,
      textBytes: String(latest.textBytes),
      tokenEstimate: latest.tokenEstimate,
      enabled: latest.enabled,
      revision: latest.revision,
      draft: true,
      draftChunkBytes: String(latest.textBytes),
      createdAt: "2026-08-14T00:01:00.000Z"
    };
  };
  const library = {
    async findDocument(ownerId, id) {
      calls.push(["findDocument", ownerId, id]);
      return ownerId === accountId && id === documentId
        ? { id: documentId, accountId, knowledgeBaseId: baseId, status: "ready" }
        : null;
    },
    async findBase(ownerId, id) {
      return ownerId === accountId && id === baseId ? { id: baseId, accountId, status: "active" } : null;
    },
    async listDocumentChunks(ownerId, id) {
      calls.push(["listDocumentChunks", ownerId, id]);
      return ownerId === accountId && id === documentId ? [currentChunk()] : [];
    },
    async documentChunkCapacity() {
      return { sourceBytes: "100", normalizedBytes: "80", activeChunkBytes: "35", activeVectorBytes: "4096", draftChunkBytes: revisions.length ? String(revisions.at(-1).textBytes) : "0" };
    },
    async listActiveChunkText(ownerId, id) {
      return ownerId === accountId && id === documentId ? [currentChunk()] : [];
    },
    async findActiveChunk(ownerId, id) {
      calls.push(["findActiveChunk", ownerId, id]);
      return ownerId === accountId && id === chunkId ? currentChunk() : null;
    },
    async insertChunkRevision(revision) {
      revisions.push(structuredClone(revision));
      return revision.id;
    },
    async hasChunkDrafts(ownerId, id) {
      return ownerId === accountId && id === baseId && revisions.length > 0;
    }
  };
  const context = { library };
  const repositories = {
    library,
    quota: {},
    admin: {},
    transaction: (work) => work(context)
  };
  const service = createKnowledgeLibraryService({
    repositories,
    quotaService: {
      async lockContext(_transaction, ownerId) {
        calls.push(["lockContext", ownerId]);
        return { account: { id: ownerId } };
      }
    },
    objectStore: { createUploadGrant() {}, headObject() {}, deleteObject() {} },
    cryptoModule: { randomUUID: () => `77777777-7777-4777-8777-${String(revisions.length + 1).padStart(12, "0")}` }
  });
  return { active, revisions, calls, service };
}

test("owner chunk reads expose capacity and bounded strategy previews", async () => {
  const harness = createHarness();
  const page = await harness.service.listDocumentChunks(accountId, documentId, { limit: 20 });
  assert.equal(page.items[0].text, harness.active.text);
  assert.equal(page.capacity.activeVectorBytes, "4096");

  const preview = await harness.service.previewDocumentChunks(accountId, documentId, {
    chunkStrategyId: "compact"
  });
  assert.equal(preview.strategy.id, "compact");
  assert.equal(preview.items.length, 1);
  assert.equal(preview.items[0].locator.type, "strategy_preview");

  await assert.rejects(
    harness.service.listDocumentChunks(otherAccountId, documentId),
    (error) => error.code === "KB_DOCUMENT_NOT_FOUND"
  );
});

test("edit and disable append revisions while the active chunk stays unchanged", async () => {
  const harness = createHarness();
  const edited = await harness.service.reviseChunk(accountId, chunkId, {
    expectedRevision: 1,
    text: "Edited owner draft.",
    enabled: false
  });
  assert.equal(edited.chunk.revision, 2);
  assert.equal(edited.chunk.enabled, false);
  assert.equal(edited.activeIndexUnchanged, true);
  assert.equal(edited.shadowReindexRequired, true);
  assert.equal(harness.active.text, "First paragraph.\n\nSecond paragraph.");
  assert.equal(harness.revisions.length, 1);

  await assert.rejects(
    harness.service.reviseChunk(accountId, chunkId, { expectedRevision: 1, enabled: true }),
    (error) => error.code === "KB_VERSION_CONFLICT"
  );
  assert.deepEqual(
    await harness.service.assertChunkDraftReindexAllowed(accountId, baseId),
    { allowed: true, chunkDraftsPending: true }
  );

  harness.active.pendingIndexVersion = 2;
  await assert.rejects(
    harness.service.reviseChunk(accountId, chunkId, { expectedRevision: 2, enabled: true }),
    (error) => error.code === "KB_REINDEX_IN_PROGRESS"
  );
});
