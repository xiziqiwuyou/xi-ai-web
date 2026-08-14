import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { KNOWLEDGE_ERROR_CODES, knowledgeError } from "../errors.mjs";

const OCR_MAX_DISPLAY_NAME = 512;

function boundedText(value, maxBytes) {
  const text = String(value || "").replaceAll("\u0000", "");
  if (!text.trim() || Buffer.byteLength(text, "utf8") > maxBytes) {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.OCR_OUTPUT_INVALID, "OCR output is empty or too large", {
      status: 502,
      retryable: false
    });
  }
  return text;
}

function requireOcrJob(job) {
  if (job?.kind !== "ocr" || !job.documentId || !job.knowledgeBaseId) {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.JOB_STATE_INVALID, "Job is not a valid OCR task", {
      status: 409,
      retryable: false
    });
  }
}

async function requireOwnedJob(transaction, jobId, workerId) {
  const current = await transaction.jobs.findJob(jobId, { forUpdate: true });
  if (!current || current.status !== "running" || current.leaseOwner !== workerId) {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.JOB_LEASE_LOST, "Job lease has expired", {
      status: 409
    });
  }
  return current;
}

export function createKnowledgeOcrService({
  repositories,
  objectStore,
  provider,
  clock = () => new Date(),
  cryptoModule = crypto,
  maxOutputBytes = 8 * 1024 * 1024
}) {
  if (!repositories?.jobs || typeof repositories.transaction !== "function") {
    throw new TypeError("Knowledge OCR service requires job repositories and transactions");
  }
  if (!objectStore?.downloadObjectToFile || !objectStore?.putObjectFromFile || !objectStore?.deleteObject) {
    throw new TypeError("Knowledge OCR service requires download and upload object operations");
  }
  if (!provider?.enabled || typeof provider.recognize !== "function") {
    throw knowledgeError(KNOWLEDGE_ERROR_CODES.OCR_DISABLED, "Knowledge OCR is disabled", {
      status: 503,
      retryable: false
    });
  }

  return Object.freeze({
    enabled: true,

    async executeOcrJob(job, { workerId, signal, reportProgress = async () => {} }) {
      requireOcrJob(job);
      const context = await repositories.jobs.findOcrContext(job);
      if (!context || context.baseStatus !== "active" || context.documentStatus !== "needs_ocr") {
        throw knowledgeError(KNOWLEDGE_ERROR_CODES.JOB_STATE_INVALID, "Document is not waiting for OCR", {
          status: 409,
          retryable: false
        });
      }
      const sourceBytes = Number(context.verifiedBytes);
      if (!Number.isSafeInteger(sourceBytes) || sourceBytes < 1) {
        throw knowledgeError(KNOWLEDGE_ERROR_CODES.FILE_TOO_LARGE, "OCR source size is invalid", {
          status: 413,
          retryable: false
        });
      }
      const tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "xi-ai-kb-ocr-"));
      const sourcePath = path.join(tempDirectory, "source.bin");
      const outputPath = path.join(tempDirectory, "ocr.txt");
      const outputObjectKey = `knowledge/${context.accountId}/${context.knowledgeBaseId}/${context.documentId}/ocr/v1-job-${job.id}.txt`;
      let outputUploaded = false;
      let committed = false;
      try {
        await repositories.transaction(async (transaction) => {
          await requireOwnedJob(transaction, job.id, workerId);
          if (!(await transaction.jobs.markDocumentOcrRunning(context.accountId, context.documentId))) {
            throw knowledgeError(KNOWLEDGE_ERROR_CODES.JOB_STATE_INVALID, "Document cannot enter OCR running state", {
              status: 409,
              retryable: false
            });
          }
        });
        await reportProgress({ current: 1, total: 4 });

        const downloaded = await objectStore.downloadObjectToFile({
          objectKey: context.objectKey,
          versionId: context.objectVersionId,
          destinationPath: sourcePath,
          maxBytes: sourceBytes
        });
        if (
          downloaded.bytes !== sourceBytes ||
          (context.checksumSha256 && downloaded.checksumSha256 !== context.checksumSha256)
        ) {
          throw knowledgeError(KNOWLEDGE_ERROR_CODES.UPLOAD_MISMATCH, "OCR source checksum validation failed", {
            status: 409,
            retryable: false
          });
        }
        await reportProgress({ current: 2, total: 4 });

        const recognized = await provider.recognize({
          filePath: sourcePath,
          displayName: String(context.displayName || "source.pdf").slice(0, OCR_MAX_DISPLAY_NAME),
          mimeType: context.verifiedMimeType || context.declaredMimeType || "application/pdf",
          signal
        });
        const text = boundedText(recognized.text, maxOutputBytes);
        const outputBytes = Buffer.byteLength(text, "utf8");
        await fs.writeFile(outputPath, text, { encoding: "utf8", mode: 0o600, flag: "wx" });
        await objectStore.putObjectFromFile({
          objectKey: outputObjectKey,
          filePath: outputPath,
          bytes: outputBytes,
          contentType: "text/plain; charset=utf-8"
        });
        outputUploaded = true;
        await reportProgress({ current: 3, total: 4 });

        const checksumSha256 = cryptoModule
          .createHash("sha256")
          .update(text, "utf8")
          .digest("hex");
        await repositories.transaction(async (transaction) => {
          await requireOwnedJob(transaction, job.id, workerId);
          const marked = await transaction.jobs.markDocumentOcrReady({
            accountId: context.accountId,
            documentId: context.documentId,
            provider: recognized.provider || provider.id,
            objectKey: outputObjectKey,
            bytes: outputBytes,
            checksumSha256,
            durationMs: recognized.durationMs
          });
          if (!marked) {
            throw knowledgeError(KNOWLEDGE_ERROR_CODES.JOB_STATE_INVALID, "Document OCR state changed", {
              status: 409
            });
          }
          const parseJob = await transaction.jobs.enqueueJob({
            id: cryptoModule.randomUUID(),
            accountId: context.accountId,
            knowledgeBaseId: context.knowledgeBaseId,
            documentId: context.documentId,
            dedupeKey: `document-parse:${context.documentId}`,
            kind: "parse"
          });
          const completed = await transaction.jobs.completeOwnedJob(job.id, workerId, {
            current: 4,
            total: 4
          });
          if (!completed) {
            throw knowledgeError(KNOWLEDGE_ERROR_CODES.JOB_LEASE_LOST, "Job lease has expired", {
              status: 409
            });
          }
          return parseJob;
        });
        committed = true;
        return { status: "ready", outputBytes: String(outputBytes) };
      } finally {
        if (!committed && outputUploaded) {
          await objectStore.deleteObject({ objectKey: outputObjectKey }).catch(() => undefined);
        }
        await fs.rm(tempDirectory, { recursive: true, force: true }).catch(() => undefined);
      }
    }
  });
}
