import fs from "node:fs";
import path from "node:path";

const validModes = new Set(["generate", "edit"]);
const validResolutions = new Set(["512px", "1K", "2K", "4K"]);
const validAspectRatios = new Set(["1:1", "3:2", "2:3", "16:9", "9:16"]);
const defaultSampleLimit = 10;
const baselineMs = 30_000;

function boundedText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.trunc(parsed)));
}

function validTimestamp(value) {
  const parsed = new Date(value || "");
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : new Date().toISOString();
}

export function normalizeImageTimingKey(value = {}) {
  return {
    modelId: boundedText(value.modelId, 160),
    mode: validModes.has(value.mode) ? value.mode : "generate",
    resolution: validResolutions.has(value.resolution) ? value.resolution : "1K",
    aspectRatio: validAspectRatios.has(value.aspectRatio) ? value.aspectRatio : "1:1",
    count: boundedInteger(value.count, 1, 1, 10)
  };
}

export function fallbackImageDurationMs(value = {}) {
  const key = normalizeImageTimingKey(value);
  const estimate = baselineMs
    * (key.mode === "edit" ? 1.25 : 1)
    * Math.max(1, key.count / 2)
    * (key.resolution === "4K" ? 2 : key.resolution === "2K" ? 1.45 : 1);
  return Math.max(8_000, Math.min(600_000, Math.round(estimate)));
}

function normalizeRecord(value) {
  if (!value || typeof value !== "object") return null;
  if (value.status && !["success", "completed"].includes(value.status)) return null;
  const key = normalizeImageTimingKey(value);
  if (!key.modelId) return null;
  return {
    ...key,
    durationMs: boundedInteger(value.durationMs, 0, 0, 900_000),
    createdAt: validTimestamp(value.createdAt)
  };
}

function sameExactKey(record, key) {
  return record.modelId === key.modelId
    && record.mode === key.mode
    && record.resolution === key.resolution
    && record.aspectRatio === key.aspectRatio
    && record.count === key.count;
}

function averageDuration(records) {
  if (!records.length) return 0;
  const average = records.reduce((total, record) => total + record.durationMs, 0) / records.length;
  return Math.max(8_000, Math.min(600_000, Math.round(average)));
}

export function createImageGenerationTimingStore({
  filePath,
  maxBytes = 2 * 1024 * 1024,
  retainRecords = 2000
} = {}) {
  if (!filePath) throw new TypeError("Image generation timing store requires a file path");
  const resolvedFile = path.resolve(filePath);
  let writesSinceSizeCheck = 0;

  function readRecords(limit = retainRecords) {
    try {
      if (!fs.existsSync(resolvedFile)) return [];
      return fs
        .readFileSync(resolvedFile, "utf8")
        .split(/\r?\n/)
        .filter(Boolean)
        .slice(-Math.max(1, limit))
        .map((line) => {
          try {
            return normalizeRecord(JSON.parse(line));
          } catch {
            return null;
          }
        })
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  function compactIfNeeded() {
    if (!fs.existsSync(resolvedFile) || fs.statSync(resolvedFile).size <= maxBytes) return;
    const retained = readRecords(retainRecords);
    const tempFile = `${resolvedFile}.tmp`;
    fs.writeFileSync(tempFile, retained.map((record) => JSON.stringify(record)).join("\n") + (retained.length ? "\n" : ""));
    fs.renameSync(tempFile, resolvedFile);
  }

  function record(value) {
    const timingRecord = normalizeRecord(value);
    if (!timingRecord) return false;
    try {
      fs.mkdirSync(path.dirname(resolvedFile), { recursive: true });
      fs.appendFileSync(resolvedFile, `${JSON.stringify(timingRecord)}\n`);
      writesSinceSizeCheck += 1;
      if (writesSinceSizeCheck >= 64) {
        writesSinceSizeCheck = 0;
        compactIfNeeded();
      }
      return true;
    } catch {
      return false;
    }
  }

  function estimate(value, { sampleLimit = defaultSampleLimit, eventLimit = retainRecords } = {}) {
    const key = normalizeImageTimingKey(value);
    const boundedSampleLimit = boundedInteger(sampleLimit, defaultSampleLimit, 1, defaultSampleLimit);
    const modelRecords = readRecords(eventLimit).filter((record) => record.modelId === key.modelId);
    const exactRecords = modelRecords.filter((record) => sameExactKey(record, key));
    const modeRecords = modelRecords.filter((record) => record.mode === key.mode);
    const sourceRecords = exactRecords.length
      ? exactRecords
      : modeRecords.length
        ? modeRecords
        : modelRecords;
    const scope = exactRecords.length
      ? "exact"
      : modeRecords.length
        ? "model-mode"
        : modelRecords.length
          ? "model"
          : "baseline";
    const recentRecords = sourceRecords.slice(-boundedSampleLimit);
    return {
      estimatedMs: recentRecords.length ? averageDuration(recentRecords) : fallbackImageDurationMs(key),
      sampleCount: recentRecords.length,
      sampleLimit: defaultSampleLimit,
      source: recentRecords.length ? "global" : "baseline",
      scope,
      updatedAt: recentRecords.at(-1)?.createdAt || null
    };
  }

  return Object.freeze({ record, estimate, readRecords });
}
