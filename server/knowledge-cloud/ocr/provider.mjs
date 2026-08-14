import fs from "node:fs/promises";
import path from "node:path";
import {
  KNOWLEDGE_ERROR_CODES,
  KnowledgeError,
  knowledgeError
} from "../errors.mjs";

const JSON_CONTENT_TYPE = /(^|\s|;)application\/(?:[a-z0-9.+-]*\+)?json(?:\s*;|$)/i;

function timeoutSignal(timeoutMs, externalSignal) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("ocr_timeout")), timeoutMs);
  timeout.unref?.();
  const abort = () => controller.abort(externalSignal?.reason);
  externalSignal?.addEventListener("abort", abort, { once: true });
  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timeout);
      externalSignal?.removeEventListener("abort", abort);
    }
  };
}

async function readBoundedBody(response, maxBytes) {
  if (!response.body) return Buffer.alloc(0);
  const chunks = [];
  let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.byteLength;
    if (bytes > maxBytes) {
      throw knowledgeError(
        KNOWLEDGE_ERROR_CODES.OCR_OUTPUT_INVALID,
        "OCR provider response exceeded the configured output limit",
        { status: 502, retryable: false }
      );
    }
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks, bytes);
}

function normalizeProviderText(payload, maxOutputBytes) {
  const text = typeof payload?.text === "string" ? payload.text.replaceAll("\u0000", "") : "";
  const bytes = Buffer.byteLength(text, "utf8");
  if (!text.trim() || bytes < 1 || bytes > maxOutputBytes) {
    throw knowledgeError(
      KNOWLEDGE_ERROR_CODES.OCR_OUTPUT_INVALID,
      "OCR provider returned invalid or empty text",
      { status: 502, retryable: false }
    );
  }
  return { text, bytes };
}

export function createDisabledKnowledgeOcrProvider() {
  return Object.freeze({
    enabled: false,
    id: "disabled",
    async recognize() {
      throw knowledgeError(KNOWLEDGE_ERROR_CODES.OCR_DISABLED, "Knowledge OCR is disabled", {
        status: 503,
        retryable: false
      });
    }
  });
}

export function createKnowledgeOcrProvider(config, { fetchImpl = globalThis.fetch } = {}) {
  if (!config?.enabled) return createDisabledKnowledgeOcrProvider();
  if (config.provider !== "http-json-v1" || typeof fetchImpl !== "function") {
    throw new TypeError("Knowledge OCR requires the http-json-v1 provider and fetch");
  }

  return Object.freeze({
    enabled: true,
    id: config.provider,
    async recognize({ filePath, displayName, mimeType, signal }) {
      const resolvedPath = path.resolve(String(filePath || ""));
      const stat = await fs.stat(resolvedPath);
      if (!stat.isFile() || stat.size < 1 || stat.size > config.maxInputBytes) {
        throw knowledgeError(
          KNOWLEDGE_ERROR_CODES.FILE_TOO_LARGE,
          "OCR source file is outside the configured input limit",
          { status: 413, retryable: false }
        );
      }
      const source = await fs.readFile(resolvedPath);
      const body = new FormData();
      body.set("file", new Blob([source], { type: mimeType || "application/pdf" }), path.basename(displayName || "source.pdf"));
      body.set("response_format", "text-json-v1");
      const bounded = timeoutSignal(config.requestTimeoutMs, signal);
      const startedAt = Date.now();
      try {
        const response = await fetchImpl(config.endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            Accept: "application/json"
          },
          body,
          redirect: "error",
          signal: bounded.signal
        });
        if (!response.ok) {
          throw knowledgeError(
            KNOWLEDGE_ERROR_CODES.OCR_PROVIDER_ERROR,
            "OCR provider request failed",
            { status: 502 }
          );
        }
        if (!JSON_CONTENT_TYPE.test(String(response.headers.get("content-type") || ""))) {
          throw knowledgeError(
            KNOWLEDGE_ERROR_CODES.OCR_OUTPUT_INVALID,
            "OCR provider returned an unsupported response type",
            { status: 502, retryable: false }
          );
        }
        const raw = await readBoundedBody(response, config.maxOutputBytes);
        let payload;
        try {
          payload = JSON.parse(raw.toString("utf8"));
        } catch {
          throw knowledgeError(
            KNOWLEDGE_ERROR_CODES.OCR_OUTPUT_INVALID,
            "OCR provider returned malformed JSON",
            { status: 502, retryable: false }
          );
        }
        const output = normalizeProviderText(payload, config.maxOutputBytes);
        return {
          ...output,
          provider: config.provider,
          durationMs: Math.max(0, Date.now() - startedAt)
        };
      } catch (error) {
        if (error instanceof KnowledgeError) throw error;
        if (bounded.signal.aborted && !signal?.aborted) {
          throw knowledgeError(KNOWLEDGE_ERROR_CODES.OCR_TIMEOUT, "OCR provider timed out", {
            status: 504
          });
        }
        throw knowledgeError(KNOWLEDGE_ERROR_CODES.OCR_PROVIDER_ERROR, "OCR provider request failed", {
          status: 502,
          cause: error
        });
      } finally {
        bounded.cleanup();
      }
    }
  });
}
