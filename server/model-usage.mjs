import fs from "node:fs";
import path from "node:path";

const VALID_STATUSES = new Set(["success", "error", "cancelled"]);

function boundedText(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function boundedDuration(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(86_400_000, Math.round(parsed));
}

function validTimestamp(value) {
  const parsed = new Date(value || "");
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : new Date().toISOString();
}

function normalizeEvent(value) {
  if (!value || typeof value !== "object") return null;
  const modelId = boundedText(value.modelId, 160);
  const requestModel = boundedText(value.requestModel, 240);
  if (!modelId || !requestModel) return null;
  return {
    modelId,
    displayName: boundedText(value.displayName, 160) || requestModel,
    requestModel,
    vendor: boundedText(value.vendor, 80),
    operation: boundedText(value.operation, 80) || "unknown",
    status: VALID_STATUSES.has(value.status) ? value.status : "error",
    durationMs: boundedDuration(value.durationMs),
    createdAt: validTimestamp(value.createdAt)
  };
}

export function createModelUsageStore({
  filePath,
  maxBytes = 8 * 1024 * 1024,
  retainRecords = 5000
} = {}) {
  if (!filePath) throw new TypeError("Model usage store requires a file path");
  const resolvedFile = path.resolve(filePath);
  let writesSinceSizeCheck = 0;

  function readEvents(limit = retainRecords) {
    try {
      if (!fs.existsSync(resolvedFile)) return [];
      return fs
        .readFileSync(resolvedFile, "utf8")
        .split(/\r?\n/)
        .filter(Boolean)
        .slice(-Math.max(1, limit))
        .map((line) => {
          try {
            return normalizeEvent(JSON.parse(line));
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
    const retained = readEvents(retainRecords);
    const tempFile = `${resolvedFile}.tmp`;
    fs.writeFileSync(tempFile, retained.map((event) => JSON.stringify(event)).join("\n") + (retained.length ? "\n" : ""));
    fs.renameSync(tempFile, resolvedFile);
  }

  function record(value) {
    const event = normalizeEvent(value);
    if (!event) return false;
    try {
      fs.mkdirSync(path.dirname(resolvedFile), { recursive: true });
      fs.appendFileSync(resolvedFile, `${JSON.stringify(event)}\n`);
      writesSinceSizeCheck += 1;
      if (writesSinceSizeCheck >= 128) {
        writesSinceSizeCheck = 0;
        compactIfNeeded();
      }
      return true;
    } catch {
      return false;
    }
  }

  function summarize({ catalog = [], limit = 100, eventLimit = retainRecords } = {}) {
    const catalogById = new Map(catalog.map((entry) => [entry.id, entry]));
    const grouped = new Map();
    for (const event of readEvents(eventLimit)) {
      const current = grouped.get(event.modelId) || {
        modelId: event.modelId,
        displayName: event.displayName,
        requestModel: event.requestModel,
        vendor: event.vendor,
        calls: 0,
        successCalls: 0,
        errorCalls: 0,
        cancelledCalls: 0,
        totalDurationMs: 0,
        lastCalledAt: event.createdAt
      };
      current.calls += 1;
      current.totalDurationMs += event.durationMs;
      current.lastCalledAt = current.lastCalledAt > event.createdAt ? current.lastCalledAt : event.createdAt;
      if (event.status === "success") current.successCalls += 1;
      else if (event.status === "cancelled") current.cancelledCalls += 1;
      else current.errorCalls += 1;
      grouped.set(event.modelId, current);
    }

    return [...grouped.values()]
      .map((summary) => {
        const catalogEntry = catalogById.get(summary.modelId);
        return {
          ...summary,
          displayName: boundedText(catalogEntry?.label, 160) || summary.displayName,
          requestModel: boundedText(catalogEntry?.model, 240) || summary.requestModel,
          vendor: boundedText(catalogEntry?.vendorLabel || catalogEntry?.vendor, 80) || summary.vendor,
          averageDurationMs: summary.calls ? Math.round(summary.totalDurationMs / summary.calls) : 0
        };
      })
      .sort((left, right) => right.calls - left.calls || right.lastCalledAt.localeCompare(left.lastCalledAt))
      .slice(0, Math.max(1, limit));
  }

  return Object.freeze({ record, summarize, readEvents });
}

export function trackModelUsageResponse({ response, store, entry, operation, clock = Date.now }) {
  if (!response || typeof response.once !== "function") throw new TypeError("Model usage tracker requires a response");
  if (!store || typeof store.record !== "function") throw new TypeError("Model usage tracker requires a store");
  const startedAt = clock();
  let recorded = false;
  const record = (status) => {
    if (recorded) return;
    recorded = true;
    const completedAt = clock();
    store.record({
      modelId: entry.id,
      displayName: entry.label,
      requestModel: entry.model,
      vendor: entry.vendorLabel || entry.vendor,
      operation,
      status,
      durationMs: completedAt - startedAt,
      createdAt: new Date(completedAt).toISOString()
    });
  };
  response.once("finish", () => record(response.statusCode >= 200 && response.statusCode < 400 ? "success" : "error"));
  response.once("close", () => {
    if (!response.writableEnded) record("cancelled");
  });
}
