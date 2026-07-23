import { Worker } from "node:worker_threads";
import { KNOWLEDGE_ERROR_CODES } from "../errors.mjs";
import { parserError } from "./parser-error.mjs";

export function runKnowledgeParserIsolated(input, { timeoutMs, signal } = {}) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./thread-entry.mjs", import.meta.url), {
      workerData: input,
      resourceLimits: {
        maxOldGenerationSizeMb: 768,
        maxYoungGenerationSizeMb: 64,
        stackSizeMb: 8
      }
    });
    let settled = false;
    const settle = async (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      await worker.terminate().catch(() => {});
      callback(value);
    };
    const onAbort = () => {
      void settle(
        reject,
        parserError(KNOWLEDGE_ERROR_CODES.JOB_LEASE_LOST, "解析任务已取消")
      );
    };
    const timer = setTimeout(() => {
      void settle(
        reject,
        parserError(KNOWLEDGE_ERROR_CODES.PARSER_TIMEOUT, "文档解析超时", {
          details: { timeoutMs }
        })
      );
    }, timeoutMs);
    timer.unref?.();
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
    worker.once("message", (message) => {
      if (message?.ok) {
        void settle(resolve, message.result);
        return;
      }
      void settle(
        reject,
        parserError(
          message?.error?.code || KNOWLEDGE_ERROR_CODES.PARSER_FAILED,
          message?.error?.message || "文档解析失败",
          { details: message?.error?.details }
        )
      );
    });
    worker.once("error", (error) => {
      void settle(
        reject,
        parserError(KNOWLEDGE_ERROR_CODES.PARSER_FAILED, "解析线程异常退出", { cause: error })
      );
    });
    worker.once("exit", (code) => {
      if (!settled && code !== 0) {
        void settle(
          reject,
          parserError(KNOWLEDGE_ERROR_CODES.PARSER_FAILED, "解析线程异常退出", {
            details: { exitCode: code }
          })
        );
      }
    });
  });
}
