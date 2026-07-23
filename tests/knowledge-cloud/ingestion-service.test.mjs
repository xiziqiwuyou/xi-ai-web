import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import test from "node:test";
import { createKnowledgeIngestionService } from "../../server/knowledge-cloud/jobs/ingestion-service.mjs";

const accountId = "11111111-1111-4111-8111-111111111111";
const baseId = "22222222-2222-4222-8222-222222222222";
const documentId = "33333333-3333-4333-8333-333333333333";
const indexVersionId = "44444444-4444-4444-8444-444444444444";
const jobId = "55555555-5555-4555-8555-555555555555";
const workerId = "worker:test";

function settings() {
  return {
    defaultQuotaBytes: 10_000_000,
    maxKnowledgeBasesPerAccount: 20,
    maxDocumentsPerAccount: 1000,
    maxDocumentsPerKnowledgeBase: 500,
    maxFileBytes: 2_000_000,
    maxChunksPerAccount: 1000,
    maxConcurrentUploadsPerAccount: 3,
    maxConcurrentIngestionsPerAccount: 2,
    maxConcurrentEmbeddingsPerAccount: 2,
    retrievalRequestsPerMinutePerAccount: 60,
    maxRetrievalTopK: 20
  };
}

function harness({ needsOcr = false } = {}) {
  const source = Buffer.from("source document", "utf8");
  const state = {
    account: {
      id: accountId,
      status: "active",
      quotaBytes: "10000000",
      usedBytes: "15",
      reservedBytes: "0",
      limitOverrides: {},
      knowledgeBaseCount: 1,
      documentCount: 1,
      chunkCount: 0,
      activeUploadCount: 0
    },
    document: {
      status: "uploaded",
      parserVersion: null,
      normalizedObjectKey: null,
      normalizedBytes: null,
      errorCode: null
    },
    job: {
      id: jobId,
      accountId,
      knowledgeBaseId: baseId,
      documentId,
      kind: "parse",
      status: "running",
      attempts: 1,
      maxAttempts: 5,
      leaseOwner: workerId,
      progressCurrent: 0,
      progressTotal: 0,
      errorCode: null,
      errorDetail: null
    },
    chunks: [],
    ledger: [],
    uploads: [],
    deletes: []
  };

  const jobs = {
    async findParseContext() {
      return {
        accountId,
        knowledgeBaseId: baseId,
        documentId,
        displayName: "guide.txt",
        declaredMimeType: "text/plain",
        verifiedMimeType: "text/plain",
        verifiedBytes: String(source.byteLength),
        checksumSha256: crypto.createHash("sha256").update(source).digest("hex"),
        objectKey: `knowledge/${accountId}/${baseId}/${documentId}/source/file`,
        objectVersionId: "version-1",
        documentStatus: state.document.status,
        documentVersion: 2,
        baseStatus: "active",
        indexVersionId,
        indexVersion: 1,
        chunkVersion: 1
      };
    },
    async findJob() {
      return structuredClone(state.job);
    },
    async markDocumentParsing() {
      if (!["uploaded", "parsing"].includes(state.document.status)) return null;
      state.document.status = "parsing";
      return documentId;
    },
    async countDocumentChunks() {
      return state.chunks.length;
    },
    async deleteDocumentChunks() {
      const count = state.chunks.length;
      state.chunks = [];
      state.account.chunkCount = 0;
      return count;
    },
    async insertChunks(input) {
      state.chunks = structuredClone(input.chunks);
      state.account.chunkCount = state.chunks.length;
      return state.chunks.length;
    },
    async completeParsedDocument(input) {
      if (state.document.status !== "parsing") return null;
      Object.assign(state.document, {
        status: "awaiting_embedding",
        parserVersion: input.parserVersion,
        normalizedObjectKey: input.normalizedObjectKey,
        normalizedBytes: input.normalizedBytes,
        errorCode: null
      });
      return documentId;
    },
    async markDocumentNeedsOcr(_ownerId, _documentId, parserVersion) {
      if (state.document.status !== "parsing") return null;
      Object.assign(state.document, { status: "needs_ocr", parserVersion });
      return documentId;
    },
    async refreshIndexLogicalBytes() {
      return state.chunks.reduce((sum, chunk) => sum + BigInt(chunk.text_bytes), 0n).toString();
    },
    async completeOwnedJob(_jobId, owner, progress) {
      if (state.job.status !== "running" || state.job.leaseOwner !== owner) return null;
      Object.assign(state.job, {
        status: "succeeded",
        leaseOwner: null,
        progressCurrent: progress.current,
        progressTotal: progress.total
      });
      return structuredClone(state.job);
    }
  };

  const quota = {
    async lockAccountCapacity() {
      return structuredClone({ ...state.account, chunkCount: state.chunks.length });
    },
    async reservationState(ownerId, reservationKey, component) {
      const entries = state.ledger.filter((entry) =>
        entry.accountId === ownerId && entry.reservationKey === reservationKey && entry.component === component
      );
      return {
        entryCount: entries.length,
        reservedBytes: entries.reduce((sum, entry) => sum + BigInt(entry.reservedDeltaBytes), 0n).toString(),
        usedBytes: entries.reduce((sum, entry) => sum + BigInt(entry.usedDeltaBytes), 0n).toString()
      };
    },
    async insertLedgerEntry(entry) {
      state.ledger.push(structuredClone(entry));
      return entry.id;
    },
    async adjustAccountUsage(_ownerId, delta) {
      state.account.reservedBytes = (
        BigInt(state.account.reservedBytes) + BigInt(delta.reservedDeltaBytes || 0)
      ).toString();
      state.account.usedBytes = (
        BigInt(state.account.usedBytes) + BigInt(delta.usedDeltaBytes || 0)
      ).toString();
      return {
        quotaBytes: state.account.quotaBytes,
        usedBytes: state.account.usedBytes,
        reservedBytes: state.account.reservedBytes
      };
    }
  };
  const admin = { async getRuntimeSettings() { return settings(); } };
  const repositories = {
    jobs,
    quota,
    admin,
    async transaction(work) {
      return work({ jobs, quota, admin });
    }
  };
  const objectStore = {
    async downloadObjectToFile({ destinationPath }) {
      await fs.writeFile(destinationPath, source, { flag: "wx", mode: 0o600 });
      return {
        bytes: source.byteLength,
        checksumSha256: crypto.createHash("sha256").update(source).digest("hex")
      };
    },
    async putObjectFromFile(input) {
      state.uploads.push({ ...input, content: await fs.readFile(input.filePath, "utf8") });
      return { objectKey: input.objectKey, bytes: input.bytes };
    },
    async deleteObject(input) {
      state.deletes.push(structuredClone(input));
      return { deleted: true };
    }
  };
  const parser = async () => needsOcr
    ? { parserVersion: "knowledge-parser/1", mimeType: "application/pdf", blocks: [], needsOcr: true }
    : {
        parserVersion: "knowledge-parser/1",
        mimeType: "text/plain",
        needsOcr: false,
        blocks: [{ text: "Useful body", locator: { type: "text_lines", lineStart: 1, lineEnd: 1 } }]
      };
  const service = createKnowledgeIngestionService({ repositories, objectStore, parser });
  return { service, state };
}

