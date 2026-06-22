import type { MediaJob } from "../../types";

const storageKey = "cherry-web-media-jobs";
const maxJobs = 20;

function cleanText(value: unknown, max = 1000) {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > max ? text.slice(0, max) : text;
}

function sanitizeJob(value: unknown): MediaJob | null {
  const source = value && typeof value === "object" ? (value as Partial<MediaJob>) : null;
  if (!source?.id || !source.module || !source.modelId || !source.createdAt) return null;
  return {
    id: cleanText(source.id, 140),
    module: source.module === "audio" ? "audio" : "video",
    modelId: cleanText(source.modelId, 160),
    endpointPath: cleanText(source.endpointPath, 180) || "/video/generations/status",
    providerJobId: cleanText(source.providerJobId, 180) || undefined,
    status: source.status || "submitted",
    prompt: cleanText(source.prompt, 3000),
    result: source.result,
    failureReason: cleanText(source.failureReason, 800) || undefined,
    pollAttempts: Number.isFinite(Number(source.pollAttempts)) ? Number(source.pollAttempts) : 0,
    autoPoll: Boolean(source.autoPoll),
    createdAt: cleanText(source.createdAt, 80),
    updatedAt: cleanText(source.updatedAt, 80) || cleanText(source.createdAt, 80)
  };
}

function valueAtJsonPath(source: unknown, jsonPath?: string) {
  const path = String(jsonPath || "").trim();
  if (!path || !/^[A-Za-z0-9_.$[\]-]+$/.test(path)) return undefined;
  return path
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean)
    .reduce<unknown>((current, key) => (current && typeof current === "object" ? (current as Record<string, unknown>)[key] : undefined), source);
}

export function providerJobIdFrom(raw: unknown, idJsonPath?: string) {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const nested = source.data && typeof source.data === "object" ? (source.data as Record<string, unknown>) : {};
  return String(valueAtJsonPath(raw, idJsonPath) || source.id || source.task_id || source.job_id || source.generation_id || nested.id || "").trim();
}

export function createMediaJob(input: {
  modelId: string;
  endpointPath: string;
  providerJobId?: string;
  prompt: string;
  status?: MediaJob["status"];
  result?: MediaJob["result"];
}): MediaJob {
  const now = new Date().toISOString();
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
    module: "video",
    modelId: input.modelId,
    endpointPath: input.endpointPath || "/video/generations/status",
    providerJobId: input.providerJobId,
    prompt: input.prompt,
    status: input.status || "submitted",
    result: input.result,
    pollAttempts: 0,
    autoPoll: false,
    createdAt: now,
    updatedAt: now
  };
}

export function loadMediaJobs(): MediaJob[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.map(sanitizeJob).filter((job): job is MediaJob => Boolean(job)).slice(0, maxJobs)
      : [];
  } catch {
    return [];
  }
}

export function saveMediaJobs(jobs: MediaJob[]) {
  if (typeof window === "undefined") return;
  const sanitized = jobs
    .map(sanitizeJob)
    .filter((job): job is MediaJob => Boolean(job))
    .slice(0, maxJobs);
  if (!sanitized.length) {
    window.localStorage.removeItem(storageKey);
    return;
  }
  window.localStorage.setItem(storageKey, JSON.stringify(sanitized));
}
