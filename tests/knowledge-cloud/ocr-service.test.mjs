import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import test from "node:test";
import { createKnowledgeOcrService } from "../../server/knowledge-cloud/ocr/service.mjs";

const accountId = "11111111-1111-4111-8111-111111111111";
const baseId = "22222222-2222-4222-8222-222222222222";
const documentId = "33333333-3333-4333-8333-333333333333";
const jobId = "44444444-4444-4444-8444-444444444444";
const workerId = "worker:test";

test("OCR downloads the owned COS source, stores normalized text and queues the existing parser", async () => {
  const source = Buffer.from("scanned pdf", "utf8");
  const state = {
    job: {
      id: jobId,
      accountId,
      knowledgeBaseId: baseId,
      documentId,
      kind: "ocr",
      status: "running",
      leaseOwner: workerId
    },
    ocrStatus: "queued",
    uploaded: null,
    parseJob: null,
    providerInput: null
  };
  const jobs = {
    async findOcrContext() {
      return {
        accountId,
        knowledgeBaseId: baseId,
        documentId,
        displayName: "scan.pdf",
        declaredMimeType: "application/pdf",
        verifiedMimeType: "application/pdf",
        verifiedBytes: String(source.byteLength),
        checksumSha256: crypto.createHash("sha256").update(source).digest("hex"),
        objectKey: `knowledge/${accountId}/${baseId}/${documentId}/source/original`,
        objectVersionId: "cos-version-1",
        documentStatus: "needs_ocr",
        ocrStatus: state.ocrStatus,
        baseStatus: "active"
      };
    },
    async findJob() {
      return structuredClone(state.job);
    },
    async markDocumentOcrRunning() {
      state.ocrStatus = "running";
      return documentId;
    },
    async markDocumentOcrReady(input) {
      state.ocrStatus = "ready";
      state.ocrReady = structuredClone(input);
      return documentId;
    },
    async enqueueJob(input) {
      state.parseJob = structuredClone(input);
      return { ...input, status: "queued" };
    },
    async completeOwnedJob(_id, owner) {
      if (owner !== workerId) return null;
      state.job.status = "succeeded";
      state.job.leaseOwner = null;
      return structuredClone(state.job);
    }
  };
  const repositories = {
    jobs,
    async transaction(work) {
      return work({ jobs });
    }
  };
  const objectStore = {
    async downloadObjectToFile(input) {
      assert.equal(input.objectKey.endsWith("/source/original"), true);
      assert.equal(input.versionId, "cos-version-1");
      await fs.writeFile(input.destinationPath, source, { flag: "wx", mode: 0o600 });
      return {
        bytes: source.byteLength,
        checksumSha256: crypto.createHash("sha256").update(source).digest("hex")
      };
    },
    async putObjectFromFile(input) {
      state.uploaded = {
        ...input,
        text: await fs.readFile(input.filePath, "utf8")
      };
      return { objectKey: input.objectKey };
    },
    async deleteObject() {
      throw new Error("successful OCR must not compensate its output");
    }
  };
  const provider = {
    enabled: true,
    id: "http-json-v1",
    async recognize(input) {
      state.providerInput = { ...input };
      return { text: "recognized page one", bytes: 19, provider: "http-json-v1", durationMs: 42 };
    }
  };
  const service = createKnowledgeOcrService({ repositories, objectStore, provider });
  const result = await service.executeOcrJob(structuredClone(state.job), {
    workerId,
    reportProgress: async () => {}
  });
  assert.equal(result.status, "ready");
  assert.equal(state.ocrStatus, "ready");
  assert.equal(state.uploaded.text, "recognized page one");
  assert.match(state.uploaded.objectKey, /\/ocr\/v1-job-/u);
  assert.equal(state.parseJob.kind, "parse");
  assert.equal(state.parseJob.dedupeKey, `document-parse:${documentId}`);
  assert.equal(state.job.status, "succeeded");
  assert.equal("apiKey" in state.providerInput, false);
  assert.equal("objectKey" in state.providerInput, false);
});
