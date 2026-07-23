import assert from "node:assert/strict";
import test from "node:test";
import { KnowledgeError } from "../../server/knowledge-cloud/errors.mjs";
import { createKnowledgeJobWorker } from "../../server/knowledge-cloud/jobs/worker-runtime.mjs";

function harness({ maxAttempts = 3, failCount = 1, exhaustedLease = false } = {}) {
  const state = {
    executions: 0,
    documentStatus: exhaustedLease ? "parsing" : "uploaded",
    job: {
      id: "11111111-1111-4111-8111-111111111111",
      accountId: "22222222-2222-4222-8222-222222222222",
      knowledgeBaseId: "33333333-3333-4333-8333-333333333333",
      documentId: "44444444-4444-4444-8444-444444444444",
      kind: "parse",
      status: exhaustedLease ? "running" : "queued",
      attempts: exhaustedLease ? maxAttempts : 0,
      maxAttempts,
      leaseOwner: exhaustedLease ? "dead-worker" : null,
      progressCurrent: 0,
      progressTotal: 0,
      errorCode: null,
      errorDetail: null
    }
  };
  const jobs = {
    async expireExhaustedLeases() {
      if (!exhaustedLease || state.job.status !== "running" || state.job.attempts < state.job.maxAttempts) return [];
      Object.assign(state.job, {
        status: "failed",
        leaseOwner: null,
        errorCode: "KB_JOB_LEASE_EXHAUSTED",
        errorDetail: null
      });
      return [structuredClone(state.job)];
    },
    async claimNext({ workerId }) {
      if (!["queued", "retry"].includes(state.job.status) || state.job.attempts >= state.job.maxAttempts) return null;
      Object.assign(state.job, {
        status: "running",
        attempts: state.job.attempts + 1,
        leaseOwner: workerId,
        errorCode: null,
        errorDetail: null
      });
      return structuredClone(state.job);
    },
    async heartbeat(_jobId, workerId, _leaseSeconds, progress = {}) {
      if (state.job.status !== "running" || state.job.leaseOwner !== workerId) return null;
      if (progress.current !== undefined) state.job.progressCurrent = progress.current;
      if (progress.total !== undefined) state.job.progressTotal = progress.total;
      return structuredClone(state.job);
    },
    async findJob() { return structuredClone(state.job); },
    async failOwnedJob(input) {
      if (state.job.status !== "running" || state.job.leaseOwner !== input.workerId) return null;
      const retry = input.retryable && state.job.attempts < state.job.maxAttempts;
      Object.assign(state.job, {
        status: retry ? "retry" : "failed",
        leaseOwner: null,
        errorCode: input.errorCode,
        errorDetail: input.errorDetail
      });
      return structuredClone(state.job);
    },
    async markDocumentParseFailed() {
      state.documentStatus = "failed";
      return state.job.documentId;
    },
    async completeOwnedJob(_jobId, workerId, progress) {
      if (state.job.status !== "running" || state.job.leaseOwner !== workerId) return null;
      Object.assign(state.job, {
        status: "succeeded",
        leaseOwner: null,
        progressCurrent: progress.current,
        progressTotal: progress.total
      });
      state.documentStatus = "awaiting_embedding";
      return structuredClone(state.job);
    }
  };
  const quota = { async findExpiredOutstandingReservations() { return []; } };
  const repositories = {
    jobs,
    quota,
    async transaction(work) { return work({ jobs, quota }); }
  };
  const ingestion = {
    async executeParseJob(job, { workerId, reportProgress }) {
      state.executions += 1;
      await reportProgress({ current: 1, total: 2 });
      if (state.executions <= failCount) {
        throw new KnowledgeError("KB_OBJECT_STORE_UNAVAILABLE", "对象存储暂时不可用", {
          status: 502
        });
      }
      await repositories.transaction((transaction) =>
        transaction.jobs.completeOwnedJob(job.id, workerId, { current: 2, total: 2 })
      );
      return { status: "awaiting_embedding" };
    }
  };
  const library = {
    async executeDocumentCleanup() { return { deleted: true }; },
    async executeBaseCleanup() { return { deleted: true }; }
  };
  const worker = createKnowledgeJobWorker({
    repositories,
    library,
    objectStore: {},
    config: { concurrency: 1, leaseSeconds: 15 },
    ingestion,
    quotaService: {
      async reconcileAccountCounters() { return { changed: false }; },
      async release() { return { releasedBytes: "0" }; }
    },
    workerId: "worker:test",
    logger: { info() {}, warn() {}, error() {} }
  });
  return { worker, state };
}

