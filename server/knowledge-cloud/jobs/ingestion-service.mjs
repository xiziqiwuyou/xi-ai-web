import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { KNOWLEDGE_ERROR_CODES, knowledgeError } from "../errors.mjs";
import { runKnowledgeParserIsolated } from "../parsers/isolated.mjs";
import { resolveKnowledgeParserLimits } from "../parsers/limits.mjs";
import {
  createNormalizedArtifact,
  createPersistedChunks
} from "../parsers/text-utils.mjs";
import { createKnowledgeQuotaService } from "../quotas/service.mjs";

const RESERVATION_TTL_MS = 60 * 60 * 1000;

function boundedErrorDetail(error) {
  const detail = typeof error?.message === "string" ? error.message : "文档解析失败";
  return Buffer.from(detail, "utf8").subarray(0, 4000).toString("utf8");
}

function requireParseContext(context) {
  if (!context || !context.documentId || !context.indexVersionId) {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.DOCUMENT_NOT_FOUND, "解析任务对应的文档不存在", {
      status: 404
    });
  }
  if (context.baseStatus === "deleting" || !["uploaded", "parsing"].includes(context.documentStatus)) {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.JOB_STATE_INVALID, "文档当前状态不能继续解析", {
      status: 409,
      details: { documentStatus: context.documentStatus, baseStatus: context.baseStatus }
    });
  }
  return context;
}

async function requireOwnedJob(transaction, jobId, workerId) {
  const current = await transaction.jobs.findJob(jobId, { forUpdate: true });
  if (!current || current.status !== "running" || current.leaseOwner !== workerId) {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.JOB_LEASE_LOST, "任务租约已失效", {
      status: 409
    });
  }
  return current;
}

