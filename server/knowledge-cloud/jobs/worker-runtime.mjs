import crypto from "node:crypto";
import os from "node:os";
import { KNOWLEDGE_ERROR_CODES, KnowledgeError } from "../errors.mjs";
import { createKnowledgeIngestionService } from "./ingestion-service.mjs";
import { createKnowledgeQuotaService } from "../quotas/service.mjs";

const SUPPORTED_JOB_KINDS = Object.freeze(["parse", "cleanup", "reconcile"]);

function retryDelaySeconds(attempts) {
  return Math.min(300, 5 * (2 ** Math.max(0, attempts - 1)));
}

function storedErrorDetail(error) {
  if (!(error instanceof KnowledgeError) || error.status >= 500) return null;
  return Buffer.from(error.message, "utf8").subarray(0, 4000).toString("utf8");
}

function isPermanentFailure(error) {
  if (error?.retryable === false) return true;
  return new Set([
    KNOWLEDGE_ERROR_CODES.ACCOUNT_FROZEN,
    KNOWLEDGE_ERROR_CODES.DOCUMENT_LIMIT_EXCEEDED,
    KNOWLEDGE_ERROR_CODES.FILE_TOO_LARGE,
    KNOWLEDGE_ERROR_CODES.JOB_STATE_INVALID,
    KNOWLEDGE_ERROR_CODES.PARSER_EMPTY,
    KNOWLEDGE_ERROR_CODES.PARSER_ENCRYPTED,
    KNOWLEDGE_ERROR_CODES.PARSER_MALFORMED,
    KNOWLEDGE_ERROR_CODES.PARSER_RESOURCE_LIMIT,
    KNOWLEDGE_ERROR_CODES.PARSER_TIMEOUT,
    KNOWLEDGE_ERROR_CODES.PARSER_TYPE_MISMATCH,
    KNOWLEDGE_ERROR_CODES.PARSER_UNSUPPORTED,
    KNOWLEDGE_ERROR_CODES.QUOTA_EXCEEDED,
    KNOWLEDGE_ERROR_CODES.UPLOAD_MISMATCH,
    KNOWLEDGE_ERROR_CODES.UPLOAD_NOT_FOUND
  ]).has(error?.code);
}

