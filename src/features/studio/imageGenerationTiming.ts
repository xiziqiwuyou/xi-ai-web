import type { ImageAspectRatio, ImageGenerationMode, ImageGenerationTimingRecord, ImageResolution } from "../../types";

export type ImageTimingKey = {
  modelId: string;
  mode: ImageGenerationMode;
  resolution: ImageResolution;
  aspectRatio: ImageAspectRatio;
  count: number;
};

const baselineMs = 30_000;

function median(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  if (!sorted.length) return baselineMs;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

export function estimateImageDurationMs(history: ImageGenerationTimingRecord[], key: ImageTimingKey) {
  const exact = history.filter((record) =>
    record.status === "completed" &&
    record.modelId === key.modelId &&
    record.mode === key.mode &&
    record.resolution === key.resolution &&
    record.aspectRatio === key.aspectRatio &&
    record.count === key.count
  );
  const related = history.filter((record) =>
    record.status === "completed" && record.modelId === key.modelId && record.mode === key.mode
  );
  const source = exact.length ? exact : related;
  const fallback = baselineMs * (key.mode === "edit" ? 1.25 : 1) * Math.max(1, key.count / 2) * (key.resolution === "4K" ? 2 : key.resolution === "2K" ? 1.45 : 1);
  return Math.max(8_000, Math.min(600_000, source.length ? median(source.map((record) => record.durationMs)) : Math.round(fallback)));
}

export function formatDurationMs(value: number) {
  const seconds = Math.max(0, Math.round(value / 1000));
  if (seconds < 60) return `${seconds} 秒`;
  return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
}
