import { parentPort, workerData } from "node:worker_threads";
import { parseKnowledgeDocument } from "./index.mjs";

try {
  const result = await parseKnowledgeDocument(workerData);
  parentPort.postMessage({ ok: true, result });
} catch (error) {
  parentPort.postMessage({
    ok: false,
    error: {
      code: typeof error?.code === "string" ? error.code : "KB_PARSER_FAILED",
      message: typeof error?.message === "string" ? error.message : "文档解析失败",
      details: error?.details && typeof error.details === "object" ? error.details : undefined
    }
  });
}
