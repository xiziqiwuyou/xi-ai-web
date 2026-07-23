import assert from "node:assert/strict";
import test from "node:test";
import { createKnowledgeAdminService } from "../../server/knowledge-cloud/admin/service.mjs";

const jobId = "11111111-1111-4111-8111-111111111111";
const accountId = "22222222-2222-4222-8222-222222222222";
const documentId = "33333333-3333-4333-8333-333333333333";

function harness(status = "failed") {
  const state = {
    documentStatus: "failed",
    audits: [],
    job: {
      id: jobId,
      accountId,
      knowledgeBaseId: "44444444-4444-4444-8444-444444444444",
      documentId,
      kind: "parse",
      status,
      attempts: 5,
      maxAttempts: 5,
      leaseOwner: status === "running" ? "worker:secret" : null,
      leaseExpiresAt: status === "running" ? "2026-07-22T10:01:00.000Z" : null,
      progressCurrent: 2,
      progressTotal: 5,
      errorCode: "KB_PARSER_MALFORMED",
      errorDetail: "private internal parser detail",
      runAfter: "2026-07-22T10:00:00.000Z",
      createdAt: "2026-07-22T09:00:00.000Z",
      updatedAt: "2026-07-22T10:00:00.000Z"
    }
  };
  const jobs = {
    async findJob() { return structuredClone(state.job); },
    async resetParseDocumentForRetry() {
      if (state.documentStatus !== "failed") return null;
      state.documentStatus = "uploaded";
      return documentId;
    },
    async retryJob() {
      if (!["failed", "cancelled"].includes(state.job.status)) return null;
      Object.assign(state.job, {
        status: "queued",
        attempts: 0,
        leaseOwner: null,
        leaseExpiresAt: null,
        progressCurrent: 0,
        errorCode: null,
        errorDetail: null
      });
      return structuredClone(state.job);
    },
    async cancelJob() {
      if (!["queued", "running", "retry"].includes(state.job.status)) return null;
      Object.assign(state.job, {
        status: "cancelled",
        leaseOwner: null,
        leaseExpiresAt: null,
        errorCode: "KB_JOB_CANCELLED",
        errorDetail: null
      });
      return structuredClone(state.job);
    },
    async markParseDocumentCancelled() {
      state.documentStatus = "failed";
      return documentId;
    }
  };
  const admin = {
    async insertAudit(entry) {
      state.audits.push(structuredClone(entry));
      return { ...entry, id: String(state.audits.length) };
    }
  };
  const repositories = {
    admin,
    async transaction(work) { return work({ admin, jobs }); }
  };
  const service = createKnowledgeAdminService({
    repositories,
    tokenSecret: "knowledge-admin-test-secret-value-123456",
    clock: () => new Date("2026-07-22T10:00:30.000Z")
  });
  return { service, state };
}

test("Admin retry resets a failed parse document, requeues the job and audits only safe metadata", async () => {
  const { service, state } = harness("failed");
  const job = await service.retryJob(jobId, { reason: "解析器升级后重试" }, {
    actor: "xizi",
    requestId: "request-admin-job-retry"
  });
  assert.equal(job.status, "queued");
  assert.equal(job.attempts, 0);
  assert.equal(state.documentStatus, "uploaded");
  assert.equal("leaseOwner" in job, false);
  assert.equal("errorDetail" in job, false);
  assert.deepEqual(state.audits[0].metadata, { kind: "parse", status: "queued" });
  assert.equal(state.audits[0].operation, "job.retry");
  assert.equal(state.audits[0].result, "succeeded");
});

test("Admin cancel revokes a running lease, marks the parse document failed and returns no lease owner", async () => {
  const { service, state } = harness("running");
  state.documentStatus = "parsing";
  const job = await service.cancelJob(jobId, { reason: "异常文件人工终止" }, {
    actor: "xizi",
    requestId: "request-admin-job-cancel"
  });
  assert.equal(job.status, "cancelled");
  assert.equal(job.leaseActive, false);
  assert.equal(state.documentStatus, "failed");
  assert.equal("leaseOwner" in job, false);
  assert.equal(state.audits[0].operation, "job.cancel");
});

test("invalid Admin job transitions fail closed and append a separate failed audit", async () => {
  const { service, state } = harness("succeeded");
  await assert.rejects(
    service.cancelJob(jobId, { reason: "重复取消" }, {
      actor: "xizi",
      requestId: "request-admin-job-invalid"
    }),
    (error) => error.code === "KB_JOB_STATE_INVALID" && error.status === 409
  );
  assert.equal(state.job.status, "succeeded");
  assert.equal(state.audits.length, 1);
  assert.equal(state.audits[0].result, "failed");
  assert.deepEqual(state.audits[0].metadata, { errorCode: "KB_JOB_STATE_INVALID" });
});
