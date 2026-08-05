import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createImageGenerationTimingStore,
  fallbackImageDurationMs
} from "../../server/image-generation-timing.mjs";

function timingRecord(index, overrides = {}) {
  return {
    modelId: "image-main",
    mode: "generate",
    resolution: "1K",
    aspectRatio: "1:1",
    count: 1,
    status: "completed",
    durationMs: index * 1000,
    createdAt: new Date(Date.UTC(2026, 7, 2, 0, 0, index)).toISOString(),
    ...overrides
  };
}

test("image timing estimate uses only the newest 10 matching successful records", (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "xi-ai-image-timing-"));
  const filePath = path.join(dataDir, "image-generation-timing.jsonl");
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const store = createImageGenerationTimingStore({ filePath });

  for (let index = 1; index <= 12; index += 1) store.record(timingRecord(index));
  store.record(timingRecord(13, { status: "failed", durationMs: 600_000 }));
  store.record(timingRecord(14, { status: "cancelled", durationMs: 600_000 }));

  const estimate = store.estimate(timingRecord(1));
  assert.equal(estimate.sampleCount, 10);
  assert.equal(estimate.sampleLimit, 10);
  assert.equal(estimate.estimatedMs, 8000);
  assert.equal(estimate.source, "global");
  assert.equal(estimate.scope, "exact");
  assert.equal(store.readRecords().length, 12);
});

test("image timing store is shared through disk and omits request secrets", (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "xi-ai-image-timing-global-"));
  const filePath = path.join(dataDir, "image-generation-timing.jsonl");
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const writer = createImageGenerationTimingStore({ filePath });
  writer.record(timingRecord(25, {
    apiKey: "sk-never-write",
    prompt: "private prompt",
    resultUrl: "https://private.example/image.png"
  }));

  const reader = createImageGenerationTimingStore({ filePath });
  assert.equal(reader.estimate(timingRecord(1)).estimatedMs, 25_000);
  assert.doesNotMatch(fs.readFileSync(filePath, "utf8"), /sk-never-write|private prompt|private\.example/);
});

test("image timing estimate falls back by model scope and then to a parameter baseline", (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "xi-ai-image-timing-fallback-"));
  const filePath = path.join(dataDir, "image-generation-timing.jsonl");
  t.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));
  const store = createImageGenerationTimingStore({ filePath });
  store.record(timingRecord(40, { aspectRatio: "16:9" }));

  const related = store.estimate(timingRecord(1, { resolution: "2K", aspectRatio: "9:16" }));
  assert.equal(related.estimatedMs, 40_000);
  assert.equal(related.scope, "model-mode");

  const empty = store.estimate(timingRecord(1, { modelId: "unseen", resolution: "4K", count: 4 }));
  assert.equal(empty.sampleCount, 0);
  assert.equal(empty.source, "baseline");
  assert.equal(empty.estimatedMs, fallbackImageDurationMs({
    modelId: "unseen",
    mode: "generate",
    resolution: "4K",
    aspectRatio: "1:1",
    count: 4
  }));
});
