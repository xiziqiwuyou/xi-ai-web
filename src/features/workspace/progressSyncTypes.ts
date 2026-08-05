import type {
  ModuleId,
  UserProviderConfig,
  WorkspaceDataCounts,
  WorkspaceExportEnvelope
} from "../../types";
import { sanitizeUserProviderConfig } from "../settings/userProviderConfig";
import { previewWorkspaceImportPayload } from "./workspaceArchive";

export const progressSyncSchema = "xi-ai-web.progress-sync" as const;
export const progressSyncVersion = 1 as const;
export const progressSyncDefaultMaxBytes = 32 * 1024 * 1024;
export const progressSyncAbsoluteMaxBytes = 64 * 1024 * 1024;

const moduleIds = new Set<ModuleId>([
  "home", "chat", "image", "audio", "video", "ppt", "apps", "agents",
  "workflows", "skills", "knowledge", "mindmap", "gallery", "assistants", "translate"
]);
const publicPaths = new Map<ModuleId, string>([
  ["chat", "/chat"],
  ["image", "/image"],
  ["agents", "/agents"],
  ["workflows", "/workflows"],
  ["ppt", "/ppt"],
  ["mindmap", "/mindmap"],
  ["assistants", "/assistants"],
  ["translate", "/translate"]
]);

export type ProgressSyncInclusion = {
  workspace: true;
  apiKey: boolean;
  transientDrafts: false;
};

export type ProgressSyncResume = {
  path: string;
  moduleId: ModuleId;
  lastModelId: string;
};

export type ProgressSyncPayload = {
  schema: typeof progressSyncSchema;
  version: typeof progressSyncVersion;
  capturedAt: string;
  sourceRevision: number;
  workspace: WorkspaceExportEnvelope;
  resume: ProgressSyncResume;
  session?: {
    userProvider?: UserProviderConfig;
  };
  inclusion: ProgressSyncInclusion;
};

export type ProgressSyncPreview = {
  payload: ProgressSyncPayload;
  counts: WorkspaceDataCounts;
  receiverRevision: number;
  encryptedBytes: number;
};

export type ProgressSyncPublicMaterial = {
  publicKey: string;
  nonce: string;
};

export type ProgressSyncRole = "sender" | "receiver";
export type ProgressSyncPeerMaterial = ProgressSyncPublicMaterial & { deviceLabel?: string };

export type ProgressSyncCreateResult = {
  sessionId: string;
  code: string;
  creatorToken: string;
  creatorRole: ProgressSyncRole;
  expiresAt: string;
};

export type ProgressSyncJoinResult = {
  sessionId: string;
  joinToken: string;
  joinRole: ProgressSyncRole;
  expiresAt: string;
  sender?: ProgressSyncPeerMaterial;
  receiver?: ProgressSyncPeerMaterial;
};

export type ProgressSyncStatus = {
  sessionId: string;
  state:
    | "waiting_join"
    | "awaiting_approval"
    | "approved"
    | "payload_ready"
    | "claimed"
    | "completed"
    | "rejected"
    | "cancelled"
    | "expired";
  expiresAt: string;
  creatorRole: ProgressSyncRole;
  receiver?: ProgressSyncPeerMaterial;
  sender?: ProgressSyncPeerMaterial;
  payloadBytes?: number;
};

