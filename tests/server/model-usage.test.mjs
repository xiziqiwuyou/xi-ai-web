import assert from "node:assert/strict";
import fs from "node:fs";
import { EventEmitter } from "node:events";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createModelUsageStore, trackModelUsageResponse } from "../../server/model-usage.mjs";

test("model usage log omits request secrets and aggregates real durations", (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "xi-ai-model-usage-"));
  const filePath = path.join(dataDir, "model-usage.jsonl");
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const store = createModelUsageStore({ filePath });

  store.record({
    modelId: "chat-main",
    displayName: "Old Display Name",
    requestModel: "gpt-5.4-mini",
    vendor: "openai",
    operation: "chat",
    status: "success",
    durationMs: 1200,
    createdAt: "2026-07-29T10:00:00.000Z",
    apiKey: "sk-should-never-be-written",
    baseUrl: "https://private.example.test",
    prompt: "private prompt"
  });
  store.record({
    modelId: "chat-main",
    displayName: "Old Display Name",
    requestModel: "gpt-5.4-mini",
    vendor: "openai",
    operation: "chat-title",
    status: "error",
    durationMs: 1800,
    createdAt: "2026-07-29T10:05:00.000Z"
  });

  const rawLog = fs.readFileSync(filePath, "utf8");
  assert.doesNotMatch(rawLog, /sk-should-never-be-written|private\.example|private prompt/);
  const summaries = store.summarize({
    catalog: [{ id: "chat-main", label: "GPT Mini", model: "gpt-5.4-mini", vendorLabel: "OpenAI" }]
  });
  assert.deepEqual(summaries, [{
    modelId: "chat-main",
    displayName: "GPT Mini",
    requestModel: "gpt-5.4-mini",
    vendor: "OpenAI",
    calls: 2,
    successCalls: 1,
    errorCalls: 1,
    cancelledCalls: 0,
    totalDurationMs: 3000,
    lastCalledAt: "2026-07-29T10:05:00.000Z",
    averageDurationMs: 1500
  }]);
});

test("response tracking records one completed model invocation", (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "xi-ai-model-tracker-"));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const store = createModelUsageStore({ filePath: path.join(dataDir, "model-usage.jsonl") });
  const response = new EventEmitter();
  response.statusCode = 200;
  response.writableEnded = true;
  const timestamps = [1000, 2500];

  trackModelUsageResponse({
    response,
    store,
    entry: { id: "tracked-model", label: "Tracked", model: "tracked-v1", vendor: "openai" },
    operation: "chat",
    clock: () => timestamps.shift()
  });
  response.emit("finish");
  response.emit("close");

  const events = store.readEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].status, "success");
  assert.equal(events[0].durationMs, 1500);
});

test("model usage summaries skip malformed log records", (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "xi-ai-model-usage-malformed-"));
  const filePath = path.join(dataDir, "model-usage.jsonl");
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  fs.writeFileSync(filePath, [
    "not-json",
    JSON.stringify({ modelId: "missing-request-model" }),
    JSON.stringify({
      modelId: "valid-model",
      displayName: "Valid Model",
      requestModel: "valid-v1",
      vendor: "openai",
      operation: "chat",
      status: "success",
      durationMs: 900,
      createdAt: "2026-07-29T11:00:00.000Z"
    })
  ].join("\n"));

  const store = createModelUsageStore({ filePath });
  const summaries = store.summarize();

  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].modelId, "valid-model");
  assert.equal(summaries[0].calls, 1);
});

test("model usage write failures never break response completion", (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "xi-ai-model-usage-unwritable-"));
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const store = createModelUsageStore({ filePath: dataDir });
  const response = new EventEmitter();
  response.statusCode = 200;
  response.writableEnded = true;

  trackModelUsageResponse({
    response,
    store,
    entry: { id: "tracked-model", label: "Tracked", model: "tracked-v1", vendor: "openai" },
    operation: "chat"
  });

  assert.doesNotThrow(() => response.emit("finish"));
  assert.doesNotThrow(() => response.emit("close"));
  assert.deepEqual(store.readEvents(), []);
});
