import type { ImageGenerationTimingKey } from "../../types";

const baselineMs = 30_000;

export function fallbackImageDurationMs(key: ImageGenerationTimingKey) {
  const fallback = baselineMs * (key.mode === "edit" ? 1.25 : 1) * Math.max(1, key.count / 2) * (key.resolution === "4K" ? 2 : key.resolution === "2K" ? 1.45 : 1);
  return Math.max(8_000, Math.min(600_000, Math.round(fallback)));
}

export function formatDurationMs(value: number) {
  const seconds = Math.max(0, Math.round(value / 1000));
  if (seconds < 60) return `${seconds} 秒`;
  return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
}
