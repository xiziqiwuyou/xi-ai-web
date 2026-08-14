import assert from "node:assert/strict";
import test from "node:test";
import { createKnowledgeOperationsRepository } from "../../server/knowledge-cloud/repositories/operations-repository.mjs";

test("operations metrics project bounded rates, latency, index age, quota drift and reconciliation state", async () => {
  const calls = [];
  const repository = createKnowledgeOperationsRepository({
    async query(sql, params = []) {
      calls.push({ sql, params });
      return {
        rows: [{
          jobs_queued: 2,
          jobs_running: 1,
          jobs_retry: 1,
          jobs_failed: 3,
          jobs_cancelled: 0,
          oldest_ready_age_seconds: 90,
          jobs_attempted_window: 10,
          jobs_retried_window: 2,
          jobs_terminal_window: 8,
          jobs_dead_letter_window: 1,
          jobs_retry_rate: "0.2",
          jobs_dead_letter_rate: "0.125",
          embedding_completed_batches: 7,
          embedding_average_latency_ms: 125,
          embedding_p95_latency_ms: 240,
          pending_indexes: 2,
          oldest_pending_index_age_seconds: 360,
          quota_drift_accounts: 1,
          quota_used_drift_bytes: "-64",
          quota_reserved_drift_bytes: "32",
          reconciliation_total: 1,
          reconciliation_running: 0,
          reconciliation_queued: 0,
          reconciliation_failed: 0,
          reconciliation_partial: 0,
          reconciliation_database_objects: 12,
          reconciliation_checked_objects: 12,
          reconciliation_missing_objects: 1,
          reconciliation_last_completed_at: "2026-08-14T00:00:00.000Z"
        }]
      };
    }
  });
  const metrics = await repository.healthMetrics();
  assert.equal(metrics.queue.retryRate, 0.2);
  assert.equal(metrics.queue.deadLetterRate, 0.125);
  assert.equal(metrics.embeddings.p95LatencyMs, 240);
  assert.equal(metrics.indexes.oldestPendingAgeSeconds, 360);
  assert.equal(metrics.quota.usedDriftBytes, "-64");
  assert.equal(metrics.reconciliation.state, "drift_detected");
  assert.equal(metrics.reconciliation.missingObjects, 1);
  assert.match(calls[0].sql, /percentile_cont\(0\.95\)/u);
  assert.match(calls[0].sql, /kb_reconciliation_runs/u);
  assert.match(calls[0].sql, /kb_usage_ledger/u);
});

test("object reconciliation references stay account-scoped and never enter public metrics", async () => {
  const calls = [];
  const repository = createKnowledgeOperationsRepository({
    async query(sql, params = []) {
      calls.push({ sql, params });
      return {
        rows: [{ object_key: "knowledge/private/source", version_id: "v1", total_count: 1 }]
      };
    }
  });
  const result = await repository.listAccountObjectReferences(
    "11111111-1111-4111-8111-111111111111",
    50
  );
  assert.equal(result.total, 1);
  assert.equal(result.items[0].objectKey, "knowledge/private/source");
  assert.match(calls[0].sql, /WHERE account_id = \$1/u);
  assert.deepEqual(calls[0].params, ["11111111-1111-4111-8111-111111111111", 51]);
});

test("OCR maintenance selects only active account and base work", async () => {
  const calls = [];
  const repository = createKnowledgeOperationsRepository({
    async query(sql, params = []) {
      calls.push({ sql, params });
      return { rows: [] };
    }
  });
  assert.deepEqual(await repository.listNeededOcrDocuments(25), []);
  assert.match(calls[0].sql, /JOIN kb_accounts a[\s\S]*a\.status = 'active'/u);
  assert.match(calls[0].sql, /JOIN kb_knowledge_bases b[\s\S]*b\.status = 'active'/u);
  assert.deepEqual(calls[0].params, [25]);
});
