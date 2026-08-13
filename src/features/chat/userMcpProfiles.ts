export const userMcpProfileDatabaseName = "xi-ai-web-user-mcp";
export const userMcpProfileStoreName = "profiles";
export const userMcpSessionStorageKey = "xi-ai-web-user-mcp-session";

const databaseVersion = 1;
const maxProfilesPerScope = 32;
const maxLabelChars = 80;
const maxEndpointChars = 2_048;
const allowedPorts = new Set(["", "443", "8443"]);
const credentialLikePathSegment = /^(?:token|api[-_]?key|secret|auth(?:orization)?|bearer|access[-_]?token|session(?:[-_]?token)?)(?:[-_.:=/]|$)/iu;
const credentialValuePathSegment = /^(?:sk|gh[opusr]?|eyJ)[-_A-Za-z0-9.]{16,}$/u;

function hasCredentialLikePathState(pathname: string) {
  return pathname.split("/").some((segment) => {
    if (!segment) return false;
    let decoded: string;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      return true;
    }
    return credentialLikePathSegment.test(decoded) || credentialValuePathSegment.test(decoded);
  });
}

export type UserMcpProfile = {
  id: string;
  label: string;
  endpoint: string;
  createdAt: string;
  updatedAt: string;
};

export type UserMcpProfileScope = "remembered" | "session";

export type ScopedUserMcpProfile = UserMcpProfile & {
  scope: UserMcpProfileScope;
};

const persistedKeys = new Set(["id", "label", "endpoint", "createdAt", "updatedAt"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanText(value: unknown, maximum: number, label: string) {
  if (typeof value !== "string") throw new Error(`${label}无效。`);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw new Error(`${label}无效。`);
  }
  return normalized;
}

function cleanTimestamp(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : fallback;
}

export function normalizeUserMcpEndpoint(value: unknown) {
  const candidate = cleanText(value, maxEndpointChars, "MCP 服务地址");
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("MCP 服务地址必须是有效的 HTTPS URL。");
  }
  if (
    parsed.protocol !== "https:" ||
    !parsed.hostname ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    !allowedPorts.has(parsed.port)
  ) {
    throw new Error("仅支持不含凭据、查询参数或片段的公开 HTTPS MCP 地址（443/8443 端口）。");
  }
  if (hasCredentialLikePathState(parsed.pathname)) {
    throw new Error("MCP endpoint path cannot contain credential-like URL state.");
  }
  return parsed.toString().replace(/\/$/u, "");
}

function randomProfileId() {
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `local-mcp-${random}`;
}

export function sanitizeUserMcpProfile(
  value: unknown,
  { now = () => new Date().toISOString(), allowMissingId = false } = {}
): UserMcpProfile {
  if (!isRecord(value)) throw new Error("MCP 配置无效。");
  for (const key of Object.keys(value)) {
    if (!persistedKeys.has(key)) throw new Error("MCP 配置包含不允许保存的字段。");
  }
  const timestamp = now();
  const id = value.id === undefined && allowMissingId
    ? randomProfileId()
    : cleanText(value.id, 120, "MCP 配置标识");
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/u.test(id)) throw new Error("MCP 配置标识无效。");
  const createdAt = cleanTimestamp(value.createdAt, timestamp);
  const updatedAt = cleanTimestamp(value.updatedAt, timestamp);
  return {
    id,
    label: cleanText(value.label, maxLabelChars, "MCP 服务名称"),
    endpoint: normalizeUserMcpEndpoint(value.endpoint),
    createdAt,
    updatedAt
  };
}

export function createUserMcpProfile(label: string, endpoint: string): UserMcpProfile {
  return sanitizeUserMcpProfile({ label, endpoint }, { allowMissingId: true });
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("当前浏览器不支持本地 MCP 配置存储。"));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(userMcpProfileDatabaseName, databaseVersion);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(userMcpProfileStoreName)) {
        database.createObjectStore(userMcpProfileStoreName, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("无法打开本地 MCP 配置存储。"));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(userMcpProfileStoreName, mode);
    const request = run(transaction.objectStore(userMcpProfileStoreName));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("本地 MCP 配置操作失败。"));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => {
      database.close();
      reject(transaction.error || new Error("本地 MCP 配置操作失败。"));
    };
  });
}

function sanitizeProfileList(value: unknown) {
  if (!Array.isArray(value)) return [];
  const profiles: UserMcpProfile[] = [];
  for (const item of value.slice(0, maxProfilesPerScope)) {
    try {
      profiles.push(sanitizeUserMcpProfile(item));
    } catch {
      // Invalid or legacy records are ignored rather than entering live state.
    }
  }
  return profiles;
}

export async function loadRememberedUserMcpProfiles(): Promise<UserMcpProfile[]> {
  const records = await withStore<unknown[]>("readonly", (store) => store.getAll());
  return sanitizeProfileList(records).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function saveRememberedUserMcpProfile(value: unknown): Promise<UserMcpProfile> {
  const profile = sanitizeUserMcpProfile(value);
  const existing = await loadRememberedUserMcpProfiles();
  if (!existing.some((item) => item.id === profile.id) && existing.length >= maxProfilesPerScope) {
    throw new Error(`最多保存 ${maxProfilesPerScope} 个常用 MCP 服务。`);
  }
  await withStore<IDBValidKey>("readwrite", (store) => store.put(profile));
  return profile;
}

export async function deleteRememberedUserMcpProfile(id: string): Promise<void> {
  const normalizedId = cleanText(id, 120, "MCP 配置标识");
  await withStore<undefined>("readwrite", (store) => store.delete(normalizedId) as IDBRequest<undefined>);
}

export function loadSessionUserMcpProfiles(): UserMcpProfile[] {
  if (typeof window === "undefined") return [];
  try {
    return sanitizeProfileList(JSON.parse(window.sessionStorage.getItem(userMcpSessionStorageKey) || "[]"));
  } catch {
    window.sessionStorage.removeItem(userMcpSessionStorageKey);
    return [];
  }
}

function writeSessionProfiles(profiles: UserMcpProfile[]) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(userMcpSessionStorageKey, JSON.stringify(profiles.slice(0, maxProfilesPerScope)));
}

export function saveSessionUserMcpProfile(value: unknown): UserMcpProfile {
  const profile = sanitizeUserMcpProfile(value);
  const current = loadSessionUserMcpProfiles();
  const index = current.findIndex((item) => item.id === profile.id);
  if (index === -1 && current.length >= maxProfilesPerScope) {
    throw new Error(`当前会话最多添加 ${maxProfilesPerScope} 个 MCP 服务。`);
  }
  if (index === -1) current.unshift(profile);
  else current[index] = profile;
  writeSessionProfiles(current);
  return profile;
}

export function deleteSessionUserMcpProfile(id: string) {
  const normalizedId = cleanText(id, 120, "MCP 配置标识");
  writeSessionProfiles(loadSessionUserMcpProfiles().filter((profile) => profile.id !== normalizedId));
}

export async function loadUserMcpProfiles(): Promise<ScopedUserMcpProfile[]> {
  const [remembered, session] = await Promise.all([
    loadRememberedUserMcpProfiles().catch(() => []),
    Promise.resolve(loadSessionUserMcpProfiles())
  ]);
  return [
    ...remembered.map((profile) => ({ ...profile, scope: "remembered" as const })),
    ...session.map((profile) => ({ ...profile, scope: "session" as const }))
  ];
}