function cleanupHarness() {
  const state = {
    calls: [],
    job: {
      id: "55555555-5555-4555-8555-555555555555",
      accountId: "22222222-2222-4222-8222-222222222222",
      knowledgeBaseId: null,
      documentId: null,
      kind: "cleanup",
      status: "queued",
      attempts: 0,
      maxAttempts: 3,
      leaseOwner: null,
      progressCurrent: 0,
      progressTotal: 0,
      errorCode: null,
      errorDetail: null
    }
  };
  const jobs = {
    async expireExhaustedLeases() { return []; },
    async claimNext({ workerId }) {
      if (state.job.status !== "queued") return null;
      state.job.status = "running";
      state.job.attempts += 1;
      state.job.leaseOwner = workerId;
      return structuredClone(state.job);
    },
    async heartbeat(_jobId, workerId, _leaseSeconds, progress = {}) {
      if (state.job.status !== "running" || state.job.leaseOwner !== workerId) return null;
      if (progress.current !== undefined) state.job.progressCurrent = progress.current;
      if (progress.total !== undefined) state.job.progressTotal = progress.total;
      return structuredClone(state.job);
    },
    async findJob() { return structuredClone(state.job); },
    async failOwnedJob(input) {
      if (state.job.status !== "running" || state.job.leaseOwner !== input.workerId) return null;
      state.job.status = "failed";
      state.job.leaseOwner = null;
      return structuredClone(state.job);
    },
    async completeOwnedJob(_jobId, workerId, progress) {
      if (state.job.status !== "running" || state.job.leaseOwner !== workerId) return null;
      state.job.status = "succeeded";
      state.job.leaseOwner = null;
      state.job.progressCurrent = progress.current;
      state.job.progressTotal = progress.total;
      return structuredClone(state.job);
    },
    async markDocumentParseFailed() {
      return null;
    }
  };
  const quota = { async findExpiredOutstandingReservations() { return []; } };
  const repositories = {
    jobs,
    quota,
    async transaction(work) { return work({ jobs, quota }); }
  };
  const library = {
    async executeDocumentCleanup() { return { deleted: true }; },
    async executeBaseCleanup() { return { deleted: true }; }
  };
  const operations = {
    async executeAccountCleanup(accountId) {
      state.calls.push(accountId);
      return { accountId, cleanedKnowledgeBases: 3, releasedBytes: "256" };
    }
  };
  const worker = createKnowledgeJobWorker({
    repositories,
    library,
    operations,
    objectStore: {},
    config: { concurrency: 1, leaseSeconds: 15 },
    ingestion: {
      async executeParseJob() {
        throw new Error("parse should not run");
      }
    },
    quotaService: {
      async reconcileAccountCounters() { return { changed: false }; },
      async release() { return { releasedBytes: "0" }; }
    },
    workerId: "worker:test",
    logger: { info() {}, warn() {}, error() {} }
  });
  return { worker, state };
}

test("retryable worker failures requeue with a new attempt and later complete once", async () => {
  const { worker, state } = harness({ failCount: 1, maxAttempts: 3 });
  const first = await worker.runOnce();
  assert.equal(first.failed.status, "retry");
  assert.equal(state.job.attempts, 1);
  assert.equal(state.documentStatus, "uploaded");

  const second = await worker.runOnce();
  assert.equal(second.result.status, "awaiting_embedding");
  assert.equal(state.job.status, "succeeded");
  assert.equal(state.job.attempts, 2);
  assert.equal(state.executions, 2);
  assert.equal(state.documentStatus, "awaiting_embedding");
});

test("an exhausted retryable parse job enters the dead-letter state and marks the document failed", async () => {
  const { worker, state } = harness({ failCount: 10, maxAttempts: 1 });
  const result = await worker.runOnce();
  assert.equal(result.failed.status, "failed");
  assert.equal(state.job.errorCode, "KB_OBJECT_STORE_UNAVAILABLE");
  assert.equal(state.documentStatus, "failed");
  const next = await worker.runOnce();
  assert.equal(next.claimed, false);
  assert.equal(state.executions, 1);
});

test("maintenance closes an exhausted crashed lease and synchronizes the document failure state", async () => {
  const { worker, state } = harness({ exhaustedLease: true, maxAttempts: 2, failCount: 0 });
  const result = await worker.runOnce();
  assert.equal(result.claimed, false);
  assert.equal(state.job.status, "failed");
  assert.equal(state.job.errorCode, "KB_JOB_LEASE_EXHAUSTED");
  assert.equal(state.documentStatus, "failed");
  assert.equal(state.executions, 0);
});

test("cleanup jobs without a document or knowledge base delegate to the operations service", async () => {
  const { worker, state } = cleanupHarness();
  const result = await worker.runOnce();
  assert.equal(result.claimed, true);
  assert.equal(result.job.kind, "cleanup");
  assert.equal(result.result.accountId, state.job.accountId);
  assert.equal(result.result.cleanedKnowledgeBases, 3);
  assert.equal(state.job.status, "succeeded");
  assert.deepEqual(state.calls, [state.job.accountId]);
});