function recordFrom(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function boundedText(value: unknown, maxLength: number, trim = true) {
  const text = typeof value === "string" ? value : "";
  const normalized = trim ? text.trim() : text;
  return normalized.slice(0, maxLength);
}

function parseIsoDate(value: unknown) {
  const text = boundedText(value, 80);
  if (!text || !Number.isFinite(Date.parse(text))) throw new Error("同步快照的捕获时间无效。");
  return new Date(text).toISOString();
}

function parseSourceRevision(value: unknown) {
  const revision = Number(value);
  if (!Number.isSafeInteger(revision) || revision < 0) throw new Error("同步快照的工作区修订号无效。");
  return revision;
}

function parseResume(value: unknown): ProgressSyncResume {
  const source = recordFrom(value);
  const moduleId = boundedText(source?.moduleId, 40) as ModuleId;
  if (!moduleIds.has(moduleId)) throw new Error("同步快照的目标模块无效。");
  const path = boundedText(source?.path, 512);
  if (!path.startsWith("/") || path.startsWith("//") || /[?#]/u.test(path)) {
    throw new Error("同步快照的目标地址无效。");
  }
  if (publicPaths.get(moduleId) !== path) {
    throw new Error("同步快照的目标地址与模块不匹配。");
  }
  return {
    path,
    moduleId,
    lastModelId: boundedText(source?.lastModelId, 180)
  };
}

function parseInclusion(value: unknown): ProgressSyncInclusion {
  const source = recordFrom(value);
  if (source?.workspace !== true || source?.transientDrafts !== false || typeof source.apiKey !== "boolean") {
    throw new Error("同步快照的数据范围声明无效。");
  }
  return {
    workspace: true,
    apiKey: source.apiKey,
    transientDrafts: false
  };
}

export async function parseProgressSyncPayload(value: unknown): Promise<ProgressSyncPayload> {
  const source = recordFrom(value);
  if (!source || source.schema !== progressSyncSchema) throw new Error("不是有效的 xi-ai-web 临时同步快照。");
  if (source.version !== progressSyncVersion) {
    if (typeof source.version === "number" && source.version > progressSyncVersion) {
      throw new Error("该同步快照来自未来版本，当前应用尚不支持。");
    }
    throw new Error("不支持的临时同步快照版本。");
  }

  const inclusion = parseInclusion(source.inclusion);
  const session = recordFrom(source.session);
  const rawProvider = recordFrom(session?.userProvider);
  let userProvider: UserProviderConfig | undefined;
  if (inclusion.apiKey) {
    userProvider = sanitizeUserProviderConfig(rawProvider);
    if (!userProvider.apiKey || userProvider.apiKey.length > 4_096) {
      throw new Error("同步快照中的 API Key 无效。");
    }
  } else if (rawProvider?.apiKey) {
    throw new Error("同步快照包含未声明的 API Key。");
  }

  return {
    schema: progressSyncSchema,
    version: progressSyncVersion,
    capturedAt: parseIsoDate(source.capturedAt),
    sourceRevision: parseSourceRevision(source.sourceRevision),
    workspace: await previewWorkspaceImportPayload(source.workspace),
    resume: parseResume(source.resume),
    session: userProvider ? { userProvider } : undefined,
    inclusion,
  };
}

export function createProgressSyncPayload(input: {
  workspace: WorkspaceExportEnvelope;
  sourceRevision: number;
  resume: ProgressSyncResume;
  includeApiKey: boolean;
  userProvider?: UserProviderConfig;
  capturedAt?: string;
}): ProgressSyncPayload {
  const provider = input.includeApiKey
    ? sanitizeUserProviderConfig(input.userProvider)
    : undefined;
  if (input.includeApiKey && (!provider?.apiKey || provider.apiKey.length > 4_096)) {
    throw new Error("没有可同步的有效 API Key。");
  }
  return {
    schema: progressSyncSchema,
    version: progressSyncVersion,
    capturedAt: parseIsoDate(input.capturedAt || new Date().toISOString()),
    sourceRevision: parseSourceRevision(input.sourceRevision),
    workspace: input.workspace,
    resume: parseResume(input.resume),
    session: provider ? { userProvider: provider } : undefined,
    inclusion: {
      workspace: true,
      apiKey: Boolean(provider),
      transientDrafts: false
    }
  };
}

export function formatProgressSyncCode(value: string) {
  return String(value || "").normalize("NFKC").replace(/\D/gu, "").slice(0, 6);
}

export function compactProgressSyncCode(value: string) {
  return formatProgressSyncCode(value);
}
