import type { MediaJob } from "../../types";
import { sanitizeWorkspaceMediaJob } from "../workspace/workspaceArchive";
import {
  loadWorkspaceMediaJobs,
  saveWorkspaceMediaJobs
} from "../workspace/workspaceRepository";

function cleanText(value: unknown, max = 1000) {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > max ? text.slice(0, max) : text;
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

export async function loadMediaJobs(): Promise<MediaJob[]> {
  return loadWorkspaceMediaJobs();
}

export async function saveMediaJobs(jobs: MediaJob[]) {
  const sanitized = jobs
    .map(sanitizeWorkspaceMediaJob)
    .filter((job): job is MediaJob => Boolean(job));
  await saveWorkspaceMediaJobs(sanitized);
}
