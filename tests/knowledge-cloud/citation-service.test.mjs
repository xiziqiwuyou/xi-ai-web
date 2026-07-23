import assert from "node:assert/strict";
import test from "node:test";
import { createKnowledgeCitationService } from "../../server/knowledge-cloud/citations/service.mjs";
import { KNOWLEDGE_ERROR_CODES } from "../../server/knowledge-cloud/errors.mjs";

const accountId = "00000000-0000-4000-8000-000000000001";
const otherAccountId = "00000000-0000-4000-8000-000000000002";
const documentId = "00000000-0000-4000-8000-000000000101";
const chunkId = "00000000-0000-4000-8000-000000000201";

test("source opening reauthorizes each request and returns only a short-lived public projection", async () => {
  const repositoryCalls = [];
  const objectStoreCalls = [];
  const repositories = {
    retrieval: {
      async findAuthorizedSource(ownerId, requestedDocumentId, requestedChunkId) {
        repositoryCalls.push({ ownerId, requestedDocumentId, requestedChunkId });
        if (ownerId !== accountId) return null;
        return {
          accountId,
          knowledgeBaseId: "base-1",
          knowledgeBaseName: "产品资料",
          documentId,
          documentName: "guide.txt",
          objectKey: "knowledge/account/base/document/source/opaque",
          objectVersionId: "version-1",
          chunkId,
          locator: { kind: "text", startLine: 1, endLine: 4 }
        };
      }
    }
  };
  const objectStore = {
    async createSourceDownloadUrl(input) {
      objectStoreCalls.push(input);
      return {
        url: "https://bucket.example/source?q-signature=temporary",
        expiresAt: "2026-07-22T00:02:00.000Z",
        expiresInSeconds: input.expiresSeconds
      };
    }
  };
  const service = createKnowledgeCitationService({ repositories, objectStore, sourceUrlTtlSeconds: 120 });
  const first = await service.openSource(accountId, documentId, { chunkId, disposition: "inline" });
  const second = await service.openSource(accountId, documentId, { chunkId, disposition: "attachment" });
  assert.equal(repositoryCalls.length, 2, "every signed URL must reauthorize against PostgreSQL");
  assert.equal(objectStoreCalls.length, 2);
  assert.equal(objectStoreCalls[0].expiresSeconds, 120);
  assert.equal(objectStoreCalls[0].disposition, "inline");
  assert.equal(objectStoreCalls[1].disposition, "attachment");
  assert.equal(objectStoreCalls[1].downloadName, "guide.txt");
  assert.equal(first.source.expiresInSeconds, 120);
  assert.equal(second.source.disposition, "attachment");
  assert.equal(first.source.documentId, documentId);
  assert.equal("objectKey" in first.source, false);

  await assert.rejects(
    service.openSource(accountId, documentId, {}),
    (error) => error.code === KNOWLEDGE_ERROR_CODES.INVALID_REQUEST
  );

  await assert.rejects(
    service.openSource(otherAccountId, documentId, { chunkId, disposition: "inline" }),
    (error) => error.code === KNOWLEDGE_ERROR_CODES.DOCUMENT_NOT_FOUND
  );
  assert.equal(objectStoreCalls.length, 2, "cross-account sources must fail before COS signing");
});
