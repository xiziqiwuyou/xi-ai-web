import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import {
  createSseTokenBuffer,
  writeSseEventWithBackpressure
} from "../../server/sse-token-buffer.mjs";
import { consumeSseEvents } from "../../server/providers/types.mjs";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

test("token buffer coalesces fragments and flushes the exact tail before finish", async () => {
  const chunks = [];
  const buffer = createSseTokenBuffer({
    flushMs: 100,
    maxWaitMs: 100,
    onFlush: async (chunk) => chunks.push(chunk)
  });

  await buffer.push("stable");
  await buffer.push(" ");
  await buffer.push("stream");
  await buffer.finish();

  assert.deepEqual(chunks, ["stable stream"]);
  assert.equal(buffer.pendingChars, 0);
});

test("token buffer flushes on cadence without waiting for provider completion", async () => {
  const flushed = deferred();
  const startedAt = Date.now();
  const buffer = createSseTokenBuffer({
    flushMs: 16,
    maxWaitMs: 40,
    onFlush: async (chunk) => flushed.resolve({ chunk, elapsedMs: Date.now() - startedAt })
  });

  await buffer.push("first");
  const result = await Promise.race([
    flushed.promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("timed flush did not run")), 250))
  ]);
  await buffer.finish();

  assert.equal(result.chunk, "first");
  assert.ok(result.elapsedMs < 200, `timed flush took ${result.elapsedMs}ms`);
});

test("token buffer preserves write ordering while downstream is backpressured", async () => {
  const firstWrite = deferred();
  const releaseFirst = deferred();
  const chunks = [];
  const buffer = createSseTokenBuffer({
    maxChars: 128,
    maxQueueChars: 256,
    onFlush: async (chunk) => {
      chunks.push(chunk);
      if (chunks.length === 1) {
        firstWrite.resolve();
        await releaseFirst.promise;
      }
    }
  });

  const firstPush = buffer.push("a".repeat(128));
  await firstWrite.promise;
  const secondPush = buffer.push("b".repeat(128));
  releaseFirst.resolve();
  await Promise.all([firstPush, secondPush]);
  await buffer.finish();

  assert.deepEqual(chunks, ["a".repeat(128), "b".repeat(128)]);
});

test("token buffer rejects an unbounded queue and reports the failure once", async () => {
  const entered = deferred();
  const release = deferred();
  const errors = [];
  const buffer = createSseTokenBuffer({
    maxChars: 128,
    maxQueueChars: 128,
    onFlush: async () => {
      entered.resolve();
      await release.promise;
    },
    onError: (error) => errors.push(error.message)
  });

  const firstPush = buffer.push("a".repeat(128));
  await entered.promise;
  await assert.rejects(buffer.push("b"), /queue limit/u);
  release.resolve();
  await firstPush;
  buffer.cancel();

  assert.deepEqual(errors, ["SSE token buffer queue limit reached"]);
});

test("token buffer cancellation discards pending text and clears its timer", async () => {
  const chunks = [];
  const buffer = createSseTokenBuffer({
    flushMs: 16,
    maxWaitMs: 40,
    onFlush: async (chunk) => chunks.push(chunk)
  });

  await buffer.push("discard me");
  buffer.cancel();
  await new Promise((resolve) => setTimeout(resolve, 60));

  assert.deepEqual(chunks, []);
  assert.equal(buffer.pendingChars, 0);
});

class BackpressureResponse extends EventEmitter {
  writableNeedDrain = true;
  writableEnded = false;
  destroyed = false;
  writes = [];

  write(value) {
    this.writes.push(value);
    return false;
  }
}

test("SSE writer waits for drain and writes one complete event frame", async () => {
  const response = new BackpressureResponse();
  const writing = writeSseEventWithBackpressure(response, "token", { token: "hello" }, {
    timeoutMs: 100
  });
  response.writableNeedDrain = false;
  response.emit("drain");
  await writing;

  assert.deepEqual(response.writes, ['event: token\ndata: {"token":"hello"}\n\n']);
  assert.equal(response.listenerCount("drain"), 0);
  assert.equal(response.listenerCount("close"), 0);
});

test("SSE writer rejects drain timeout and request cancellation", async () => {
  const timedOutResponse = new BackpressureResponse();
  await assert.rejects(
    writeSseEventWithBackpressure(timedOutResponse, "token", { token: "slow" }, { timeoutMs: 10 }),
    /backpressure timeout/u
  );

  const cancelledResponse = new BackpressureResponse();
  const controller = new AbortController();
  const writing = writeSseEventWithBackpressure(
    cancelledResponse,
    "token",
    { token: "cancel" },
    { signal: controller.signal, timeoutMs: 100 }
  );
  controller.abort();
  await assert.rejects(writing, { name: "AbortError" });
});

test("provider SSE parsing awaits an asynchronous consumer before reading the next frame", async () => {
  const releaseFirst = deferred();
  const received = [];
  const response = new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("event: delta\ndata: first\n\nevent: delta\ndata: second\n\n"));
      controller.close();
    }
  }), {
    headers: { "content-type": "text/event-stream" }
  });

  const consumed = consumeSseEvents(response, async ({ data }) => {
    received.push(data);
    if (data === "first") await releaseFirst.promise;
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(received, ["first"]);
  releaseFirst.resolve();
  await consumed;
  assert.deepEqual(received, ["first", "second"]);
});
