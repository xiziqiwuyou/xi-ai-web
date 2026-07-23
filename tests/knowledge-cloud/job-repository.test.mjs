import assert from "node:assert/strict";
import test from "node:test";
import { createKnowledgeJobRepository } from "../../server/knowledge-cloud/repositories/job-repository.mjs";

const jobRow = {
  id: "11111111-1111-4111-8111-111111111111",
  account_id: "22222222-2222-4222-8222-222222222222",
  knowledge_base_id: "33333333-3333-4333-8333-333333333333",
  document_id: "44444444-4444-4444-8444-444444444444",
  dedupe_key: "document-parse:44444444-4444-4444-8444-444444444444",
  kind: "parse",
  status: "running",
  attempts: 1,
  max_attempts: 5,
  lease_owner: "worker:test",
  lease_expires_at: "2026-07-22T00:01:00.000Z",
  progress_current: 0,
  progress_total: 5,
  error_code: null,
  error_detail: null,
  run_after: "2026-07-22T00:00:00.000Z",
  created_at: "2026-07-22T00:00:00.000Z",
  updated_at: "2026-07-22T00:00:00.000Z"
};

function harness(rows = [jobRow]) {
  const calls = [];
  const repository = createKnowledgeJobRepository({
    async query(sql, params = []) {
      calls.push({ sql, params });
      return { rows: structuredClone(rows), rowCount: rows.length };
    }
  });
  return { repository, calls };
}

test("job claims use skip-locked leases, reclaim expired work and enforce per-account ingestion limits", async () => {
  const { repository, calls } = harness();
  const job = await repository.claimNext({
    workerId: "worker:test",
    leaseSeconds: 60,
    kinds: ["parse", "cleanup", "reconcile"]
  });
  assert.equal(job.status, "running");
  assert.equal(job.leaseOwner, "worker:test");
  assert.match(calls[0].sql, /FOR UPDATE OF j SKIP LOCKED/);
  assert.match(calls[0].sql, /j\.status = 'running' AND j\.lease_expires_at <= CURRENT_TIMESTAMP/);
  assert.match(calls[0].sql, /j\.kind <> 'parse' OR a\.status = 'active'/);
  assert.match(calls[0].sql, /maxConcurrentIngestionsPerAccount/);
  assert.match(calls[0].sql, /attempts = j\.attempts \+ 1/);
  assert.deepEqual(calls[0].params, [["parse", "cleanup", "reconcile"], "worker:test", 60]);
});

test("heartbeat, completion and failure mutations are guarded by job ID and lease owner", async () => {
  const { repository, calls } = harness();
  await repository.heartbeat(jobRow.id, "worker:test", 60, { current: 2, total: 5 });
  await repository.completeOwnedJob(jobRow.id, "worker:test", { current: 5, total: 5 });
  await repository.failOwnedJob({
    jobId: jobRow.id,
    workerId: "worker:test",
    errorCode: "KB_OBJECT_STORE_UNAVAILABLE",
    errorDetail: null,
    retryable: true,
    retryDelaySeconds: 10
  });
  for (const call of calls) {
    assert.match(call.sql, /status = 'running' AND lease_owner = \$2/);
  }
  assert.match(calls[2].sql, /attempts < max_attempts THEN 'retry'/);
  assert.match(calls[2].sql, /make_interval\(secs => \$6::integer\)/);
});

test("chunk inserts use bounded JSON batches and preserve source locators as jsonb", async () => {
  const { repository, calls } = harness([]);
  const chunks = Array.from({ length: 501 }, (_, ordinal) => ({
    id: `${String(ordinal).padStart(8, "0")}-1111-4111-8111-111111111111`,
    ordinal,
    text_content: `chunk ${ordinal}`,
    text_bytes: 7,
    token_estimate: 2,
    source_locator: { type: "pdf_page", page: ordinal + 1 },
    content_hash: "a".repeat(64)
  }));
  await repository.insertChunks({
    accountId: jobRow.account_id,
    knowledgeBaseId: jobRow.knowledge_base_id,
    documentId: jobRow.document_id,
    indexVersionId: "55555555-5555-4555-8555-555555555555",
    chunks
  });
  assert.equal(calls.length, 2);
  assert.match(calls[0].sql, /jsonb_to_recordset\(\$5::jsonb\)/);
  assert.match(calls[0].sql, /source_locator jsonb/);
  assert.equal(JSON.parse(calls[0].params[4]).length, 500);
  assert.equal(JSON.parse(calls[1].params[4]).length, 1);
});

test("Admin retry/cancel SQL clears leases without returning internal error detail projections", async () => {
  const { repository, calls } = harness([{ ...jobRow, status: "cancelled", lease_owner: null }]);
  const cancelled = await repository.cancelJob(jobRow.id);
  const retried = await repository.retryJob(jobRow.id);
  assert.equal(cancelled.status, "cancelled");
  assert.equal(retried.status, "cancelled");
  assert.match(calls[0].sql, /status IN \('queued', 'running', 'retry'\)/);
  assert.match(calls[1].sql, /status IN \('failed', 'cancelled'\)/);
  assert.match(calls[1].sql, /attempts = 0/);
});
