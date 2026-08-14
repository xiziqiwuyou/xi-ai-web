import crypto from "node:crypto";
import {
  KNOWLEDGE_ERROR_CODES,
  KnowledgeError,
  knowledgeError,
  redactKnowledgeValue
} from "../errors.mjs";
import { createKnowledgeQuotaService } from "../quotas/service.mjs";

const MAX_REASON_LENGTH = 1000;
const DEFAULT_MAINTENANCE_LIMIT = 50;
const MAX_MAINTENANCE_LIMIT = 500;
const MAX_RECONCILIATION_OBJECTS = 200;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertObject(value, field = "payload") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVALID_REQUEST, `${field} must be an object`, {
      status: 400,
      details: { field }
    });
  }
  return value;
}

function rejectUnknownKeys(value, allowed, field = "payload") {
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVALID_REQUEST, `${field} contains unsupported fields`, {
      status: 400,
      details: { field, unknown }
    });
  }
}

function validateReason(value) {
  const reason = String(value || "").normalize("NFKC").trim();
  if (!reason || reason.length > MAX_REASON_LENGTH) {
    throw knowledgeError(
      KNOWLEDGE_ERROR_CODES.ADMIN_REASON_REQUIRED,
      `reason must be 1-${MAX_REASON_LENGTH} characters`,
      { status: 400, details: { field: "reason" } }
    );
  }
  return reason;
}

function validateUuid(value, field) {
  const id = String(value || "").trim();
  if (!UUID_PATTERN.test(id)) {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVALID_REQUEST, `${field} is invalid`, {
      status: 400,
      details: { field }
    });
  }
  return id;
}

function validateExpectedVersion(value) {
  const version = Number(value);
  if (!Number.isSafeInteger(version) || version < 1) {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVALID_REQUEST, "expectedVersion is invalid", {
      status: 400,
      details: { field: "expectedVersion" }
    });
  }
  return version;
}

function validateLimit(value, fallback = DEFAULT_MAINTENANCE_LIMIT) {
  if (value === undefined || value === null || value === "") return fallback;
  const limit = Number(value);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_MAINTENANCE_LIMIT) {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.INVALID_REQUEST, "limit is invalid", {
      status: 400,
      details: { field: "limit", min: 1, max: MAX_MAINTENANCE_LIMIT }
    });
  }
  return limit;
}

function actorContext(context = {}) {
  return {
    actor: String(context.actor || "admin").slice(0, 128),
    requestId: String(context.requestId || crypto.randomUUID()).slice(0, 128)
  };
}

function failureMetadata(error) {
  return {
    errorCode: error instanceof KnowledgeError ? error.code : KNOWLEDGE_ERROR_CODES.INTERNAL
  };
}

function projectJob(job) {
  if (!job) return null;
  return {
    id: job.id,
    accountId: job.accountId,
    knowledgeBaseId: job.knowledgeBaseId,
    documentId: job.documentId,
    kind: job.kind,
    status: job.status,
    attempts: job.attempts || 0,
    maxAttempts: job.maxAttempts || 5,
    progressCurrent: job.progressCurrent || 0,
    progressTotal: job.progressTotal || 0,
    errorCode: job.errorCode || null,
    leaseActive: false,
    runAfter: job.runAfter || null,
    createdAt: job.createdAt || null,
    updatedAt: job.updatedAt || null
  };
}

function readinessStatus({ runtime, metrics, ready }) {
  if (!runtime.available) return "unavailable";
  if (!ready) return "unavailable";
  if (
    metrics.queue.failed > 0 ||
    metrics.storage.staleReservationCount > 0 ||
    metrics.quota?.driftAccounts > 0 ||
    metrics.reconciliation?.state === "failed"
  ) return "degraded";
  if (metrics.cleanup.deletingAccounts > 0 || metrics.storage.expiredPendingUploads > 0) {
    return "maintenance_required";
  }
  return "ready";
}