test("parse ingestion persists locators and settles normalized/chunk bytes exactly once", async () => {
  const { service, state } = harness();
  const result = await service.executeParseJob(structuredClone(state.job), {
    workerId,
    reportProgress: async () => {}
  });
  assert.equal(result.status, "awaiting_embedding");
  assert.equal(state.document.status, "awaiting_embedding");
  assert.equal(state.job.status, "succeeded");
  assert.equal(state.chunks.length, 1);
  assert.deepEqual(state.chunks[0].source_locator, {
    type: "text_lines",
    lineStart: 1,
    lineEnd: 1
  });
  assert.equal(state.uploads.length, 1);
  assert.match(state.uploads[0].content, /xi-ai-normalized-document\/v1/);
  assert.equal(state.account.reservedBytes, "0");
  assert.ok(BigInt(state.account.usedBytes) > 15n);
  assert.equal(state.ledger.filter((entry) => entry.entryType === "reserve").length, 2);
  assert.equal(state.ledger.filter((entry) => entry.entryType === "settle").length, 2);

  const usedAfterSuccess = state.account.usedBytes;
  const chunksAfterSuccess = structuredClone(state.chunks);
  state.job.status = "running";
  state.job.leaseOwner = workerId;
  state.job.attempts = 2;
  await assert.rejects(
    service.executeParseJob(structuredClone(state.job), { workerId, reportProgress: async () => {} }),
    (error) => error.code === "KB_JOB_STATE_INVALID"
  );
  assert.equal(state.account.usedBytes, usedAfterSuccess);
  assert.deepEqual(state.chunks, chunksAfterSuccess);
});

test("image-only parsing enters needs_ocr without chunks, normalized objects or extra quota", async () => {
  const { service, state } = harness({ needsOcr: true });
  const result = await service.executeParseJob(structuredClone(state.job), {
    workerId,
    reportProgress: async () => {}
  });
  assert.equal(result.status, "needs_ocr");
  assert.equal(state.document.status, "needs_ocr");
  assert.equal(state.job.status, "succeeded");
  assert.deepEqual(state.chunks, []);
  assert.deepEqual(state.uploads, []);
  assert.deepEqual(state.ledger, []);
  assert.equal(state.account.usedBytes, "15");
});