export function createKnowledgeIngestionService({
  repositories,
  objectStore,
  parser = runKnowledgeParserIsolated,
  parserLimits,
  quotaService = createKnowledgeQuotaService({ repositories }),
  clock = () => new Date(),
  cryptoModule = crypto
}) {
  if (!repositories?.jobs || !repositories?.quota || typeof repositories.transaction !== "function") {
    throw new TypeError("Knowledge ingestion service requires job, quota and transaction repositories");
  }
  if (!objectStore?.downloadObjectToFile || !objectStore?.putObjectFromFile || !objectStore?.deleteObject) {
    throw new TypeError("Knowledge ingestion service requires download, upload and delete object operations");
  }
  const limits = resolveKnowledgeParserLimits(parserLimits);

  async function releaseReservations(reservations, reason) {
    if (!reservations.length) return;
    await repositories.transaction(async (transaction) => {
      for (const reservation of reservations) {
        await quotaService.release(transaction, {
          ...reservation,
          metadata: { reason }
        });
      }
    });
  }

  return Object.freeze({
    limits,

    async executeParseJob(job, { workerId, signal, reportProgress = async () => {} }) {
      if (job.kind !== "parse" || !job.documentId || !job.knowledgeBaseId) {
        throw knowledgeError(KNOWLEDGE_ERROR_CODES.JOB_STATE_INVALID, "任务不是有效的文档解析任务", {
          status: 409
        });
      }
      const context = requireParseContext(await repositories.jobs.findParseContext(job));
      const sourceBytes = Number(context.verifiedBytes);
      if (!Number.isSafeInteger(sourceBytes) || sourceBytes < 1 || sourceBytes > limits.maxSourceBytes) {
        throw knowledgeError(KNOWLEDGE_ERROR_CODES.FILE_TOO_LARGE, "源文件大小不在解析范围内", {
          status: 413
        });
      }
      const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "xi-ai-kb-"));
      const sourcePath = path.join(tempDirectory, "source.bin");
      const normalizedPath = path.join(tempDirectory, "normalized.ndjson");
      const normalizedObjectKey = `knowledge/${context.accountId}/${context.knowledgeBaseId}/${context.documentId}/normalized/v1-index-${context.indexVersion}.ndjson`;
      const reservationPrefix = `document-parse:${context.documentId}:job:${job.id}:attempt:${job.attempts}`;
      const expiresAt = new Date(clock().getTime() + RESERVATION_TTL_MS);
      const reservations = [];
      let normalizedUploaded = false;
      let committed = false;
      try {
        await repositories.transaction(async (transaction) => {
          await requireOwnedJob(transaction, job.id, workerId);
          const marked = await transaction.jobs.markDocumentParsing(context.accountId, context.documentId);
          if (!marked) {
            throw knowledgeError(KNOWLEDGE_ERROR_CODES.JOB_STATE_INVALID, "文档无法进入解析状态", {
              status: 409
            });
          }
        });
        await reportProgress({ current: 1, total: 5 });

        const downloaded = await objectStore.downloadObjectToFile({
          objectKey: context.objectKey,
          versionId: context.objectVersionId,
          destinationPath: sourcePath,
          maxBytes: sourceBytes
        });
        if (downloaded.bytes !== sourceBytes ||
            (context.checksumSha256 && downloaded.checksumSha256 !== context.checksumSha256)) {
          throw knowledgeError(KNOWLEDGE_ERROR_CODES.UPLOAD_MISMATCH, "下载的源文件校验失败", {
            status: 409
          });
        }
        await reportProgress({ current: 2, total: 5 });

        const parsed = await parser({
          filePath: sourcePath,
          displayName: context.displayName,
          declaredMimeType: context.declaredMimeType,
          limits
        }, { timeoutMs: limits.parseTimeoutMs, signal });
        await reportProgress({ current: 3, total: 5 });

        if (parsed.needsOcr) {
          await repositories.transaction(async (transaction) => {
            await requireOwnedJob(transaction, job.id, workerId);
            const marked = await transaction.jobs.markDocumentNeedsOcr(
              context.accountId,
              context.documentId,
              parsed.parserVersion,
              parsed.mimeType
            );
            if (!marked) {
              throw knowledgeError(KNOWLEDGE_ERROR_CODES.JOB_STATE_INVALID, "文档无法进入待 OCR 状态", {
                status: 409
              });
            }
            const completed = await transaction.jobs.completeOwnedJob(job.id, workerId, {
              current: 5,
              total: 5
            });
            if (!completed) {
              throw knowledgeError(KNOWLEDGE_ERROR_CODES.JOB_LEASE_LOST, "任务租约已失效", {
                status: 409
              });
            }
          });
          committed = true;
          return { status: "needs_ocr", chunks: 0, normalizedBytes: "0" };
        }

        const chunks = createPersistedChunks(parsed.blocks, limits, { cryptoModule });
        const normalized = createNormalizedArtifact(
          parsed.parserVersion,
          parsed.mimeType,
          parsed.blocks,
          limits
        );
        await fs.writeFile(normalizedPath, normalized, { mode: 0o600, flag: "wx" });
        const chunkBytes = chunks.reduce((sum, chunk) => sum + BigInt(chunk.text_bytes), 0n);
        const reservationInputs = [
          {
            accountId: context.accountId,
            reservationKey: `${reservationPrefix}:normalized`,
            component: "normalized",
            bytes: String(normalized.byteLength),
            knowledgeBaseId: context.knowledgeBaseId,
            documentId: context.documentId,
            indexVersionId: context.indexVersionId,
            expiresAt,
            metadata: { jobId: job.id, parserVersion: parsed.parserVersion }
          },
          {
            accountId: context.accountId,
            reservationKey: `${reservationPrefix}:chunks`,
            component: "chunk_text",
            bytes: chunkBytes.toString(),
            knowledgeBaseId: context.knowledgeBaseId,
            documentId: context.documentId,
            indexVersionId: context.indexVersionId,
            expiresAt,
            metadata: { jobId: job.id, chunkCount: chunks.length }
          }
        ];
        await repositories.transaction(async (transaction) => {
          await requireOwnedJob(transaction, job.id, workerId);
          const quotaContext = await quotaService.lockContext(transaction, context.accountId);
          const existingChunks = await transaction.jobs.countDocumentChunks(
            context.accountId,
            context.documentId,
            context.indexVersionId
          );
          if (quotaContext.account.chunkCount - existingChunks + chunks.length >
              quotaContext.effectiveLimits.maxChunksPerAccount) {
            throw knowledgeError(KNOWLEDGE_ERROR_CODES.DOCUMENT_LIMIT_EXCEEDED, "账号 chunk 数量已达到上限", {
              status: 409,
              details: { limit: quotaContext.effectiveLimits.maxChunksPerAccount }
            });
          }
          for (const reservation of reservationInputs) {
            await quotaService.reserve(transaction, reservation);
            reservations.push(reservation);
          }
        });

        await objectStore.putObjectFromFile({
          objectKey: normalizedObjectKey,
          filePath: normalizedPath,
          bytes: normalized.byteLength,
          contentType: "application/x-ndjson; charset=utf-8"
        });
        normalizedUploaded = true;
        await reportProgress({ current: 4, total: 5 });

        await repositories.transaction(async (transaction) => {
          await requireOwnedJob(transaction, job.id, workerId);
          const quotaContext = await quotaService.lockContext(transaction, context.accountId, {
            requireActive: false
          });
          const existingChunks = await transaction.jobs.countDocumentChunks(
            context.accountId,
            context.documentId,
            context.indexVersionId
          );
          if (quotaContext.account.chunkCount - existingChunks + chunks.length >
              quotaContext.effectiveLimits.maxChunksPerAccount) {
            throw knowledgeError(KNOWLEDGE_ERROR_CODES.DOCUMENT_LIMIT_EXCEEDED, "账号 chunk 数量已达到上限", {
              status: 409,
              details: { limit: quotaContext.effectiveLimits.maxChunksPerAccount }
            });
          }
          await transaction.jobs.deleteDocumentChunks(
            context.accountId,
            context.documentId,
            context.indexVersionId
          );
          const inserted = await transaction.jobs.insertChunks({
            accountId: context.accountId,
            knowledgeBaseId: context.knowledgeBaseId,
            documentId: context.documentId,
            indexVersionId: context.indexVersionId,
            chunks
          });
          if (inserted !== chunks.length) {
            throw knowledgeError(KNOWLEDGE_ERROR_CODES.PARSER_FAILED, "文档分块写入不完整", {
              status: 500
            });
          }
          const completedDocument = await transaction.jobs.completeParsedDocument({
            accountId: context.accountId,
            documentId: context.documentId,
            parserVersion: parsed.parserVersion,
            verifiedMimeType: parsed.mimeType,
            normalizedObjectKey,
            normalizedBytes: String(normalized.byteLength)
          });
          if (!completedDocument) {
            throw knowledgeError(KNOWLEDGE_ERROR_CODES.JOB_STATE_INVALID, "文档解析状态已变化", {
              status: 409
            });
          }
          for (const reservation of reservationInputs) {
            await quotaService.settle(transaction, {
              ...reservation,
              context: quotaContext,
              actualBytes: reservation.bytes,
              metadata: { jobId: job.id, parserVersion: parsed.parserVersion }
            });
          }
          await transaction.jobs.refreshIndexLogicalBytes(
            context.accountId,
            context.knowledgeBaseId,
            context.indexVersionId
          );
          const completed = await transaction.jobs.completeOwnedJob(job.id, workerId, {
            current: 5,
            total: 5
          });
          if (!completed) {
            throw knowledgeError(KNOWLEDGE_ERROR_CODES.JOB_LEASE_LOST, "任务租约已失效", {
              status: 409
            });
          }
        });
        committed = true;
        return {
          status: "awaiting_embedding",
          chunks: chunks.length,
          normalizedBytes: String(normalized.byteLength)
        };
      } catch (error) {
        if (!committed) {
          await releaseReservations(reservations, "parse_job_failed").catch(() => {});
          if (normalizedUploaded) {
            await objectStore.deleteObject({ objectKey: normalizedObjectKey }).catch(() => {});
          }
        }
        throw error;
      } finally {
        await fs.rm(tempDirectory, { recursive: true, force: true }).catch(() => {});
      }
    },

    async markTerminalParseFailure(job, workerId, error) {
      return repositories.transaction(async (transaction) => {
        const current = await requireOwnedJob(transaction, job.id, workerId);
        const failedJob = await transaction.jobs.failOwnedJob({
          jobId: job.id,
          workerId,
          errorCode: error?.code || KNOWLEDGE_ERROR_CODES.PARSER_FAILED,
          errorDetail: boundedErrorDetail(error),
          retryable: false,
          retryDelaySeconds: 0
        });
        if (!failedJob || current.kind !== "parse" || !current.documentId) {
          throw knowledgeError(KNOWLEDGE_ERROR_CODES.JOB_LEASE_LOST, "任务租约已失效", {
            status: 409
          });
        }
        await transaction.jobs.markDocumentParseFailed(
          current.accountId,
          current.documentId,
          "knowledge-parser/1",
          failedJob.errorCode,
          failedJob.errorDetail
        );
        return failedJob;
      });
    }
  });
}