export function createKnowledgeOperationsService({
  repositories,
  library,
  config,
  schemaVersion,
  vectorVersion,
  objectStoreConfigured = false,
  objectStore,
  clock = () => new Date(),
  cryptoModule = crypto,
  logger = console,
  quotaService = createKnowledgeQuotaService({ repositories, cryptoModule })
}) {
  if (!repositories?.operations || !repositories?.admin || typeof repositories.transaction !== "function") {
    throw new TypeError("Knowledge operations service requires operations, admin and transaction repositories");
  }
  if (!repositories?.quota) {
    throw new TypeError("Knowledge operations service requires quota repositories");
  }

  async function writeAudit({ operation, targetType, targetId, reason, result, metadata, context }) {
    const { actor, requestId } = actorContext(context);
    return repositories.transaction((transaction) =>
      transaction.admin.insertAudit({
        requestId,
        adminActor: actor,
        operation,
        targetType,
        targetId: targetId || null,
        reason,
        result,
        metadata: redactKnowledgeValue(metadata || {})
      })
    );
  }

  async function auditedOperation(audit, work) {
    const reason = validateReason(audit.reason);
    try {
      const result = await work({ reason });
      await writeAudit({
        ...audit,
        targetId: typeof audit.targetId === "function" ? audit.targetId(result) : audit.targetId,
        reason,
        result: "succeeded",
        metadata: typeof audit.metadata === "function" ? audit.metadata(result) : audit.metadata
      });
      return result;
    } catch (error) {
      await writeAudit({
        ...audit,
        targetId: typeof audit.targetId === "string" ? audit.targetId : null,
        reason,
        result: "failed",
        metadata: failureMetadata(error)
      }).catch(() => undefined);
      throw error;
    }
  }

  async function releaseExpiredReservations(limit) {
    const expired = await repositories.quota.findExpiredOutstandingReservations(limit);
    let released = 0;
    for (const reservation of expired) {
      await repositories.transaction((transaction) =>
        quotaService.release(transaction, {
          ...reservation,
          metadata: { reason: "operations_reservation_expired" }
        })
      );
      released += 1;
    }
    return { inspected: expired.length, released };
  }

  async function maintenance(input = {}) {
    const limit = validateLimit(input.limit);
    const [
      expiredUploads,
      expiredReservations,
      expiredSessions,
      expiredAdminResets,
      expiredInvites,
      finalizedAccounts,
      queuedOcr
    ] = await Promise.all([
      library?.cleanupExpiredUploads
        ? library.cleanupExpiredUploads({ limit: Math.min(100, limit) })
        : Promise.resolve({ inspected: 0, cleaned: 0, failed: 0 }),
      releaseExpiredReservations(limit),
      repositories.operations.revokeExpiredSessions(limit),
      repositories.operations.expireAdminResets(),
      repositories.operations.expireInvites(),
      repositories.operations.deleteAccountsReadyForFinalization(limit),
      config?.ocr?.enabled
        ? repositories.transaction(async (transaction) => {
            const documents = await transaction.operations.listNeededOcrDocuments(limit);
            let queued = 0;
            for (const document of documents) {
              if (!(await transaction.operations.markDocumentOcrQueued(document.accountId, document.id))) {
                continue;
              }
              await transaction.operations.enqueueJob({
                id: cryptoModule.randomUUID(),
                accountId: document.accountId,
                knowledgeBaseId: document.knowledgeBaseId,
                documentId: document.id,
                dedupeKey: `document-ocr:${document.id}`,
                kind: "ocr"
              });
              queued += 1;
            }
            return queued;
          })
        : Promise.resolve(0)
    ]);
    const result = {
      expiredUploads,
      expiredReservations,
      expiredSessions,
      expiredAdminResets,
      expiredInvites,
      finalizedAccountIds: finalizedAccounts,
      queuedOcr
    };
    logger.info?.(JSON.stringify({
      event: "knowledge_operations_maintenance",
      result: redactKnowledgeValue(result)
    }));
    return result;
  }

  const service = {
    async readiness() {
      const [metrics, worker, objectStoreProbe] = await Promise.all([
        repositories.operations.healthMetrics(),
        repositories.operations.workerFreshness(config?.worker?.staleAfterSeconds || 45),
        objectStore?.readinessProbe
          ? objectStore.readinessProbe()
          : Promise.resolve({
              state: objectStoreConfigured ? "unknown" : "disabled",
              checkedAt: null,
              latencyMs: null,
              errorCode: null
            })
      ]);
      const infrastructureReady =
        worker.state === "fresh" &&
        new Set(["ok", "disabled"]).has(objectStoreProbe.state);
      const runtime = {
        enabled: true,
        available: true,
        schemaVersion: schemaVersion || null,
        vectorVersion: vectorVersion || null,
        worker: {
          concurrency: config?.worker?.concurrency || null,
          leaseSeconds: config?.worker?.leaseSeconds || null,
          ...worker
        },
        objectStore: {
          ...objectStoreProbe
        }
      };
      return {
        generatedAt: new Date(clock()).toISOString(),
        ready: infrastructureReady,
        status: readinessStatus({ runtime, metrics, ready: infrastructureReady }),
        reasonCodes: [
          ...(worker.state === "fresh" ? [] : [KNOWLEDGE_ERROR_CODES.WORKER_STALE]),
          ...(new Set(["ok", "disabled"]).has(objectStoreProbe.state)
            ? []
            : [KNOWLEDGE_ERROR_CODES.OBJECT_STORE_UNAVAILABLE])
        ],
        checks: {
          database: "ok",
          migrations: schemaVersion ? "ok" : "unknown",
          vectorExtension: vectorVersion ? "ok" : "unknown",
          worker: worker.state,
          objectStore: objectStoreProbe.state
        },
        runtime,
        metrics
      };
    },

    async scheduleReconciliation(input, context) {
      const payload = assertObject(input);
      rejectUnknownKeys(payload, new Set(["accountId", "limit", "reason"]));
      const accountId = payload.accountId ? validateUuid(payload.accountId, "accountId") : null;
      const limit = validateLimit(payload.limit, 100);
      return auditedOperation(
        {
          operation: "operations.reconcile.queue",
          targetType: accountId ? "account" : "knowledge",
          targetId: accountId || "all",
          reason: payload.reason,
          context,
          metadata: (result) => ({ queuedJobs: result.queuedJobs, scope: accountId ? "account" : "all" })
        },
        async () => {
          const jobs = await repositories.transaction(async (transaction) => {
            const accountIds = accountId
              ? [accountId]
              : await transaction.operations.listAccountIds({ limit });
            const queued = [];
            for (const id of accountIds) {
              if (accountId && !(await transaction.admin.findAccountById(id))) {
                throw knowledgeError(KNOWLEDGE_ERROR_CODES.ACCOUNT_NOT_FOUND, "Knowledge account was not found", {
                  status: 404
                });
              }
              await transaction.operations.markReconciliationQueued(id);
              queued.push(await transaction.operations.enqueueJob({
                id: cryptoModule.randomUUID(),
                accountId: id,
                dedupeKey: `account-reconcile:${id}`,
                kind: "reconcile"
              }));
            }
            return queued;
          });
          return {
            queuedJobs: jobs.length,
            jobs: jobs.map(projectJob)
          };
        }
      );
    },

    async executeReconciliation(accountIdValue) {
      const accountId = validateUuid(accountIdValue, "accountId");
      await repositories.operations.beginReconciliation(accountId);
      try {
        const quota = await repositories.transaction((transaction) =>
          quotaService.reconcileAccountCounters(transaction, accountId)
        );
        const references = await repositories.operations.listAccountObjectReferences(
          accountId,
          MAX_RECONCILIATION_OBJECTS
        );
        let missingObjects = 0;
        for (const reference of references.items) {
          try {
            await objectStore.headObject(reference);
          } catch (error) {
            if (error?.code === KNOWLEDGE_ERROR_CODES.UPLOAD_NOT_FOUND) {
              missingObjects += 1;
              continue;
            }
            throw error;
          }
        }
        const state = await repositories.operations.completeReconciliation({
          accountId,
          databaseObjectCount: references.total,
          checkedObjectCount: references.items.length,
          missingObjectCount: missingObjects,
          quotaChanged: quota.changed,
          truncated: references.truncated
        });
        return {
          accountId,
          state,
          databaseObjectCount: references.total,
          checkedObjectCount: references.items.length,
          missingObjectCount: missingObjects,
          quotaChanged: quota.changed,
          truncated: references.truncated
        };
      } catch (error) {
        await repositories.operations.failReconciliation(
          accountId,
          error?.code || KNOWLEDGE_ERROR_CODES.INTERNAL
        ).catch(() => undefined);
        throw error;
      }
    },

    async runMaintenance(input, context) {
      const payload = assertObject(input);
      rejectUnknownKeys(payload, new Set(["limit", "reason"]));
      return auditedOperation(
        {
          operation: "operations.maintenance.run",
          targetType: "knowledge",
          targetId: "global",
          reason: payload.reason,
          context,
          metadata: (result) => ({
            cleanedUploads: result.expiredUploads.cleaned,
            releasedReservations: result.expiredReservations.released,
            expiredSessions: result.expiredSessions,
            finalizedAccounts: result.finalizedAccountIds.length
          })
        },
        () => maintenance({ limit: payload.limit })
      );
    },

    async deleteAccount(accountIdValue, input, context) {
      const accountId = validateUuid(accountIdValue, "accountId");
      const payload = assertObject(input);
      rejectUnknownKeys(payload, new Set(["expectedVersion", "reason"]));
      const expectedVersion = validateExpectedVersion(payload.expectedVersion);
      return auditedOperation(
        {
          operation: "account.delete.request",
          targetType: "account",
          targetId: accountId,
          reason: payload.reason,
          context,
          metadata: (result) => ({
            cleanupJobId: result.job?.id || null,
            knowledgeBasesMarked: result.knowledgeBasesMarked,
            documentsMarked: result.documentsMarked
          })
        },
        async () => {
          const result = await repositories.transaction(async (transaction) => {
            const account = await transaction.admin.findAccountById(accountId, { forUpdate: true });
            if (!account) {
              throw knowledgeError(KNOWLEDGE_ERROR_CODES.ACCOUNT_NOT_FOUND, "Knowledge account was not found", {
                status: 404
              });
            }
            if (account.version !== expectedVersion) {
              throw knowledgeError(KNOWLEDGE_ERROR_CODES.VERSION_CONFLICT, "Knowledge account changed; refresh and retry", {
                status: 409
              });
            }
            const marked = account.status === "deleting"
              ? { id: account.id, status: account.status, version: account.version }
              : await transaction.operations.markAccountDeleting(accountId, expectedVersion);
            if (!marked) {
              throw knowledgeError(KNOWLEDGE_ERROR_CODES.VERSION_CONFLICT, "Knowledge account changed; refresh and retry", {
                status: 409
              });
            }
            await transaction.admin.revokeAllSessions(accountId);
            await transaction.admin.retireActiveAdminResets(accountId);
            const resources = await transaction.operations.markAccountResourcesDeleting(accountId);
            const job = await transaction.operations.enqueueJob({
              id: cryptoModule.randomUUID(),
              accountId,
              dedupeKey: `account-delete:${accountId}`,
              kind: "cleanup"
            });
            return { account: marked, resources, job };
          });
          return {
            accepted: true,
            accountId,
            status: "deleting",
            version: result.account.version,
            knowledgeBasesMarked: result.resources.knowledgeBasesMarked,
            documentsMarked: result.resources.documentsMarked,
            job: projectJob(result.job)
          };
        }
      );
    },

    async executeAccountCleanup(accountIdValue) {
      const accountId = validateUuid(accountIdValue, "accountId");
      const baseIds = await repositories.operations.listDeletingBaseIds(accountId, 100);
      let released = 0n;
      for (const baseId of baseIds) {
        const result = await library.executeBaseCleanup(accountId, baseId);
        released += BigInt(result.releasedBytes || "0");
      }
      return {
        accountId,
        cleanedKnowledgeBases: baseIds.length,
        releasedBytes: released.toString()
      };
    },

    maintenance
  };

  return Object.freeze(service);
}