function delay(milliseconds, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

export function createKnowledgeJobWorker({
  repositories,
  library,
  operations,
  objectStore,
  config,
  logger = console,
  workerId = `${os.hostname()}:${process.pid}:${crypto.randomUUID()}`,
  ingestion = createKnowledgeIngestionService({ repositories, objectStore }),
  quotaService = createKnowledgeQuotaService({ repositories }),
  pollIntervalMs = 1_000
}) {
  if (!repositories?.jobs || typeof repositories.transaction !== "function") {
    throw new TypeError("Knowledge worker requires job repositories and transactions");
  }
  if (!library?.executeDocumentCleanup || !library?.executeBaseCleanup) {
    throw new TypeError("Knowledge worker requires library cleanup operations");
  }
  const concurrency = config?.concurrency || 2;
  const leaseSeconds = config?.leaseSeconds || 60;
  let stopping = false;
  let maintenanceAt = 0;
  const wakeController = new AbortController();
  const slots = new Set();

  async function heartbeat(job, controller, progress) {
    const renewed = await repositories.jobs.heartbeat(job.id, workerId, leaseSeconds, progress);
    if (!renewed) controller.abort();
    return renewed;
  }

  async function withHeartbeat(job, work) {
    const controller = new AbortController();
    const intervalMs = Math.max(1_000, Math.floor((leaseSeconds * 1000) / 3));
    let heartbeatInFlight = false;
    const timer = setInterval(() => {
      if (heartbeatInFlight || controller.signal.aborted) return;
      heartbeatInFlight = true;
      void heartbeat(job, controller).catch(() => controller.abort()).finally(() => {
        heartbeatInFlight = false;
      });
    }, intervalMs);
    timer.unref?.();
    try {
      return await work({
        signal: controller.signal,
        reportProgress: async (progress) => {
          const renewed = await heartbeat(job, controller, progress);
          if (!renewed) {
            throw new KnowledgeError(KNOWLEDGE_ERROR_CODES.JOB_LEASE_LOST, "Job lease has expired", {
              status: 409
            });
          }
        }
      });
    } finally {
      clearInterval(timer);
    }
  }

  async function completeOwnedJob(transaction, job, progress) {
    const completed = await transaction.jobs.completeOwnedJob(job.id, workerId, progress);
    if (!completed) {
      throw new KnowledgeError(KNOWLEDGE_ERROR_CODES.JOB_LEASE_LOST, "Job lease has expired", {
        status: 409
      });
    }
    return completed;
  }

  async function executeClaimedJob(job) {
    return withHeartbeat(job, async ({ signal, reportProgress }) => {
      if (job.kind === "parse") {
        return ingestion.executeParseJob(job, { workerId, signal, reportProgress });
      }
      if (job.kind === "cleanup") {
        await reportProgress({ current: 1, total: 2 });
        const result = job.documentId
          ? await library.executeDocumentCleanup(job.accountId, job.documentId)
          : job.knowledgeBaseId
            ? await library.executeBaseCleanup(job.accountId, job.knowledgeBaseId)
            : operations?.executeAccountCleanup
              ? await operations.executeAccountCleanup(job.accountId)
              : (() => {
                  throw new KnowledgeError(
                    KNOWLEDGE_ERROR_CODES.JOB_STATE_INVALID,
                    "Account cleanup jobs require the operations service",
                    { status: 409 }
                  );
                })();
        await repositories.transaction((transaction) =>
          completeOwnedJob(transaction, job, { current: 2, total: 2 })
        );
        return result;
      }
      if (job.kind === "reconcile") {
        return repositories.transaction(async (transaction) => {
          const result = await quotaService.reconcileAccountCounters(transaction, job.accountId);
          await completeOwnedJob(transaction, job, { current: 1, total: 1 });
          return result;
        });
      }
      throw new KnowledgeError(KNOWLEDGE_ERROR_CODES.JOB_STATE_INVALID, "Job kind is not implemented", {
        status: 409
      });
    });
  }

  async function recordFailure(job, error) {
    if (error?.code === KNOWLEDGE_ERROR_CODES.JOB_LEASE_LOST) return null;
    return repositories.transaction(async (transaction) => {
      const current = await transaction.jobs.findJob(job.id, { forUpdate: true });
      if (!current || current.status !== "running" || current.leaseOwner !== workerId) return null;
      const failed = await transaction.jobs.failOwnedJob({
        jobId: job.id,
        workerId,
        errorCode: error?.code || KNOWLEDGE_ERROR_CODES.INTERNAL,
        errorDetail: storedErrorDetail(error),
        retryable: !isPermanentFailure(error),
        retryDelaySeconds: retryDelaySeconds(current.attempts)
      });
      if (failed?.status === "failed" && current.kind === "parse" && current.documentId) {
        await transaction.jobs.markDocumentParseFailed(
          current.accountId,
          current.documentId,
          "knowledge-parser/1",
          failed.errorCode,
          failed.errorDetail
        );
      }
      return failed;
    });
  }

  async function maintenance() {
    const now = Date.now();
    if (now - maintenanceAt < 60_000) return;
    maintenanceAt = now;
    await repositories.transaction(async (transaction) => {
      const exhausted = await transaction.jobs.expireExhaustedLeases();
      for (const job of exhausted) {
        if (job.kind !== "parse" || !job.documentId) continue;
        await transaction.jobs.markDocumentParseFailed(
          job.accountId,
          job.documentId,
          "knowledge-parser/1",
          job.errorCode || "KB_JOB_LEASE_EXHAUSTED",
          null
        );
      }
    });
    const expired = await repositories.quota.findExpiredOutstandingReservations(50);
    for (const reservation of expired) {
      await repositories.transaction((transaction) =>
        quotaService.release(transaction, {
          ...reservation,
          metadata: { reason: "reservation_expired" }
        })
      );
    }
    if (operations?.maintenance) {
      await operations.maintenance({ limit: 50 });
    }
  }

  async function runOnce() {
    await maintenance();
    const job = await repositories.transaction((transaction) =>
      transaction.jobs.claimNext({ workerId, leaseSeconds, kinds: SUPPORTED_JOB_KINDS })
    );
    if (!job) return { claimed: false };
    try {
      const result = await executeClaimedJob(job);
      logger.info?.(JSON.stringify({
        event: "knowledge_job_succeeded",
        jobId: job.id,
        kind: job.kind,
        attempts: job.attempts
      }));
      return { claimed: true, job, result };
    } catch (error) {
      const failed = await recordFailure(job, error).catch(() => null);
      logger.warn?.(JSON.stringify({
        event: "knowledge_job_failed",
        jobId: job.id,
        kind: job.kind,
        attempts: job.attempts,
        errorCode: error?.code || KNOWLEDGE_ERROR_CODES.INTERNAL,
        nextStatus: failed?.status || "lease_lost"
      }));
      return { claimed: true, job, error, failed };
    }
  }

  async function runSlot() {
    while (!stopping) {
      const result = await runOnce().catch((error) => {
        logger.error?.(JSON.stringify({
          event: "knowledge_worker_poll_failed",
          errorCode: error?.code || KNOWLEDGE_ERROR_CODES.INTERNAL
        }));
        return { claimed: false };
      });
      if (!result.claimed) await delay(pollIntervalMs, wakeController.signal);
    }
  }

  return Object.freeze({
    workerId,
    runOnce,
    start() {
      if (slots.size) return;
      for (let index = 0; index < concurrency; index += 1) {
        const slot = runSlot().finally(() => slots.delete(slot));
        slots.add(slot);
      }
    },
    async stop() {
      stopping = true;
      wakeController.abort();
      await Promise.allSettled([...slots]);
    }
  });
}
