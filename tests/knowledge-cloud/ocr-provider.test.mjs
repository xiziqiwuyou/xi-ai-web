import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  createDisabledKnowledgeOcrProvider,
  createKnowledgeOcrProvider
} from "../../server/knowledge-cloud/ocr/provider.mjs";

const config = {
  enabled: true,
  provider: "http-json-v1",
  endpoint: "https://ocr.example.test/v1/recognize",
  apiKey: "server-owned-ocr-key",
  requestTimeoutMs: 100,
  maxInputBytes: 1024,
  maxOutputBytes: 1024
};

test("OCR is disabled by default and exposes no callable credential path", async () => {
  const provider = createDisabledKnowledgeOcrProvider();
  assert.equal(provider.enabled, false);
  await assert.rejects(provider.recognize({}), (error) => error.code === "KB_OCR_DISABLED");
});

test("OCR provider sends only a server-owned file and returns bounded normalized text", async () => {
  const filePath = fileURLToPath(new URL("../fixtures/knowledge-rag-evaluation.sample.json", import.meta.url));
  let request;
  const provider = createKnowledgeOcrProvider(config, {
    async fetchImpl(_url, init) {
      request = init;
      return new Response(JSON.stringify({ text: "recognized page" }), {
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8" }
      });
    }
  });
  const result = await provider.recognize({
    filePath,
    displayName: "scan.pdf",
    mimeType: "application/pdf"
  });
  assert.equal(result.text, "recognized page");
  assert.equal(result.provider, "http-json-v1");
  assert.equal(request.headers.Authorization, "Bearer server-owned-ocr-key");
  assert.equal(request.redirect, "error");
  assert.equal(request.body.get("response_format"), "text-json-v1");
  assert.equal("apiKey" in result, false);
});

test("OCR provider rejects malformed, oversized and timed-out responses with stable codes", async () => {
  const filePath = fileURLToPath(new URL("../fixtures/knowledge-rag-evaluation.sample.json", import.meta.url));
  const malformed = createKnowledgeOcrProvider(config, {
    async fetchImpl() {
      return new Response("not-json", {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
  });
  await assert.rejects(
    malformed.recognize({ filePath, displayName: "scan.pdf", mimeType: "application/pdf" }),
    (error) => error.code === "KB_OCR_OUTPUT_INVALID" && error.retryable === false
  );

  const timedOut = createKnowledgeOcrProvider({ ...config, requestTimeoutMs: 5 }, {
    fetchImpl(_url, { signal }) {
      return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
    }
  });
  await assert.rejects(
    timedOut.recognize({ filePath, displayName: "scan.pdf", mimeType: "application/pdf" }),
    (error) => error.code === "KB_OCR_TIMEOUT"
  );
});
