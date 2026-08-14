import assert from "node:assert/strict";
import test from "node:test";
import { KnowledgeError } from "../../server/knowledge-cloud/errors.mjs";
import { createKnowledgeJobWorker } from "../../server/knowledge-cloud/jobs/worker-runtime.mjs";

test("OCR retries synchronize document state and end in a stable failure", async () => {
  const state = {
    documentStatus: "needs_ocr",
    ocrStatus: "queued",
    job: {
      id: "11111111-1111-4111-8111-111111111111",
      accountId: "22222222-2222-4222-8222-222222222222",
      knowledgeBaseId: "33333333-3333-4333-8333-333333333333",
      documentId: "44444444-4444-4444-8444-444444444444",
      kind: "ocr",
      status: "queued",
      attempts: 0,
      maxAttempts: 2,
      leaseOwner: null
    }
  };
  const jobs = {
    async expireExhaustedLeases() { return []; },
    async claimNext({ workerId, kinds }) {
      assert(kinds.includes("ocr"));
      if (!new Set(["queued", "retry"]).has(state.job.status)) return null;
      state.job.status = "running";
      state.job.leaseOwner = workerId;
      state.job.attempts += 1;
      state.ocrStatus = "running";
      return structuredClone(state.job);
    },
    async heartbeat() { return structuredClone(state.job); },
    async findJob() { return structuredClone(state.job); },
    async failOwnedJob(input) {
      const retry = input.retryable && state.job.attempts < state.job.maxAttempts;
      state.job.status = retry ? "retry" : "failed";
      state.job.leaseOwner = null;
      state.job.errorCode = input.errorCode;
      return structuredClone(state.job);
    },
    async markDocumentOcrFailure(_accountId, _documentId, nextStatus) {
      state.ocrStatus = nextStatus === "failed" ? "failed" : "retry";
      if (nextStatus === "failed") state.documentStatus = "failed";
      return state.job.documentId;
    }
  };
  const quota = { async findExpiredOutstandingReservations() { return []; } };
  const repositories = {
    jobs,
    quota,
    async transaction(work) { return work({ jobs, quota }); }
  };
  const worker = createKnowledgeJobWorker({
    repositories,
    library: {
      async executeDocumentCleanup() {},
      async executeBaseCleanup() {}
    },
    objectStore: {},
    config: { concurrency: 1, leaseSeconds: 15 },
    ingestion: { async executeParseJob() {} },
    ocr: {
      async executeOcrJob() {
        throw new KnowledgeError("KB_OCR_PROVIDER_ERROR", "provider failed", {
          status: 502
        });
      }
    },
    quotaService: {
      async reconcileAccountCounters() {},
      async release() {}
    },
    workerId: "worker:test",
    logger: { info() {}, warn() {}, error() {} }
  });

  const first = await worker.runOnce();
  assert.equal(first.failed.status, "retry");
  assert.equal(state.documentStatus, "needs_ocr");
  assert.equal(state.ocrStatus, "retry");

  const second = await worker.runOnce();
  assert.equal(second.failed.status, "failed");
  assert.equal(state.documentStatus, "failed");
  assert.equal(state.ocrStatus, "failed");
});
