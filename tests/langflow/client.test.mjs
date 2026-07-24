import assert from "node:assert/strict";
import test from "node:test";
import {
  LangflowClientError,
  normalizeLangflowEvent,
  readLangflowEvents,
  startLangflowWorkflow
} from "../../server/langflow/client.mjs";

function responseFromChunks(chunks, contentType = "text/event-stream") {
  const encoder = new TextEncoder();
  const bytes = chunks.map((chunk) => encoder.encode(chunk));
  const body = new ReadableStream({
    start(controller) {
      bytes.forEach((chunk) => controller.enqueue(chunk));
      controller.close();
    }
  });
  return new Response(body, {
    status: 200,
    headers: { "content-type": contentType }
  });
}

async function collectEvents(response) {
  const events = [];
  for await (const event of readLangflowEvents(response)) events.push(event);
  return events;
}

const config = {
  enabled: true,
  configured: true,
  available: true,
  baseUrl: "https://langflow.example.test/root",
  apiKey: "server-langflow-key",
  workflowPath: "/api/v2/workflows",
  timeoutMs: 500
};

test("normalizes common Langflow events without exposing provider details", () => {
  assert.deepEqual(normalizeLangflowEvent("token", { token: "hello" }), {
    type: "token",
    token: "hello"
  });
  assert.deepEqual(normalizeLangflowEvent("end", { output: "done" }), {
    type: "done",
    text: "done"
  });
  assert.deepEqual(normalizeLangflowEvent("error", { message: "failed" }), {
    type: "error",
    error: "failed"
  });
});

test("reads SSE frames across chunk boundaries and flushes the UTF-8 tail", async () => {
  const encoder = new TextEncoder();
  const source = "event: token\ndata: {\"token\":\"你好\"}\n\n";
  const encoded = encoder.encode(source);
  const split = encoded.findIndex((value, index) => index > 5 && value > 127);
  const response = new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoded.slice(0, Math.max(1, split)));
        controller.enqueue(encoded.slice(Math.max(1, split)));
        controller.close();
      }
    }),
    { headers: { "content-type": "text/event-stream" } }
  );

  assert.deepEqual(await collectEvents(response), [{ type: "token", token: "你好" }]);
});

test("reads newline-delimited JSON responses", async () => {
  const response = responseFromChunks(
    ['{"delta":"A"}\n', '{"event":"end","text":"AB"}\n'],
    "application/x-ndjson"
  );
  assert.deepEqual(await collectEvents(response), [
    { type: "token", token: "A" },
    { type: "done", text: "AB" }
  ]);
});

test("forwards the configured endpoint, server key, BYOK headers, and mapped model", async () => {
  let captured;
  const result = await startLangflowWorkflow(
    config,
    {
      flowId: "published-flow",
      input: "run this",
      sessionId: "session-1",
      connection: { baseUrl: "https://user.example.test/v1", apiKey: "user-secret" },
      modelId: "catalog-model-id",
      modelName: "actual-provider-model",
      vendor: "openai"
    },
    {
      fetchImpl: async (url, options) => {
        captured = { url, options };
        return responseFromChunks(["event: done\ndata: {}\n\n"]);
      }
    }
  );

  assert.equal(captured.url, "https://langflow.example.test/root/api/v2/workflows");
  assert.equal(captured.options.method, "POST");
  assert.equal(captured.options.headers["x-api-key"], "server-langflow-key");
  assert.equal(captured.options.headers["X-LANGFLOW-GLOBAL-VAR-XI_API_KEY"], "user-secret");
  assert.equal(captured.options.headers["X-LANGFLOW-GLOBAL-VAR-XI_MODEL_ID"], "catalog-model-id");
  assert.equal(captured.options.headers["X-LANGFLOW-GLOBAL-VAR-XI_MODEL_NAME"], "actual-provider-model");
  assert.deepEqual(JSON.parse(captured.options.body), {
    flow_id: "published-flow",
    input_value: "run this",
    mode: "stream",
    session_id: "session-1",
    stream_protocol: "langflow"
  });
  result.dispose();
});

test("honors an overridden workflow endpoint path", async () => {
  let requestedUrl = "";
  const result = await startLangflowWorkflow(
    { ...config, workflowPath: "/custom/run" },
    { flowId: "flow", input: "x", sessionId: "s", connection: {}, modelId: "m" },
    {
      fetchImpl: async (url) => {
        requestedUrl = url;
        return responseFromChunks(["data: [DONE]\n\n"]);
      }
    }
  );
  assert.equal(requestedUrl, "https://langflow.example.test/root/custom/run");
  result.dispose();
});

test("returns a timeout error when upstream never resolves", async () => {
  await assert.rejects(
    startLangflowWorkflow(
      { ...config, timeoutMs: 20 },
      { flowId: "flow", input: "x", sessionId: "s", connection: {}, modelId: "m" },
      {
        fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          }, { once: true });
        })
      }
    ),
    (error) => error instanceof LangflowClientError
      && error.code === "LANGFLOW_TIMEOUT"
      && error.status === 504
  );
});

test("honors a caller cancellation that was already requested", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    startLangflowWorkflow(
      config,
      { flowId: "flow", input: "x", sessionId: "s", connection: {}, modelId: "m" },
      {
        signal: controller.signal,
        fetchImpl: async (_url, { signal }) => {
          assert.equal(signal.aborted, true);
          const error = new Error("aborted");
          error.name = "AbortError";
          throw error;
        }
      }
    ),
    (error) => error instanceof LangflowClientError
      && error.code === "LANGFLOW_CANCELLED"
      && error.status === 499
  );
});
