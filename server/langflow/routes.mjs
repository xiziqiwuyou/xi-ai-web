import crypto from "node:crypto";
import express from "express";
import {
  LangflowClientError,
  readLangflowEvents,
  startLangflowWorkflow
} from "./client.mjs";

function boundedText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function publicWorkflow(workflow) {
  return {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description || "",
    welcomeMessage: workflow.welcomeMessage || "",
    inputPlaceholder: workflow.inputPlaceholder || "",
    tags: Array.isArray(workflow.tags) ? workflow.tags.slice(0, 6) : [],
    order: workflow.order,
    enabled: workflow.enabled !== false
  };
}

function sse(res, event, payload) {
  if (res.writableEnded || res.destroyed) return;
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function redactText(value, secrets = []) {
  let text = boundedText(value, 1200) || "Langflow 工作流执行失败";
  for (const secret of secrets.filter(Boolean)) {
    text = text.split(String(secret)).join("[REDACTED]");
  }
  return text;
}

function createRateLimiter({ windowMs, maxRequests, now = () => Date.now() }) {
  const buckets = new Map();
  return (key) => {
    const timestamp = now();
    for (const [bucketKey, bucket] of buckets) {
      if (bucket.resetAt <= timestamp) buckets.delete(bucketKey);
    }
    const current = buckets.get(key);
    if (!current || current.resetAt <= timestamp) {
      const next = { count: 1, resetAt: timestamp + windowMs };
      buckets.set(key, next);
      return { allowed: true, retryAfterSeconds: 0 };
    }
    current.count += 1;
    if (current.count <= maxRequests) return { allowed: true, retryAfterSeconds: 0 };
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - timestamp) / 1000))
    };
  };
}

function positiveInt(value, fallback, max) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

export function createLangflowRouter({
  config,
  getPublishedWorkflows,
  resolveRuntime,
  fetchImpl = fetch,
  rateLimitWindowMs = positiveInt(process.env.LANGFLOW_RATE_LIMIT_WINDOW_MS, 60000, 3600000),
  rateLimitMaxRequests = positiveInt(process.env.LANGFLOW_RATE_LIMIT_MAX_REQUESTS, 12, 120)
}) {
  const router = express.Router();
  const takeRateLimit = createRateLimiter({
    windowMs: rateLimitWindowMs,
    maxRequests: rateLimitMaxRequests
  });

  router.use(express.json({ limit: "96kb" }));

  router.get("/status", (req, res) => {
    const workflows = getPublishedWorkflows().filter((workflow) => workflow.enabled !== false);
    res.setHeader("Cache-Control", "no-store");
    res.json({
      enabled: Boolean(config.enabled),
      available: Boolean(config.available),
      workflowCount: workflows.length
    });
  });

  router.post("/:workflowId/stream", async (req, res, next) => {
    const workflowId = boundedText(req.params.workflowId, 120);
    const workflow = getPublishedWorkflows().find(
      (item) => item.id === workflowId && item.enabled !== false
    );
    if (!workflow) {
      return res.status(404).json({ error: "工作流不存在或尚未发布" });
    }

    const rate = takeRateLimit(`${req.ip || req.socket.remoteAddress || "unknown"}:${workflow.id}`);
    if (!rate.allowed) {
      res.setHeader("Retry-After", String(rate.retryAfterSeconds));
      return res.status(429).json({ error: "工作流请求过于频繁，请稍后再试" });
    }

    const input = boundedText(req.body?.input, 24000);
    if (!input) return res.status(400).json({ error: "请输入工作流消息" });

    let runtime;
    try {
      runtime = resolveRuntime(req.body || {});
    } catch (error) {
      return next(error);
    }

    const sessionId = boundedText(req.body?.sessionId, 180) || crypto.randomUUID();
    const controller = new AbortController();
    req.once("aborted", () => controller.abort());
    res.once("close", () => controller.abort());

    let upstream;
    try {
      upstream = await startLangflowWorkflow(
        config,
        {
          flowId: workflow.flowId,
          input,
          sessionId,
          connection: runtime.connection,
          modelId: runtime.entry.id,
          modelName: runtime.entry.model,
          vendor: runtime.entry.vendor
        },
        { fetchImpl, signal: controller.signal }
      );
    } catch (error) {
      if (error instanceof LangflowClientError) {
        return res.status(error.status || 502).json({
          error: {
            code: error.code,
            message: redactText(error.message, [config.apiKey, runtime.connection.apiKey])
          }
        });
      }
      return next(error);
    }

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();
    sse(res, "meta", {
      sessionId,
      workflow: publicWorkflow(workflow),
      requestId: crypto.randomUUID()
    });

    let output = "";
    let finished = false;
    try {
      for await (const event of readLangflowEvents(upstream.response)) {
        if (event.type === "token") {
          output += event.token;
          if (event.token) sse(res, "token", { token: event.token });
          continue;
        }
        if (event.type === "error") {
          throw new LangflowClientError(event.error);
        }
        if (event.type === "done") {
          if (!output && event.text) {
            output = event.text;
            sse(res, "token", { token: event.text });
          }
          finished = true;
        }
      }
      sse(res, "done", { sessionId, text: output, finished });
    } catch (error) {
      if (!controller.signal.aborted) {
        sse(res, "error", {
          error: redactText(error?.message, [config.apiKey, runtime.connection.apiKey])
        });
      }
    } finally {
      upstream.dispose();
      if (!res.writableEnded && !res.destroyed) res.end();
    }
  });

  return router;
}
