import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import {
  imagePromptOptimizationMessages,
  normalizeOptimizedImagePrompt
} from "./image-prompt.mjs";
import { importPublicImageAsset } from "./public-image-import.mjs";
import { retrieveContext, formatRetrievedContext } from "./knowledge/retrieval.mjs";
import { createProviderAdapter } from "./providers/registry.mjs";
import {
  formatSearchContext,
  isSearchServiceReady,
  runIndependentWebSearch
} from "./search/registry.mjs";
import {
  buildRuntimeProvider,
  catalogFromLegacyProviders,
  defaultModelCatalog,
  defaultModelVendors,
  findModelEntry,
  normalizeCatalogEntry,
  normalizeModelCatalog,
  normalizeModelVendorEntry,
  normalizeModelVendors,
  reconcileModelRegistry,
  vendorKinds,
  publicModelCatalog
} from "./registry/model-registry.mjs";
import {
  availableTools,
  normalizeToolSettings,
  resolveRequestedTools,
  runTool as runRegisteredTool
} from "./tools/registry.mjs";
import { runPromptToolLoop } from "./tools/prompt-runner.mjs";
import {
  createKnowledgeRouter,
  knowledgeErrorMiddleware
} from "./knowledge-cloud/routes.mjs";
import { createKnowledgeAdminRouter } from "./knowledge-cloud/admin/routes.mjs";
import {
  KNOWLEDGE_ERROR_CODES,
  KnowledgeError
} from "./knowledge-cloud/errors.mjs";
import {
  initializeKnowledgeRuntime,
  publicKnowledgeRuntimeStatus
} from "./knowledge-cloud/runtime.mjs";
import {
  combineCloudKnowledgeSearchChunks,
  composeCloudKnowledgeSystemContext,
  createCloudKnowledgeRequestIntegration,
  isCloudKnowledgePublicRequest,
  withCloudKnowledgeCitations,
  withCloudKnowledgeResultRaw
} from "./knowledge-cloud/retrieval/request-integration.mjs";
import {
  normalizeLangflowWorkflow,
  normalizeLangflowWorkflows,
  publicLangflowWorkflows
} from "./langflow/catalog.mjs";
import { loadLangflowConfig, publicLangflowStatus } from "./langflow/config.mjs";
import { createLangflowRouter } from "./langflow/routes.mjs";
import {
  DEFAULT_UPSTREAM_BASE_URL,
  assertManagedUpstreamBaseUrl,
  assertSafePublicHttpsUrl,
  managedUpstreamPolicy,
  normalizeUpstreamBaseUrl
} from "./upstream-security.mjs";
import { createRequestGuard } from "./request-guard.mjs";
import {
  createSseTokenBuffer,
  writeSseEventWithBackpressure
} from "./sse-token-buffer.mjs";
import { createProgressSyncRouter, createProgressSyncService } from "./progress-sync.mjs";
import { exchangeShellJwt, ShellJwtExchangeError } from "./shell-jwt-exchange.mjs";
import {
  defaultAppPresets,
  defaultAssistants,
  defaultMenuItems,
  defaultPromptPresets,
  defaultSettings
} from "./data/defaults.mjs";
import {
  migrateAssistants,
  normalizeAssistantAvatar,
  normalizeAssistants,
  normalizeAssistantTextList
} from "./data/assistant-catalog.mjs";
import { createMetadataWriteQueue } from "./metadata-write-queue.mjs";
import { createAdminCredentialStore } from "./admin-credentials.mjs";
import { createModelUsageStore, trackModelUsageResponse } from "./model-usage.mjs";
import {
  createImageGenerationTimingStore,
  normalizeImageTimingKey
} from "./image-generation-timing.mjs";
import {
  parsePptDeckModelOutput,
  pptDeckToMarkdown,
  pptGenerationMessages
} from "./ppt-deck.mjs";
import {
  findMindmapNode,
  mergeMindmapExpansion,
  mindmapDocumentToMarkdown,
  mindmapGenerationMessages,
  normalizeMindmapDocument,
  normalizeMindmapGenerationOptions,
  parseMindmapExpansionOutput,
  parseMindmapModelOutput
} from "./mindmap-document.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const isProduction =
  process.argv.includes("--production") || process.env.NODE_ENV === "production";
const upstreamPolicy = managedUpstreamPolicy({ production: isProduction });

const port = Number(process.env.PORT || 8787);
const dataDir = path.resolve(process.env.DATA_DIR || path.join(rootDir, "data"));
const dataFile = path.join(dataDir, "app-data.json");
const metadataDegradedFile = path.join(dataDir, ".metadata-degraded.json");
const backupDir = path.join(dataDir, "backups");
const auditFile = path.join(dataDir, "admin-audit.jsonl");
const adminCredentialFile = path.join(dataDir, "admin-credentials.json");
const modelUsageStore = createModelUsageStore({ filePath: path.join(dataDir, "model-usage.jsonl") });
const imageGenerationTimingStore = createImageGenerationTimingStore({
  filePath: path.join(dataDir, "image-generation-timing.jsonl")
});
const progressSyncTtlSeconds = Math.max(
  180,
  Math.min(1800, Number(process.env.PROGRESS_SYNC_TTL_SECONDS || 600) || 600)
);
const progressSyncMaxPayloadMb = Math.max(
  5,
  Math.min(64, Number(process.env.PROGRESS_SYNC_MAX_PAYLOAD_MB || 32) || 32)
);
const progressSyncService = createProgressSyncService({
  dataDir,
  ttlMs: progressSyncTtlSeconds * 1000,
  maxPayloadBytes: progressSyncMaxPayloadMb * 1024 * 1024,
  maxIpJoinAttempts: Math.max(1, Math.min(20, Number(process.env.PROGRESS_SYNC_MAX_IP_ATTEMPTS || 5) || 5)),
  maxSessionJoinAttempts: Math.max(1, Math.min(10, Number(process.env.PROGRESS_SYNC_MAX_SESSION_ATTEMPTS || 5) || 5))
});
await progressSyncService.ready;
const adminCredentialStore = createAdminCredentialStore({
  filePath: adminCredentialFile,
  username: process.env.ADMIN_USERNAME || "xizi2333",
  password: process.env.ADMIN_PASSWORD || process.env.APP_PASSWORD || ""
});
const explicitAdminSessionSecret = process.env.ADMIN_SESSION_SECRET || process.env.APP_SESSION_SECRET || "";
const MAX_API_KEY_CHARS = 4_096;
const MAX_CHAT_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_CHAT_IMAGE_TOTAL_BYTES = 24 * 1024 * 1024;
const MAX_IMAGE_EDIT_UPLOAD_BYTES = 20 * 1024 * 1024;
const DEFAULT_IMAGE_TIMEOUT_MS = 300_000;
const DEFAULT_SSE_HEARTBEAT_MS = 15_000;
const DEFAULT_SSE_TOKEN_FLUSH_MS = 32;
const DEFAULT_SSE_TOKEN_MAX_WAIT_MS = 80;
const DEFAULT_SSE_TOKEN_MAX_CHARS = 512;
const DEFAULT_SSE_TOKEN_MAX_QUEUE_CHARS = 131_072;
const DEFAULT_SSE_BACKPRESSURE_TIMEOUT_MS = 5_000;
const knowledgeRuntime = await initializeKnowledgeRuntime();
const cloudKnowledgeRequests = createCloudKnowledgeRequestIntegration(knowledgeRuntime);
const langflowConfig = loadLangflowConfig();

const app = express();
const httpServer = http.createServer(app);
app.disable("x-powered-by");
const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS || 0);
if (Number.isSafeInteger(trustProxyHops) && trustProxyHops > 0) {
  app.set("trust proxy", trustProxyHops);
}

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});

app.use("/api/kb", createKnowledgeRouter(knowledgeRuntime));
app.use(
  "/api/admin/knowledge",
  createKnowledgeAdminRouter(knowledgeRuntime, { authorize: requireKnowledgeAdmin })
);

const now = () => new Date().toISOString();

function normalizeCatalogRequestModelAliases(modelCatalog) {
  return modelCatalog.map((entry) =>
    entry.id === "gemini-nano-banana-2" && entry.model === "nano-banana-2"
      ? { ...entry, model: "gemini-3.1-flash-image" }
      : entry
  );
}

function createDefaultData() {
  return {
    version: 14,
    settings: defaultSettings(),
    menuItems: defaultMenuItems(),
    modelVendors: defaultModelVendors(),
    modelCatalog: normalizeCatalogRequestModelAliases(defaultModelCatalog()),
    assistants: defaultAssistants(),
    appPresets: defaultAppPresets(),
    promptPresets: defaultPromptPresets(),
    langflowWorkflows: [],
    toolSettings: normalizeToolSettings(),
    conversations: []
  };
}

function normalizeMenuItems(dataMenuItems, fallbackMenuItems = defaultMenuItems()) {
  const existing = Array.isArray(dataMenuItems) ? dataMenuItems : [];
  return fallbackMenuItems.map((menuItem) => {
    const next = existing.find((item) => item.id === menuItem.id) || {};
    return {
      ...menuItem,
      label: typeof next.label === "string" && next.label.trim() ? next.label.trim() : menuItem.label,
      enabled: typeof next.enabled === "boolean" ? next.enabled : menuItem.enabled,
      visible: typeof next.visible === "boolean" ? next.visible : menuItem.visible,
      order: menuItem.order
    };
  });
}

function normalizeSettings(dataSettings) {
  const fallback = defaultSettings();
  const source = dataSettings && typeof dataSettings === "object" ? dataSettings : {};
  const menuIds = new Set(defaultMenuItems().map((item) => item.id));
  const defaultModule = typeof source.defaultModule === "string" && menuIds.has(source.defaultModule)
    ? source.defaultModule
    : fallback.defaultModule;

  const requestedUpstream = source.upstreamBaseUrl || fallback.upstreamBaseUrl;
  const progressSyncSource = source.progressSync && typeof source.progressSync === "object"
    ? source.progressSync
    : {};
  const progressSync = {
    enabled: typeof progressSyncSource.enabled === "boolean"
      ? progressSyncSource.enabled
      : fallback.progressSync.enabled,
    ttlSeconds: Math.max(180, Math.min(1800, Math.trunc(Number(progressSyncSource.ttlSeconds) || fallback.progressSync.ttlSeconds))),
    maxPayloadMb: Math.max(5, Math.min(64, Math.trunc(Number(progressSyncSource.maxPayloadMb) || fallback.progressSync.maxPayloadMb))),
    maxIpJoinAttempts: Math.max(1, Math.min(20, Math.trunc(Number(progressSyncSource.maxIpJoinAttempts) || fallback.progressSync.maxIpJoinAttempts))),
    maxSessionJoinAttempts: Math.max(1, Math.min(10, Math.trunc(Number(progressSyncSource.maxSessionJoinAttempts) || fallback.progressSync.maxSessionJoinAttempts)))
  };
  return {
    theme: "rednote",
    siteName: String(source.siteName || fallback.siteName).trim(),
    allowGuestChat: typeof source.allowGuestChat === "boolean" ? source.allowGuestChat : fallback.allowGuestChat,
    defaultModule,
    upstreamBaseUrl: upstreamPolicy.locked
      ? upstreamPolicy.configuredBaseUrl || fallback.upstreamBaseUrl
      : normalizeUpstreamBaseUrl(requestedUpstream),
    progressSync
  };
}

function normalizeAppPreset(preset, fallback = {}) {
  const source = preset && typeof preset === "object" ? preset : {};
  return {
    id: String(source.id || fallback.id || crypto.randomUUID()).trim(),
    name: String(source.name || fallback.name || "").trim(),
    description: String(source.description || fallback.description || "").trim(),
    category: String(source.category || fallback.category || "通用").trim(),
    prompt: String(source.prompt || fallback.prompt || "").trim(),
    enabled: typeof source.enabled === "boolean" ? source.enabled : fallback.enabled !== false
  };
}

function normalizeAppPresets(dataAppPresets, fallbackAppPresets = defaultAppPresets()) {
  const list = Array.isArray(dataAppPresets) && dataAppPresets.length ? dataAppPresets : fallbackAppPresets;
  return list.map((preset, index) => normalizeAppPreset(preset, fallbackAppPresets[index] || {}));
}

function normalizePromptPreset(preset, fallback = {}) {
  const source = preset && typeof preset === "object" ? preset : {};
  const menuIds = new Set(defaultMenuItems().map((item) => item.id));
  const moduleId = menuIds.has(source.moduleId) ? source.moduleId : fallback.moduleId || "chat";
  return {
    id: String(source.id || fallback.id || crypto.randomUUID()).trim(),
    moduleId,
    title: String(source.title || fallback.title || "").trim(),
    prompt: String(source.prompt || fallback.prompt || "").trim(),
    enabled: typeof source.enabled === "boolean" ? source.enabled : fallback.enabled !== false
  };
}

function normalizePromptPresets(dataPromptPresets, fallbackPromptPresets = defaultPromptPresets()) {
  const list = Array.isArray(dataPromptPresets) && dataPromptPresets.length ? dataPromptPresets : fallbackPromptPresets;
  return list.map((preset, index) => normalizePromptPreset(preset, fallbackPromptPresets[index] || {}));
}

function normalizeToolsData(dataToolSettings) {
  return normalizeToolSettings(dataToolSettings);
}

function migrateModelCatalog(modelCatalog, sourceVersion) {
  const version = Number(sourceVersion || 0);
  let migrated = normalizeCatalogRequestModelAliases(modelCatalog);

  if (version < 14) {
    migrated = migrated.filter((entry) => !["compatible-chat", "compatible-video"].includes(entry.id));
  }

  if (version < 6) {
    const defaults = defaultModelCatalog();
    const existingModels = new Set(migrated.map((entry) => `${entry.vendor}:${entry.model}`));
    const missingDefaults = defaults.filter((entry) => !existingModels.has(`${entry.vendor}:${entry.model}`));
    if (missingDefaults.length) migrated = normalizeModelCatalog([...migrated, ...missingDefaults], migrated);
  }

  if (version < 8) {
    const defaultsByModel = new Map(
      defaultModelCatalog().map((entry) => [`${entry.vendor}:${entry.model}`, entry])
    );
    migrated = normalizeModelCatalog(
      migrated.map((entry) => {
        const shipped = defaultsByModel.get(`${entry.vendor}:${entry.model}`);
        if (!shipped) return entry;
        return {
          ...entry,
          capabilities: [...new Set([...entry.capabilities, ...shipped.capabilities])]
        };
      }),
      migrated
    );
  }

  if (version < 10) {
    const titleSummaryModel = defaultModelCatalog().find((entry) => entry.id === "openai-gpt-5-4-mini");
    const hasTitleSummaryModel = migrated.some(
      (entry) => entry.vendor === "openai" && entry.model === "gpt-5.4-mini"
    );
    if (titleSummaryModel && !hasTitleSummaryModel) {
      migrated = normalizeModelCatalog([...migrated, titleSummaryModel], migrated);
    }
  }

  if (version < 11) {
    migrated = normalizeModelCatalog(migrated, migrated);
  }

  return migrated;
}

function normalizeData(raw) {
  const fallback = createDefaultData();
  const data = raw && typeof raw === "object" ? raw : fallback;
  const normalizedCatalog = Array.isArray(data.modelCatalog)
    ? normalizeModelCatalog(data.modelCatalog, [])
    : Array.isArray(data.providers) && data.providers.length
      ? catalogFromLegacyProviders(data.providers)
      : fallback.modelCatalog;
  const legacyPresetBackfill = Number(data.version || 0) < 12
    ? defaultModelCatalog().filter((preset) =>
        ["openai-gpt-image-2-vip", "gemini-nano-banana-2"].includes(preset.id)
      )
    : [];
  const migratedCatalog = migrateModelCatalog(
    normalizeModelCatalog([...normalizedCatalog, ...legacyPresetBackfill], []),
    data.version
  );
  const declaredVendors = Array.isArray(data.modelVendors) && data.modelVendors.length
    ? normalizeModelVendors(data.modelVendors, [])
    : defaultModelVendors();
  const registry = reconcileModelRegistry(declaredVendors, migratedCatalog, fallback.modelCatalog);
  const assistants = migrateAssistants(data.assistants, data.version, fallback.assistants);

  return {
    version: fallback.version,
    settings: normalizeSettings(data.settings),
    menuItems: normalizeMenuItems(data.menuItems, fallback.menuItems),
    modelVendors: registry.modelVendors,
    modelCatalog: registry.modelCatalog,
    assistants,
    appPresets: normalizeAppPresets(data.appPresets, fallback.appPresets),
    promptPresets: normalizePromptPresets(data.promptPresets, fallback.promptPresets),
    langflowWorkflows: normalizeLangflowWorkflows(data.langflowWorkflows, fallback.langflowWorkflows),
    toolSettings: normalizeToolsData(data.toolSettings || fallback.toolSettings),
    conversations: Array.isArray(data.conversations) ? data.conversations : []
  };
}

function saveData(nextData = db) {
  fs.mkdirSync(dataDir, { recursive: true });
  const tempFile = `${dataFile}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(nextData, null, 2));
  fs.renameSync(tempFile, dataFile);
}

function rotateBackups(limit = 20) {
  if (!fs.existsSync(backupDir)) return;
  const backups = fs
    .readdirSync(backupDir)
    .filter((name) => name.startsWith("app-data-") && name.endsWith(".json"))
    .map((name) => ({ name, file: path.join(backupDir, name), mtime: fs.statSync(path.join(backupDir, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  backups.slice(limit).forEach((backup) => fs.rmSync(backup.file, { force: true }));
}

function backupCurrentData(reason = "metadata-import") {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFile = path.join(backupDir, `app-data-${stamp}-${reason}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(db, null, 2));
  rotateBackups();
  return backupFile;
}

function appendAudit(action, details = {}) {
  fs.mkdirSync(dataDir, { recursive: true });
  const record = {
    id: crypto.randomUUID(),
    action,
    details,
    createdAt: now()
  };
  fs.appendFileSync(auditFile, `${JSON.stringify(record)}\n`);
  return record;
}

function trackModelInvocation(res, entry, operation) {
  trackModelUsageResponse({ response: res, store: modelUsageStore, entry, operation });
}

function parsePositiveInt(value, fallback, max = 500) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.trunc(parsed), max);
}

function readAuditLog(options = {}) {
  const limit = parsePositiveInt(
    typeof options === "number" ? options : options.limit,
    80,
    1000
  );
  const action = typeof options === "object" && typeof options.action === "string"
    ? options.action.trim()
    : "";
  if (!fs.existsSync(auditFile)) return [];
  const records = fs
    .readFileSync(auditFile, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  return records
    .filter((record) => !action || record.action === action)
    .slice(-limit)
    .reverse();
}

function listBackupFiles() {
  if (!fs.existsSync(backupDir)) return [];
  return fs
    .readdirSync(backupDir)
    .filter((name) => /^app-data-.*\.json$/.test(name))
    .map((name) => {
      const file = path.join(backupDir, name);
      const stat = fs.statSync(file);
      return {
        name,
        size: stat.size,
        createdAt: stat.birthtime.toISOString(),
        modifiedAt: stat.mtime.toISOString()
      };
    })
    .sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());
}

function safeBackupPath(name) {
  if (typeof name !== "string" || !name.trim()) throw httpError(400, "备份文件名无效");
  if (path.isAbsolute(name) || name !== path.basename(name)) throw httpError(400, "备份文件名无效");
  if (!/^app-data-.*\.json$/.test(name)) throw httpError(400, "备份文件名无效");
  const resolvedBackupDir = path.resolve(backupDir);
  const resolvedFile = path.resolve(resolvedBackupDir, name);
  if (!resolvedFile.startsWith(`${resolvedBackupDir}${path.sep}`)) {
    throw httpError(400, "备份文件名无效");
  }
  if (!fs.existsSync(resolvedFile) || !fs.statSync(resolvedFile).isFile()) {
    throw httpError(404, "备份文件不存在");
  }
  return resolvedFile;
}

const moduleCapabilityRequirements = {
  chat: ["chat"],
  image: ["image"],
  audio: ["tts", "stt"],
  video: ["video"],
  ppt: ["chat"],
  apps: ["chat"],
  agents: ["chat", "toolCalling"],
  workflows: ["chat"],
  knowledge: ["chat", "embedding"],
  mindmap: ["chat"],
  assistants: ["chat"],
  translate: ["chat"],
  gallery: []
};

function buildModelCoverage() {
  const enabledModels = db.modelCatalog.filter((entry) => entry.enabled);
  return adminMenuItems()
    .filter((item) => item.enabled && item.visible)
    .map((item) => {
      const required = moduleCapabilityRequirements[item.id] || [];
      const missing = required.filter(
        (capability) => !enabledModels.some((entry) => entry.capabilities.includes(capability))
      );
      return {
        moduleId: item.id,
        label: item.label,
        required,
        covered: missing.length === 0,
        missing
      };
    });
}

function dataDirectoryWritable() {
  const probe = path.join(dataDir, `.readiness-${process.pid}-${crypto.randomUUID()}`);
  const renamedProbe = `${probe}.ok`;
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(probe, "ready", { flag: "wx" });
    fs.renameSync(probe, renamedProbe);
    fs.rmSync(renamedProbe, { force: true });
    return true;
  } catch {
    try { fs.rmSync(probe, { force: true }); } catch {}
    try { fs.rmSync(renamedProbe, { force: true }); } catch {}
    return false;
  }
}

function buildReadinessPayload() {
  const enabledModels = db.modelCatalog.filter((entry) => entry.enabled !== false);
  const checks = {
    adminConfigured:
      !isProduction ||
      (adminCredentialStore.configured && adminCredentialStore.passwordPolicySatisfied),
    metadata: metadataState.state === "ready",
    upstream: upstreamState.state === "ready",
    dataWritable: dataDirectoryWritable(),
    chatModel: enabledModels.some((entry) => entry.capabilities.includes("chat")),
    imageModel: enabledModels.some((entry) => entry.capabilities.includes("image"))
  };
  const ready = Object.values(checks).every(Boolean);
  return {
    ok: ready,
    ready,
    checks,
    metadata: metadataState,
    upstream: upstreamState
  };
}

function buildAdminOpsPayload() {
  const backups = listBackupFiles();
  const coverage = buildModelCoverage();
  const checklist = [
    {
      id: "admin-password",
      label: "管理员密码已配置",
      ok: adminCredentialStore.configured,
      detail: adminCredentialStore.configured
        ? `后台需要管理员用户名和密码访问（${adminCredentialStore.source}）。`
        : "请设置 ADMIN_USERNAME 和 ADMIN_PASSWORD。"
    },
    {
      id: "session-secret",
      label: "会话密钥已独立配置",
      ok: Boolean(explicitAdminSessionSecret || adminCredentialStore.configured),
      detail: explicitAdminSessionSecret
        ? "ADMIN_SESSION_SECRET is configured."
        : "The session signing key is domain-separated from the active Admin credential hash."
    },
    {
      id: "production-mode",
      label: "生产模式启动",
      ok: isProduction,
      detail: isProduction ? "当前以生产模式运行。" : "正式部署建议使用 npm run start 或 NODE_ENV=production。"
    },
    {
      id: "data-writable",
      label: "数据目录可写",
      ok: dataDirectoryWritable(),
      detail: path.relative(rootDir, dataDir) || "."
    },
    {
      id: "model-coverage",
      label: "可见菜单有模型能力覆盖",
      ok: coverage.every((item) => item.covered),
      detail: coverage.filter((item) => !item.covered).map((item) => item.label).join("、") || "模型能力覆盖正常。"
    },
    {
      id: "langflow-runtime",
      label: "Langflow 工作流服务",
      ok: !langflowConfig.enabled || langflowConfig.available,
      detail: langflowConfig.available
        ? `已发布 ${db.langflowWorkflows.filter((workflow) => workflow.enabled).length} 个工作流。`
        : langflowConfig.enabled
          ? "已启用但缺少 LANGFLOW_BASE_URL 或 LANGFLOW_API_KEY。"
          : "当前未启用，原工作流菜单不会调用 Langflow。"
    }
  ];

  return {
    runtime: {
      version: "0.3.0",
      node: process.version,
      mode: isProduction ? "production" : "development",
      uptimeSeconds: Math.round(process.uptime()),
      dataDir: path.relative(rootDir, dataDir) || ".",
      metadataFile: path.relative(rootDir, dataFile)
    },
    counts: {
      menus: db.menuItems.length,
      visibleMenus: db.menuItems.filter((item) => item.visible).length,
      modelVendors: db.modelVendors.length,
      enabledModels: db.modelCatalog.filter((entry) => entry.enabled).length,
      modelCatalog: db.modelCatalog.length,
      assistants: db.assistants.length,
      apps: db.appPresets.length,
      prompts: db.promptPresets.length,
      workflows: db.langflowWorkflows.length,
      tools: normalizeToolSettings(db.toolSettings).filter((tool) => tool.enabled).length,
      backups: backups.length,
      auditRecords: readAuditLog({ limit: 1000 }).length
    },
    checklist,
    modelCoverage: coverage,
    modelInvocations: modelUsageStore.summarize({ catalog: db.modelCatalog }),
    backups: backups.slice(0, 8)
  };
}

let metadataState = fs.existsSync(metadataDegradedFile)
  ? { state: "degraded", reason: "metadata_recovery_required", recoveredFile: null }
  : { state: "ready", reason: null, recoveredFile: null };

function markMetadataDegraded(reason, recoveredFile = null) {
  metadataState = { state: "degraded", reason, recoveredFile };
  fs.writeFileSync(metadataDegradedFile, JSON.stringify({ ...metadataState, createdAt: now() }, null, 2));
}

function clearMetadataDegraded() {
  metadataState = { state: "ready", reason: null, recoveredFile: null };
  fs.rmSync(metadataDegradedFile, { force: true });
}

function loadData() {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dataFile)) {
    const initialData = createDefaultData();
    saveData(initialData);
    return initialData;
  }

  try {
    const normalized = normalizeData(JSON.parse(fs.readFileSync(dataFile, "utf8")));
    saveData(normalized);
    return normalized;
  } catch (error) {
    const brokenFile = `${dataFile}.broken-${Date.now()}`;
    fs.renameSync(dataFile, brokenFile);
    const initialData = createDefaultData();
    saveData(initialData);
    console.warn(`Data file was unreadable and moved to ${brokenFile}`);
    console.warn(error);
    markMetadataDegraded("metadata_recovered_from_invalid_file", path.basename(brokenFile));
    return initialData;
  }
}

let db = loadData();
progressSyncService.updateConfig(db.settings.progressSync);
let upstreamState = { state: "ready", reason: null };

try {
  db.settings.upstreamBaseUrl = await assertManagedUpstreamBaseUrl(db.settings.upstreamBaseUrl, {
    production: isProduction,
    allowLocal: String(process.env.ALLOW_LOCAL_UPSTREAM || "").toLowerCase() === "true"
  });
  saveData();
} catch (error) {
  console.warn(
    `Configured upstream rejected; falling back to ${DEFAULT_UPSTREAM_BASE_URL}: ${
      error instanceof Error ? error.message : String(error)
    }`
  );
  upstreamState = { state: "degraded", reason: "managed_upstream_invalid" };
  db.settings.upstreamBaseUrl = upstreamPolicy.configuredBaseUrl || DEFAULT_UPSTREAM_BASE_URL;
  saveData();
}

if (knowledgeRuntime?.upstreamRef) {
  knowledgeRuntime.upstreamRef.current = db.settings.upstreamBaseUrl;
}

const requestGuards = {
  chat: createRequestGuard({
    scope: "chat",
    maxRequests: Number(process.env.CHAT_RATE_LIMIT_MAX || 30),
    maxConcurrent: Number(process.env.CHAT_MAX_CONCURRENT || 8)
  }),
  generation: createRequestGuard({
    scope: "generation",
    maxRequests: Number(process.env.GENERATION_RATE_LIMIT_MAX || 20),
    maxConcurrent: Number(process.env.GENERATION_MAX_CONCURRENT || 4)
  }),
  imageImport: createRequestGuard({
    scope: "image-import",
    maxRequests: Number(process.env.IMAGE_IMPORT_RATE_LIMIT_MAX || 12),
    maxConcurrent: Number(process.env.IMAGE_IMPORT_MAX_CONCURRENT || 2)
  }),
  imageTiming: createRequestGuard({
    scope: "image-timing",
    maxRequests: Number(process.env.IMAGE_TIMING_RATE_LIMIT_MAX || 120),
    maxConcurrent: Number(process.env.IMAGE_TIMING_MAX_CONCURRENT || 8)
  }),
  embedding: createRequestGuard({
    scope: "embedding",
    maxRequests: Number(process.env.EMBEDDING_RATE_LIMIT_MAX || 20),
    maxConcurrent: Number(process.env.EMBEDDING_MAX_CONCURRENT || 4)
  }),
  shellAuth: createRequestGuard({
    scope: "shell-auth",
    maxRequests: Number(process.env.SHELL_AUTH_RATE_LIMIT_MAX || 10),
    maxConcurrent: Number(process.env.SHELL_AUTH_MAX_CONCURRENT || 2)
  }),
  adminLogin: createRequestGuard({
    scope: "admin-login",
    maxRequests: Number(process.env.ADMIN_LOGIN_RATE_LIMIT_MAX || 5),
    maxConcurrent: Number(process.env.ADMIN_LOGIN_MAX_CONCURRENT || 2)
  }),
  progressSync: createRequestGuard({
    scope: "progress-sync",
    maxRequests: Number(process.env.PROGRESS_SYNC_RATE_LIMIT_MAX || 240),
    maxConcurrent: Number(process.env.PROGRESS_SYNC_MAX_CONCURRENT || 16)
  })
};

app.get("/api/progress-sync/status", (req, res) => {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  const config = progressSyncService.getConfig();
  res.json({
    enabled: db.settings.progressSync.enabled,
    ttlSeconds: config.ttlSeconds,
    maxPayloadBytes: config.maxPayloadBytes
  });
});

app.use("/api/progress-sync", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  next();
});
app.use("/api/progress-sync/sessions", requestGuards.progressSync);
app.use("/api/progress-sync", (req, res, next) => {
  if (!db.settings.progressSync.enabled) {
    res.setHeader("Cache-Control", "no-store, max-age=0");
    return res.status(503).json({
      error: {
        code: "PROGRESS_SYNC_DISABLED",
        message: "服务器暂未启用跨设备临时同步"
      }
    });
  }
  return next();
});
app.use("/api/progress-sync", createProgressSyncRouter({ service: progressSyncService }));

app.use(
  "/api/workflows",
  createLangflowRouter({
    config: langflowConfig,
    getPublishedWorkflows: () => db.langflowWorkflows,
    resolveRuntime: (body) => {
      assertModuleAllowed("workflows");
      const runtime = resolveRuntimeProvider(body, "chat");
      return {
        connection: runtime.connection,
        entry: runtime.entry
      };
    }
  })
);

app.use("/api/chat/stream", requestGuards.chat);
app.use("/api/chat/title", requestGuards.chat);
app.use("/api/image/optimize-prompt", requestGuards.generation);
app.use("/api/image/import", requestGuards.imageImport);
app.use("/api/image/timing-estimate", requestGuards.imageTiming);
app.use("/api/agents/run", requestGuards.chat);
app.use("/api/audio/transcribe", requestGuards.generation);
app.use("/api/retrieval/embed", requestGuards.embedding);
app.use("/api/media/video/status", requestGuards.generation);
app.use("/api/generate", requestGuards.generation);
app.use("/api/admin/login", requestGuards.adminLogin);
app.use("/api/public/shell-token/exchange", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  next();
});
app.use("/api/public/shell-token/exchange", requestGuards.shellAuth);

// Keep large media payloads available while preventing ordinary JSON endpoints
// from inheriting the 32 MB parser limit.
app.use("/api/chat/stream", express.json({ limit: "36mb", strict: true }));
app.use("/api/chat/title", express.json({ limit: "256kb", strict: true }));
app.use("/api/agents/run", express.json({ limit: "2mb", strict: true }));
app.use("/api/image/optimize-prompt", express.json({ limit: "256kb", strict: true }));
app.use("/api/image/import", express.json({ limit: "16kb", strict: true }));
app.use("/api/audio/transcribe", express.json({ limit: "36mb", strict: true }));
app.use("/api/retrieval/embed", express.json({ limit: "512kb", strict: true }));
app.use("/api/media/video/status", express.json({ limit: "1mb", strict: true }));
app.use("/api/generate", express.json({ limit: "32mb", strict: true }));
app.use("/api/public/shell-token/exchange", express.json({ limit: "16kb", strict: true }));
app.use(express.json({ limit: "2mb", strict: true }));

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

const asyncRoute = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

function createRequestAbortController(req, res, timeoutMs = Number(process.env.UPSTREAM_TIMEOUT_MS || 120_000)) {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    req.upstreamTimedOut = true;
    controller.abort(new Error("upstream request timeout"));
  }, Number.isFinite(timeoutMs) && timeoutMs > 0 ? Math.min(Math.trunc(timeoutMs), 900_000) : 120_000);
  const abort = () => controller.abort();
  const onClose = () => {
    abort();
    cleanup();
  };
  const cleanup = () => {
    clearTimeout(timeout);
    req.removeListener("aborted", abort);
    res.removeListener("close", onClose);
    res.removeListener("finish", cleanup);
  };
  req.once("aborted", abort);
  res.once("close", onClose);
  res.once("finish", cleanup);
  return controller;
}

function parseCookies(header = "") {
  return header
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const index = part.indexOf("=");
      if (index === -1) return cookies;
      cookies[decodeURIComponent(part.slice(0, index))] = decodeURIComponent(part.slice(index + 1));
      return cookies;
    }, {});
}

function signAdmin(value) {
  const derivedSecret = adminCredentialStore.sessionSecret();
  const secret = explicitAdminSessionSecret || (derivedSecret.length ? derivedSecret : "dev-only-admin-session-secret");
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function createAdminSessionCookie() {
  const payload = Buffer.from(
    JSON.stringify({
      role: "admin",
      revision: adminCredentialStore.revision,
      expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 14
    })
  ).toString("base64url");
  return `${payload}.${signAdmin(payload)}`;
}

function isValidAdminSession(token = "") {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;

  const expected = signAdmin(payload);
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length) return false;
  if (!crypto.timingSafeEqual(providedBuffer, expectedBuffer)) return false;

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return (
      session.role === "admin" &&
      session.revision === adminCredentialStore.revision &&
      session.expiresAt > Date.now()
    );
  } catch {
    return false;
  }
}

function hasAdminAuth(req) {
  if (!adminCredentialStore.configured) return false;
  const cookies = parseCookies(req.headers.cookie || "");
  return isValidAdminSession(cookies.cw_admin_session);
}

function requireAdmin(req, res, next) {
  if (!adminCredentialStore.configured) {
    return res.status(503).json({ error: "管理员凭据未配置，后台已锁定" });
  }
  if (hasAdminAuth(req)) return next();
  return res.status(401).json({ error: "需要管理员登录" });
}

function requireKnowledgeAdmin(req, _res, next) {
  if (!adminCredentialStore.configured) {
    return next(
      new KnowledgeError(
        KNOWLEDGE_ERROR_CODES.ADMIN_UNAVAILABLE,
        "管理员凭据未配置，知识库后台已锁定",
        { status: 503 }
      )
    );
  }
  if (hasAdminAuth(req)) return next();
  return next(
    new KnowledgeError(
      KNOWLEDGE_ERROR_CODES.ADMIN_AUTH_REQUIRED,
      "需要管理员登录",
      { status: 401 }
    )
  );
}

function setAdminCookie(req, res, token) {
  const secure = req.headers["x-forwarded-proto"] === "https" || req.secure;
  res.setHeader(
    "Set-Cookie",
    `cw_admin_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=1209600${
      secure ? "; Secure" : ""
    }`
  );
}

function clearAdminCookie(res) {
  res.setHeader("Set-Cookie", "cw_admin_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
}

function sortedMenuItems(items = db.menuItems) {
  return [...items].sort((a, b) => a.order - b.order);
}

function publicMenuItems() {
  return sortedMenuItems().filter((item) => item.visible && item.id !== "settings");
}

function adminMenuItems() {
  return sortedMenuItems().filter((item) => item.id !== "settings");
}

function publicToolSettings() {
  return normalizeToolSettings(db.toolSettings).map((tool) => ({
    ...tool,
    description: tool.enabled ? tool.description : `${tool.description}（后台已关闭）`
  }));
}

function isModuleEnabled(id) {
  const item = db.menuItems.find((menuItem) => menuItem.id === id);
  return Boolean(item?.visible && item?.enabled);
}

function assertChatAllowed() {
  if (!db.settings.allowGuestChat) throw httpError(403, "对话功能未开放");
  if (!isModuleEnabled("chat")) throw httpError(403, "对话菜单已关闭");
}

function assertModuleAllowed(id) {
  if (!isModuleEnabled(id)) throw httpError(403, "当前功能未开放");
}

function getAssistant(id, { allowEmpty = false } = {}) {
  if (id) {
    const exact = db.assistants.find((assistant) => assistant.id === id && assistant.enabled !== false);
    if (!exact) throw httpError(410, "助手已停用或不存在");
    return exact;
  }
  if (allowEmpty) return null;
  const fallback = db.assistants.find((assistant) => assistant.enabled !== false);
  if (!fallback) throw httpError(503, "当前没有可用助手");
  return fallback;
}

function getOptionalAssistant(id) {
  return getAssistant(id, { allowEmpty: true });
}

function getConversation(id) {
  const conversation = db.conversations.find((item) => item.id === id);
  if (!conversation) throw httpError(404, "会话不存在");
  return conversation;
}

function compact(value, maxLength) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

function boundedText(value, maxLength) {
  const text = String(value || "").trim();
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function boundedNumber(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

function optionalBoundedNumber(value, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.max(minimum, Math.min(maximum, parsed));
}

function optionalBoundedInteger(value, minimum, maximum) {
  const bounded = optionalBoundedNumber(value, minimum, maximum);
  return bounded === undefined ? undefined : Math.trunc(bounded);
}

function modelInputCharacterLimit(entry) {
  const configured = Number(entry?.maxInputCharacters);
  if (!Number.isSafeInteger(configured) || configured < 1_000) return 100_000;
  return Math.min(configured, 4_000_000);
}

function assertModelInputCharacters(entry, values, label = "Model input") {
  const limit = modelInputCharacterLimit(entry);
  const total = values.reduce((sum, value) => sum + String(value || "").length, 0);
  if (total > limit) {
    throw httpError(413, `${label} exceeds the configured ${limit.toLocaleString("en-US")} character limit`);
  }
  return limit;
}

function inlineAgentFromBody(value) {
  if (value === undefined || value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw httpError(400, "智能体定义无效");
  }
  const name = boundedText(value.name, 160);
  const systemPrompt = boundedText(value.systemPrompt, 24000);
  if (!name || !systemPrompt) throw httpError(400, "智能体名称和系统指令不能为空");
  const skillInstructions = Array.isArray(value.skillInstructions)
    ? value.skillInstructions
        .slice(0, 24)
        .map((instruction) => boundedText(instruction, 3000))
        .filter(Boolean)
    : [];
  return {
    id: compact(value.id || "browser-agent", 140),
    name,
    systemPrompt,
    skillInstructions
  };
}

function chatSkillInstructionsFromBody(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw httpError(400, "skillInstructions 必须是数组");
  return value
    .slice(0, 24)
    .map((instruction) => boundedText(instruction, 3000))
    .filter(Boolean);
}

function conversationSummary(conversation) {
  const lastMessage = [...conversation.messages].reverse().find((message) => message.content);
  return {
    id: conversation.id,
    title: conversation.title,
    assistantId: conversation.assistantId,
    pinned: Boolean(conversation.pinned),
    messageCount: conversation.messages.length,
    preview: lastMessage ? compact(lastMessage.content, 120) : "",
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt
  };
}

function sortConversations(conversations) {
  return [...conversations].sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

function createConversation({ title, assistantId }) {
  const createdAt = now();
  const assistant = getOptionalAssistant(assistantId);
  const conversation = {
    id: crypto.randomUUID(),
    title: String(title || "新对话").trim() || "新对话",
    assistantId: assistant?.id || "",
    pinned: false,
    messages: [],
    createdAt,
    updatedAt: createdAt
  };
  db.conversations.unshift(conversation);
  saveData();
  return conversation;
}

function makeTitle(content) {
  return compact(content, 32) || "新对话";
}

function sanitizeGeneratedConversationTitle(value) {
  const firstLine = String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) || "";
  const title = firstLine
    .replace(/^(?:标题|Title)\s*[:：]\s*/i, "")
    .replace(/^[#*`'"“”‘’\s]+|[#*`'"“”‘’\s]+$/g, "")
    .trim();
  return compact(title, 48) || "新对话";
}

function sanitizeRequestMessages(value, maxMessageCharacters = 24_000) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(-40)
    .map((message) => {
      if (!message || typeof message !== "object") return null;
      const role = message.role === "assistant" ? "assistant" : message.role === "user" ? "user" : "";
      if (!role) return null;
      const content = boundedText(message.content || "", maxMessageCharacters);
      if (!content) return null;
      return {
        id: compact(message.id || crypto.randomUUID(), 140),
        role,
        content,
        model: message.model ? compact(message.model, 180) : undefined,
        providerId: message.providerId ? compact(message.providerId, 180) : undefined,
        status: message.status,
        createdAt: message.createdAt || now()
      };
    })
    .filter(Boolean);
}

function requestConversationFromBody(body, assistant, content, entry) {
  const summary = body?.conversation && typeof body.conversation === "object" ? body.conversation : {};
  const createdAt = summary.createdAt || now();
  return {
    id: compact(summary.id || crypto.randomUUID(), 140),
    title: compact(summary.title || makeTitle(content), 120),
    assistantId: assistant?.id || "",
    pinned: Boolean(summary.pinned),
    messages: sanitizeRequestMessages(body?.history, modelInputCharacterLimit(entry)),
    createdAt,
    updatedAt: now()
  };
}

function buildPromptMessages(
  assistant,
  conversation,
  currentAttachments = [],
  skillInstructions = [],
  cloudKnowledge = null,
  searchContext = ""
) {
  const history = conversation.messages
    .filter((message) => ["user", "assistant"].includes(message.role))
    .slice(-30)
    .map((message, index, list) => {
      const isLatestUser = currentAttachments.length && index === list.length - 2 && message.role === "user";
      return {
        role: message.role,
        content: isLatestUser
          ? messageContentWithAttachments(message.content || "", currentAttachments)
          : message.content || ""
      };
    });

  const trustedContext = boundedText([
    assistant?.systemPrompt,
    ...skillInstructions.map((instruction, index) => `Skill ${index + 1}:\n${instruction}`)
  ].filter(Boolean).join("\n\n"), 48000);
  const systemContext = composeCloudKnowledgeSystemContext({
    trustedContext,
    knowledge: cloudKnowledge,
    trailingContext: boundedText(searchContext, 24000)
  });
  return systemContext ? [{ role: "system", content: systemContext }, ...history] : history;
}

function writeSse(res, event, payload) {
  return res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

function addTokenUsage(current, next) {
  const inputTokens = Number(next?.inputTokens || 0);
  const outputTokens = Number(next?.outputTokens || 0);
  const totalTokens = Number(next?.totalTokens || inputTokens + outputTokens);
  return {
    inputTokens: Number(current?.inputTokens || 0) + inputTokens,
    outputTokens: Number(current?.outputTokens || 0) + outputTokens,
    totalTokens: Number(current?.totalTokens || 0) + totalTokens
  };
}

function publicProviderError(error, ...connections) {
  let message = error instanceof Error ? error.message : String(error);
  connections.forEach((connection) => {
    if (connection?.apiKey) message = message.replaceAll(connection.apiKey, "[redacted]");
  });
  return compact(message, 700);
}

async function prepareIndependentSearch({ resolvedTools, service, query, signal, trace }) {
  const searchTool = resolvedTools?.searchTools?.[0];
  if (!searchTool) return "";
  const startedAt = now();
  try {
    const result = await runIndependentWebSearch({
      service,
      query,
      signal,
      upstreamBaseUrl: db.settings.upstreamBaseUrl
    });
    const context = formatSearchContext(result);
    if (Array.isArray(trace)) {
      trace.push({
        id: crypto.randomUUID(),
        toolName: searchTool.name,
        label: searchTool.label,
        argumentsPreview: compact(JSON.stringify({ query }), 600),
        resultPreview: compact(JSON.stringify({
          provider: result.provider,
          mode: result.mode,
          results: result.results?.length || 0,
          sources: result.sources || []
        }), 800),
        status: "completed",
        createdAt: startedAt
      });
    }
    return context;
  } catch (error) {
    if (Array.isArray(trace)) {
      trace.push({
        id: crypto.randomUUID(),
        toolName: searchTool.name,
        label: searchTool.label,
        argumentsPreview: compact(JSON.stringify({ query }), 600),
        resultPreview: publicProviderError(error, service),
        status: "failed",
        createdAt: startedAt
      });
    }
    throw error;
  }
}

async function prepareCloudKnowledge(req, query, signal) {
  try {
    return await cloudKnowledgeRequests.preflight(req, { query, signal });
  } catch (error) {
    if (error?.name === "AbortError" || signal?.aborted) {
      throw httpError(499, "请求已取消");
    }
    throw error;
  }
}

function resultPayload(module, title, patch = {}) {
  return {
    id: crypto.randomUUID(),
    module,
    title,
    status: "completed",
    createdAt: now(),
    ...patch
  };
}

function extractAssets(json, type, fallbackMimeType = "") {
  const data = Array.isArray(json?.data) ? json.data : Array.isArray(json?.output) ? json.output : [];
  const assets = [];

  const pushInlineData = (inlineData) => {
    const mimeType = inlineData?.mimeType || inlineData?.mime_type || "";
    const dataValue = inlineData?.data;
    if (!dataValue) return;
    const assetType = mimeType.startsWith("image/")
      ? "image"
      : mimeType.startsWith("audio/")
        ? "audio"
        : mimeType.startsWith("video/")
          ? "video"
          : type;
    assets.push({
      type: assetType,
      url: `data:${mimeType || "application/octet-stream"};base64,${dataValue}`
    });
  };

  for (const item of data) {
    if (typeof item === "string") {
      assets.push({ type: "link", url: item });
      continue;
    }
    if (item?.url) assets.push({ type, url: item.url });
    if (item?.b64_json) {
      const mime = fallbackMimeType || (type === "image" ? "image/png" : "application/octet-stream");
      assets.push({ type, url: `data:${mime};base64,${item.b64_json}` });
    }
  }

  const candidates = Array.isArray(json?.candidates) ? json.candidates : [];
  for (const candidate of candidates) {
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
    for (const part of parts) {
      if (part?.inlineData) pushInlineData(part.inlineData);
      if (part?.inline_data) pushInlineData(part.inline_data);
      if (part?.fileData?.fileUri) assets.push({ type: "link", url: part.fileData.fileUri });
      if (part?.file_data?.file_uri) assets.push({ type: "link", url: part.file_data.file_uri });
    }
  }

  const choices = Array.isArray(json?.choices) ? json.choices : [];
  for (const choice of choices) {
    const content = choice?.message?.content;
    const parts = Array.isArray(content) ? content : [];
    for (const part of parts) {
      const imageUrl = typeof part?.image_url === "string"
        ? part.image_url
        : part?.image_url?.url || part?.url;
      if (typeof imageUrl === "string" && imageUrl) assets.push({ type: "image", url: imageUrl });
    }
  }

  if (json?.url) assets.push({ type, url: json.url });
  if (json?.dataUrl) assets.push({ type, url: json.dataUrl });
  return assets;
}

function valueAtJsonPath(source, jsonPath) {
  const pathValue = String(jsonPath || "").trim();
  if (!pathValue) return undefined;
  if (!/^[A-Za-z0-9_.$[\]-]+$/.test(pathValue)) return undefined;
  return pathValue
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean)
    .reduce((current, key) => (current == null ? undefined : current[key]), source);
}

function mediaStatusFromJson(json, entry) {
  const configured = valueAtJsonPath(json, entry.mediaConfig?.statusJsonPath);
  const statusValue = String(configured || json.status || json.state || "").toLowerCase();
  if (["queued", "pending", "processing", "running", "submitted", "in_progress"].includes(statusValue)) {
    return "submitted";
  }
  if (["failed", "error", "cancelled", "canceled"].includes(statusValue)) return "failed";
  return "completed";
}

function mediaAssetsFromJson(json, type, entry) {
  const configured = valueAtJsonPath(json, entry.mediaConfig?.assetJsonPath);
  if (typeof configured === "string" && configured) return [{ type, url: configured }];
  if (Array.isArray(configured)) {
    return configured
      .map((item) => (typeof item === "string" ? { type, url: item } : item?.url ? { type, url: item.url } : null))
      .filter(Boolean);
  }
  return extractAssets(json, type);
}

function normalizeConnection(value) {
  const source = value && typeof value === "object" ? value : {};
  const apiKey = String(source.apiKey || "").trim();
  if (apiKey.length > MAX_API_KEY_CHARS) throw httpError(400, "API Key is too long");
  if (!apiKey) throw httpError(400, "API Key 不能为空");
  return { baseUrl: db.settings.upstreamBaseUrl, apiKey };
}

function audioFromDataUrl(dataUrl, fileName = "audio.webm", mimeType = "") {
  const match = String(dataUrl || "").match(/^data:(audio\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (!match) throw httpError(400, "请上传有效的音频文件");
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length) throw httpError(400, "音频文件为空");
  if (buffer.length > 25 * 1024 * 1024) throw httpError(400, "音频文件不能超过 25MB");
  return {
    fileBuffer: buffer,
    mimeType: mimeType || match[1],
    fileName: compact(fileName || "audio.webm", 160),
    dataUrl
  };
}

function imageInputFrom(value, label = "图片", maxUploadMb = 8) {
  const source = value && typeof value === "object" ? value : {};
  const dataUrl = String(source.dataUrl || "");
  const match = dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) throw httpError(400, `请上传有效的${label}`);
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length) throw httpError(400, `${label}不能为空`);
  if (bytes.length > maxUploadMb * 1024 * 1024) {
    throw httpError(400, `${label}不能超过 ${maxUploadMb}MB`);
  }
  return {
    dataUrl,
    mimeType: match[1].toLowerCase(),
    name: compact(source.name || `${label}.png`, 160),
    size: bytes.length
  };
}

function imageInputsFrom(value, label = "图片", maxItems = 1) {
  if (!Array.isArray(value)) return [];
  if (value.length > maxItems) {
    throw httpError(400, `${label}最多支持 ${maxItems} 张`);
  }
  return value.map((item, index) => imageInputFrom(item, `${label}${index + 1}`));
}

function pngImageMetadata(dataUrl) {
  const match = String(dataUrl || "").match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) return null;
  const bytes = Buffer.from(match[1], "base64");
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(signature) || bytes.toString("ascii", 12, 16) !== "IHDR") {
    return null;
  }
  const colorType = bytes[25];
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    hasAlpha: colorType === 4 || colorType === 6 || bytes.includes(Buffer.from("tRNS"), 8)
  };
}

async function referenceImageUrlsFrom(value, maxItems = 4) {
  if (!Array.isArray(value)) return [];
  if (value.length > maxItems) {
    throw httpError(400, `参考图链接最多支持 ${maxItems} 条`);
  }
  const seen = new Set();
  const unique = value
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .map((item) => {
      let parsed;
      try {
        parsed = new URL(item);
      } catch {
        throw httpError(400, "参考图链接必须是有效的 HTTPS 地址");
      }
      if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
        throw httpError(400, "参考图链接必须是可公开访问的 HTTPS 地址");
      }
      return parsed.toString();
    })
    .filter((item) => {
      if (seen.has(item)) return false;
      seen.add(item);
      return true;
    });
  try {
    return await Promise.all(unique.map((item) => assertSafePublicHttpsUrl(item)));
  } catch {
    throw httpError(400, "Reference image URLs must resolve to public HTTPS addresses");
  }
}

function extractConnection(body) {
  if (body?.connection && typeof body.connection === "object") {
    return normalizeConnection(body.connection);
  }
  if (body?.transientProvider && typeof body.transientProvider === "object") {
    return normalizeConnection(body.transientProvider);
  }
  return null;
}

function extractModelId(body) {
  return String(
    body?.modelId ||
      body?.transientProvider?.modelId ||
      body?.transientProvider?.model ||
      body?.model ||
      ""
  ).trim();
}

function modelSupports(entry, capability) {
  if (capability === "tts") {
    return entry.capabilities.includes("tts") || entry.capabilities.includes("audio");
  }
  return entry.capabilities.includes(capability);
}

function resolveCatalogEntry(body, capability) {
  const modelId = extractModelId(body);
  if (!modelId) throw httpError(400, "请选择模型");
  const entry = findModelEntry(db.modelCatalog, modelId);
  if (!entry) throw httpError(404, "模型目录中找不到该模型");
  if (!entry.enabled) throw httpError(400, "该模型已停用");
  if (capability && !modelSupports(entry, capability)) {
    throw httpError(400, "所选模型不支持当前功能");
  }
  return entry;
}

function resolveRuntimeProvider(body, capability) {
  const connection = extractConnection(body);
  if (!connection) throw httpError(400, "请先填写 API Key");
  const entry = resolveCatalogEntry(body, capability);
  return {
    connection,
    entry,
    provider: buildRuntimeProvider(entry, connection)
  };
}

function defaultModelFor(capability, preferredVendor) {
  const enabled = publicModelCatalog(db.modelCatalog, db.modelVendors).filter((entry) => modelSupports(entry, capability));
  return (
    enabled.find((entry) => entry.vendor === preferredVendor) ||
    enabled[0]
  );
}

function resolveEmbeddingRuntime(body, connection, preferredVendor) {
  const requestedModelId = String(
    body?.embeddingModelId || body?.options?.embeddingModelId || ""
  ).trim();
  const entry = requestedModelId
    ? resolveCatalogEntry({ modelId: requestedModelId }, "embedding")
    : defaultModelFor("embedding", preferredVendor);
  if (!entry) return null;
  if (!modelSupports(entry, "embedding")) {
    throw httpError(400, "Selected embedding model does not support embedding");
  }
  return {
    entry,
    provider: buildRuntimeProvider(entry, connection)
  };
}

function publicRetrievedChunks(chunks = []) {
  return chunks.map((chunk) => ({
    id: chunk.id,
    index: chunk.index,
    documentId: chunk.documentId,
    documentName: chunk.documentName,
    text: chunk.text,
    score: Number.isFinite(chunk.score) ? Number(chunk.score.toFixed(4)) : 0
  }));
}

function requestKnowledgeChunks(value) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 120)
    .map((chunk, index) => {
      if (!chunk || typeof chunk !== "object") return null;
      const text = compact(chunk.text || "", 2400);
      if (!text) return null;
      return {
        id: compact(chunk.id || `request-chunk-${index}`, 180),
        documentId: chunk.documentId ? compact(chunk.documentId, 180) : undefined,
        documentName: chunk.documentName ? compact(chunk.documentName, 180) : undefined,
        index: Number.isFinite(Number(chunk.index)) ? Number(chunk.index) : index,
        text
      };
    })
    .filter(Boolean);
}

const reasoningEffortAllowlist = new Set(["default", "off", "low", "medium", "high", "xhigh"]);

function sanitizeReasoningEffort(value) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return reasoningEffortAllowlist.has(normalized) ? normalized : "default";
}

function sanitizeChatAttachments(value, entry) {
  if (!Array.isArray(value)) return [];
  let imageCount = 0;
  let textCount = 0;
  let totalImageBytes = 0;
  const attachments = value.slice(0, 10).map((attachment, index) => {
    if (!attachment || typeof attachment !== "object") return null;
    const kind = String(attachment.kind || "");
    const name = compact(attachment.name || `附件 ${index + 1}`, 140);
    const mimeType = compact(attachment.mimeType || "", 120);
    const size = Number.isFinite(Number(attachment.size)) ? Number(attachment.size) : 0;

    if (kind === "image") {
      imageCount += 1;
      if (imageCount > 6) throw httpError(400, "单次最多发送 6 张图片");
      const dataUrl = String(attachment.dataUrl || "");
      if (!/^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(dataUrl)) {
        throw httpError(400, `${name} 不是可用图片`);
      }
      const decodedBytes = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64").length;
      totalImageBytes += decodedBytes;
      if (
        dataUrl.length > 5_600_000 ||
        decodedBytes > MAX_CHAT_IMAGE_BYTES ||
        size > MAX_CHAT_IMAGE_BYTES ||
        totalImageBytes > MAX_CHAT_IMAGE_TOTAL_BYTES
      ) {
        throw httpError(413, `${name} 超过图片附件大小限制`);
      }
      if (!entry.capabilities.includes("vision")) {
        throw httpError(400, "当前模型未启用视觉能力，不能发送图片附件");
      }
      return { type: "image", name, mimeType, size: decodedBytes, dataUrl };
    }

    if (kind === "text") {
      textCount += 1;
      if (textCount > 4) throw httpError(400, "单次最多发送 4 个文本附件");
      const text = boundedText(attachment.text || "", 12000);
      if (!text) return null;
      return { type: "text", name, mimeType, size, text };
    }

    return null;
  });

  return attachments.filter(Boolean);
}

function messageContentWithAttachments(content, attachments = []) {
  if (!attachments.length) return content;
  const parts = [{ type: "text", text: content }];
  for (const attachment of attachments) {
    if (attachment.type === "image") {
      parts.push({
        type: "image",
        name: attachment.name,
        mimeType: attachment.mimeType,
        dataUrl: attachment.dataUrl
      });
      continue;
    }
    parts.push({
      type: "text",
      text: `\n\n[Attachment: ${attachment.name}]\n${attachment.text}`
    });
  }
  return parts;
}

async function requestChatCompletion({
  provider,
  model,
  messages,
  temperature,
  topP,
  reasoningEffort,
  maxTokens,
  responseVerbosity,
  skillInstructions,
  signal,
  tools,
  hostedTools,
  toolContext,
  onUsage
}) {
  const adapter = createProviderAdapter(provider);
  const enabledTools = Array.isArray(tools) ? tools : [];
  const enabledToolNames = new Set(enabledTools.map((tool) => tool.name));
  return adapter.completeText({
    model,
    messages,
    temperature,
    topP,
    reasoningEffort,
    maxTokens,
    responseVerbosity,
    onUsage,
    signal,
    tools: enabledTools,
    hostedTools: Array.isArray(hostedTools) ? hostedTools : [],
    runTool: enabledTools.length
      ? async (toolCall) => {
          const trace = toolContext?.trace;
          const startedAt = now();
          try {
            if (!enabledToolNames.has(toolCall.name)) {
              throw new Error(`Tool is not allowed for this request: ${toolCall.name}`);
            }
            const result = await runRegisteredTool(toolCall, toolContext || {}, db.toolSettings);
            if (Array.isArray(trace)) {
              trace.push({
                id: crypto.randomUUID(),
                toolName: toolCall.name,
                label: normalizeToolSettings(db.toolSettings).find((tool) => tool.name === toolCall.name)?.label || toolCall.name,
                argumentsPreview: compact(JSON.stringify(toolCall.arguments || {}), 600),
                resultPreview: compact(JSON.stringify(result), 800),
                status: "completed",
                createdAt: startedAt
              });
            }
            return result;
          } catch (error) {
            if (Array.isArray(trace)) {
              trace.push({
                id: crypto.randomUUID(),
                toolName: toolCall.name,
                label: toolCall.name,
                argumentsPreview: compact(JSON.stringify(toolCall.arguments || {}), 600),
                resultPreview: publicProviderError(error, null),
                status: "failed",
                createdAt: startedAt
              });
            }
            throw error;
          }
        }
      : undefined
  });
}

async function requestPromptToolCompletion({
  provider,
  model,
  messages,
  temperature,
  topP,
  reasoningEffort,
  maxTokens,
  responseVerbosity,
  signal,
  tools,
  toolContext,
  onUsage
}) {
  const adapter = createProviderAdapter(provider);
  const enabledTools = Array.isArray(tools) ? tools : [];
  const enabledToolNames = new Set(enabledTools.map((tool) => tool.name));
  return runPromptToolLoop({
    tools: enabledTools,
    messages,
    complete: (nextMessages) => adapter.completeText({
      model,
      messages: nextMessages,
      temperature,
      topP,
      reasoningEffort,
      maxTokens,
      responseVerbosity,
      onUsage,
      signal
    }),
    execute: async (toolCall) => {
      if (!enabledToolNames.has(toolCall.name)) {
        throw new Error(`Tool is not allowed for this request: ${toolCall.name}`);
      }
      const startedAt = now();
      try {
        const result = await runRegisteredTool(toolCall, toolContext || {}, db.toolSettings);
        if (Array.isArray(toolContext?.trace)) {
          toolContext.trace.push({
            id: crypto.randomUUID(),
            toolName: toolCall.name,
            label: normalizeToolSettings(db.toolSettings).find((tool) => tool.name === toolCall.name)?.label || toolCall.name,
            argumentsPreview: compact(JSON.stringify(toolCall.arguments || {}), 600),
            resultPreview: compact(JSON.stringify(result), 800),
            status: "completed",
            createdAt: startedAt
          });
        }
        return result;
      } catch (error) {
        if (Array.isArray(toolContext?.trace)) {
          toolContext.trace.push({
            id: crypto.randomUUID(),
            toolName: toolCall.name,
            label: toolCall.name,
            argumentsPreview: compact(JSON.stringify(toolCall.arguments || {}), 600),
            resultPreview: publicProviderError(error, null),
            status: "failed",
            createdAt: startedAt
          });
        }
        throw error;
      }
    }
  });
}

async function streamProviderReply({
  provider,
  assistant,
  conversation,
  model,
  attachments,
  temperature,
  topP,
  reasoningEffort,
  maxTokens,
  responseVerbosity,
  toolInvocationMode,
  skillInstructions,
  cloudKnowledge,
  searchContext,
  tools,
  hostedTools,
  toolContext,
  signal,
  onToken,
  onUsage
}) {
  const adapter = createProviderAdapter(provider);
  if (tools?.length || hostedTools?.length) {
    const text = await (toolInvocationMode === "prompt" && tools?.length
      ? requestPromptToolCompletion({
          provider,
          model,
          messages: buildPromptMessages(
            assistant,
            conversation,
            attachments,
            skillInstructions,
            cloudKnowledge,
            searchContext
          ),
          temperature,
          topP,
          reasoningEffort,
          maxTokens,
          responseVerbosity,
          signal,
          tools,
          toolContext,
          onUsage
        })
      : requestChatCompletion({
      provider,
      model,
      messages: buildPromptMessages(
        assistant,
        conversation,
        attachments,
        skillInstructions,
        cloudKnowledge,
        searchContext
      ),
      temperature,
      topP,
      reasoningEffort,
      maxTokens,
      responseVerbosity,
      signal,
      tools,
      hostedTools,
      toolContext,
      onUsage
    }));
    if (text) await onToken(text);
    return;
  }
  await adapter.streamChat({
    model,
    messages: buildPromptMessages(
      assistant,
      conversation,
      attachments,
      skillInstructions,
      cloudKnowledge,
      searchContext
    ),
    temperature,
    topP,
    reasoningEffort,
    maxTokens,
    responseVerbosity,
    onUsage,
    signal,
    onToken
  });
}

function assistantFromBody(body, existing) {
  const nextNow = now();
  const name = String(body.name ?? existing?.name ?? "").trim().slice(0, 160);
  const description = String(body.description ?? existing?.description ?? "").trim().slice(0, 1000);
  const category = String(body.category ?? existing?.category ?? "通用效率").trim().slice(0, 80) || "通用效率";
  const tags = normalizeAssistantTextList(body.tags, existing?.tags, /[,，\r\n]+/, 12, 80);
  const starterPrompts = normalizeAssistantTextList(body.starterPrompts, existing?.starterPrompts, /[\r\n]+/, 8, 400);
  const avatar = normalizeAssistantAvatar(body.avatar, existing?.avatar);
  const systemPrompt = String(body.systemPrompt ?? existing?.systemPrompt ?? "").trim().slice(0, 24000);
  const color = String(body.color ?? existing?.color ?? "#ff2442").trim().slice(0, 32);
  const enabled = typeof body.enabled === "boolean" ? body.enabled : existing?.enabled !== false;

  if (!name) throw httpError(400, "助手名称不能为空");
  if (!systemPrompt) throw httpError(400, "系统提示词不能为空");

  return {
    id: existing?.id || crypto.randomUUID(),
    name,
    description,
    category,
    tags,
    starterPrompts,
    avatar,
    color,
    systemPrompt,
    enabled,
    createdAt: existing?.createdAt || nextNow,
    updatedAt: nextNow
  };
}

function sanitizeAdminModelCatalogEntry(body, existing) {
  const model = String(body?.model ?? existing?.model ?? "").trim();
  if (!model) throw httpError(400, "实际请求模型名不能为空");
  const label = String(body?.label ?? existing?.label ?? "").trim();
  if (!label) throw httpError(400, "前台显示名称不能为空");
  const vendorId = String(body?.vendorId ?? existing?.vendorId ?? "").trim();
  const vendorEntry = db.modelVendors.find((vendor) => vendor.id === vendorId);
  if (!vendorEntry) throw httpError(400, "模型厂商不存在");
  const candidate = normalizeCatalogEntry(
    {
      ...(existing || {}),
      ...(body || {}),
      model,
      label,
      id: existing?.id || body?.id,
      vendorId: vendorEntry.id,
      vendor: vendorEntry.adapter,
      order: existing?.order ?? db.modelCatalog.reduce(
        (highest, entry) => Math.max(highest, Number(entry.order) || 0),
        -1
      ) + 1
    },
    existing
  );
  return {
    ...candidate,
    id: existing?.id || candidate.id,
    vendorId: vendorEntry.id,
    vendor: vendorEntry.adapter,
    vendorLabel: vendorEntry.label
  };
}

function sanitizeAdminModelVendor(body) {
  const label = String(body?.label || "").trim().slice(0, 80);
  if (!label) throw httpError(400, "模型厂商名称不能为空");
  const adapter = String(body?.adapter || "").trim();
  if (!vendorKinds.includes(adapter)) throw httpError(400, "模型厂商适配器不受支持");
  if (db.modelVendors.some((vendor) => vendor.label.localeCompare(label, undefined, { sensitivity: "accent" }) === 0)) {
    throw httpError(409, "模型厂商名称已存在");
  }
  return normalizeModelVendorEntry({
    id: crypto.randomUUID(),
    label,
    adapter,
    enabled: true,
    order: db.modelVendors.reduce((highest, vendor) => Math.max(highest, vendor.order), -1) + 1
  });
}

function sanitizeAppPreset(body, existing) {
  const candidate = normalizeAppPreset(
    { ...(existing || {}), ...(body || {}), id: existing?.id || body?.id },
    existing || {}
  );
  if (!candidate.name) throw httpError(400, "应用名称不能为空");
  if (!candidate.prompt) throw httpError(400, "应用提示词不能为空");
  return {
    ...candidate,
    id: existing?.id || candidate.id || crypto.randomUUID()
  };
}

function sanitizePromptPreset(body, existing) {
  const candidate = normalizePromptPreset(
    { ...(existing || {}), ...(body || {}), id: existing?.id || body?.id },
    existing || {}
  );
  if (!candidate.title) throw httpError(400, "预设标题不能为空");
  if (!candidate.prompt) throw httpError(400, "预设内容不能为空");
  return {
    ...candidate,
    id: existing?.id || candidate.id || crypto.randomUUID()
  };
}

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    version: "0.3.0",
    adminConfigured: adminCredentialStore.configured,
    knowledge: publicKnowledgeRuntimeStatus(knowledgeRuntime),
    langflow: publicLangflowStatus(langflowConfig)
  });
});

app.get("/api/ready", (req, res) => {
  const readiness = buildReadinessPayload();
  res.status(readiness.ready ? 200 : 503).json(readiness);
});

function publicBootstrapPayload() {
  return {
    settings: db.settings,
    menuItems: publicMenuItems(),
    modelCatalog: publicModelCatalog(db.modelCatalog, db.modelVendors),
    assistants: db.assistants.filter((assistant) => assistant.enabled !== false),
    appPresets: db.appPresets.filter((preset) => preset.enabled),
    promptPresets: db.promptPresets.filter((preset) => preset.enabled),
    langflow: publicLangflowStatus(langflowConfig),
    langflowWorkflows: publicLangflowWorkflows(db.langflowWorkflows),
    conversations: [],
    toolSettings: publicToolSettings()
  };
}

app.get("/api/public/bootstrap", (req, res) => {
  res.json(publicBootstrapPayload());
});

app.post("/api/public/shell-token/exchange", asyncRoute(async (req, res) => {
  const controller = createRequestAbortController(req, res, 20_000);
  try {
    const result = await exchangeShellJwt({
      token: req.body?.token,
      upstreamBaseUrl: db.settings.upstreamBaseUrl,
      signal: controller.signal
    });
    res.json(result);
  } catch (error) {
    if (error instanceof ShellJwtExchangeError) {
      return res.status(error.status).json({
        error: {
          code: error.code,
          message: error.message
        }
      });
    }
    throw error;
  }
}));

app.get("/api/admin/status", (req, res) => {
  res.json({
    authRequired: true,
    authenticated: hasAdminAuth(req),
    adminConfigured: adminCredentialStore.configured
  });
});

app.post("/api/admin/login", (req, res) => {
  if (!adminCredentialStore.configured) {
    return res.status(503).json({ error: "管理员凭据未配置，后台已锁定" });
  }
  if (!adminCredentialStore.verify(req.body?.username, req.body?.password)) {
    return res.status(401).json({ error: "管理员用户名或密码不正确" });
  }
  setAdminCookie(req, res, createAdminSessionCookie());
  res.json({ ok: true });
});

app.post("/api/admin/logout", (req, res) => {
  clearAdminCookie(res);
  res.json({ ok: true });
});

const adminRouter = express.Router();
adminRouter.use(requireAdmin);
adminRouter.use(createMetadataWriteQueue());

adminRouter.get("/bootstrap", (req, res) => {
  res.json({
    adminUsername: adminCredentialStore.username,
    settings: db.settings,
    menuItems: adminMenuItems(),
    modelVendors: db.modelVendors,
    modelCatalog: db.modelCatalog,
    assistants: db.assistants,
    appPresets: db.appPresets,
    promptPresets: db.promptPresets,
    langflow: publicLangflowStatus(langflowConfig),
    langflowWorkflows: db.langflowWorkflows,
    toolSettings: normalizeToolSettings(db.toolSettings)
  });
});

adminRouter.patch("/credentials", (req, res) => {
  try {
    const previousUsername = adminCredentialStore.username;
    const result = adminCredentialStore.rotate({
      currentPassword: req.body?.currentPassword,
      username: req.body?.username,
      password: req.body?.password
    });
    try {
      appendAudit("admin-credentials-update", {
        usernameChanged: result.username !== previousUsername,
        passwordChanged: Boolean(req.body?.password)
      });
    } catch (error) {
      console.error("Unable to append the Admin credential rotation audit record", error);
    }
    clearAdminCookie(res);
    res.json({
      ok: true,
      username: result.username,
      reauthenticationRequired: true
    });
  } catch (error) {
    if (String(error?.code || "").startsWith("ADMIN_")) {
      return res.status(error.status || 400).json({
        error: {
          code: error.code,
          message: error.message
        }
      });
    }
    throw error;
  }
});

adminRouter.patch("/settings", asyncRoute(async (req, res) => {
  const nextSettings = {
    ...db.settings,
    ...req.body,
    theme: "rednote"
  };
  const validMenuIds = new Set(adminMenuItems().map((item) => item.id));
  if (!validMenuIds.has(nextSettings.defaultModule)) {
    nextSettings.defaultModule = validMenuIds.has(db.settings.defaultModule)
      ? db.settings.defaultModule
      : defaultSettings().defaultModule;
  }
  nextSettings.siteName = String(nextSettings.siteName || db.settings.siteName).trim();
  nextSettings.allowGuestChat = Boolean(nextSettings.allowGuestChat);
  const requestedUpstream = String(
    nextSettings.upstreamBaseUrl || db.settings.upstreamBaseUrl || DEFAULT_UPSTREAM_BASE_URL
  ).trim();
  let parsedUpstream;
  try {
    parsedUpstream = await assertManagedUpstreamBaseUrl(requestedUpstream, {
      production: isProduction,
      allowLocal: String(process.env.ALLOW_LOCAL_UPSTREAM || "").toLowerCase() === "true",
      rejectOverride: true
    });
  } catch {
    throw httpError(400, "上游 API 域名无效或指向受限制的网络地址");
  }
  const upstreamUrl = new URL(parsedUpstream);
  if (isProduction && upstreamUrl.protocol !== "https:") {
    throw httpError(400, "生产环境的上游 API 域名必须使用 HTTPS");
  }
  nextSettings.upstreamBaseUrl = parsedUpstream;
  nextSettings.progressSync = normalizeSettings({
    ...db.settings,
    progressSync: nextSettings.progressSync
  }).progressSync;
  delete nextSettings.adminEntryEnabled;
  db.settings = nextSettings;
  progressSyncService.updateConfig(db.settings.progressSync);
  if (knowledgeRuntime?.upstreamRef) knowledgeRuntime.upstreamRef.current = db.settings.upstreamBaseUrl;
  saveData();
  appendAudit("settings-update", { siteName: db.settings.siteName, allowGuestChat: db.settings.allowGuestChat });
  res.json(db.settings);
}));

adminRouter.patch("/menu-items", (req, res) => {
  const incoming = Array.isArray(req.body?.menuItems)
    ? req.body.menuItems
    : Array.isArray(req.body)
      ? req.body
      : [];
  const byId = new Map(incoming.map((item) => [item.id, item]));
  db.menuItems = adminMenuItems().map((item) => {
    const next = byId.get(item.id);
    if (!next) return item;
    return {
      ...item,
      label: String(next.label || item.label).trim() || item.label,
      enabled: typeof next.enabled === "boolean" ? next.enabled : item.enabled,
      visible: typeof next.visible === "boolean" ? next.visible : item.visible,
      order: Number.isFinite(Number(next.order)) ? Number(next.order) : item.order
    };
  });
  saveData();
  appendAudit("menu-update", { menuItems: db.menuItems.length });
  res.json(sortedMenuItems());
});

adminRouter.get("/model-catalog", (req, res) => {
  res.json(db.modelCatalog);
});

adminRouter.post("/model-vendors", (req, res) => {
  const vendor = sanitizeAdminModelVendor(req.body || {});
  db.modelVendors.push(vendor);
  db.modelVendors = normalizeModelVendors(db.modelVendors, []);
  saveData();
  appendAudit("model-vendor-create", { id: vendor.id, adapter: vendor.adapter });
  res.status(201).json(vendor);
});

adminRouter.patch("/model-vendors/order", (req, res) => {
  const vendorIds = req.body?.vendorIds;
  if (!Array.isArray(vendorIds) || vendorIds.length !== db.modelVendors.length) {
    throw httpError(400, "模型厂商排序必须包含完整的厂商 ID 列表");
  }
  if (vendorIds.some((id) => typeof id !== "string" || !id.trim())) {
    throw httpError(400, "模型厂商排序包含无效的厂商 ID");
  }
  if (new Set(vendorIds).size !== vendorIds.length) {
    throw httpError(400, "模型厂商排序不能包含重复的厂商 ID");
  }

  const vendorsById = new Map(db.modelVendors.map((vendor) => [vendor.id, vendor]));
  if (vendorIds.some((id) => !vendorsById.has(id))) {
    throw httpError(400, "模型厂商排序包含未知的厂商 ID");
  }

  db.modelVendors = vendorIds.map((id, order) => ({ ...vendorsById.get(id), order }));
  saveData();
  appendAudit("model-vendor-reorder", {
    count: db.modelVendors.length,
    firstVendorId: db.modelVendors[0]?.id || null
  });
  res.json(db.modelVendors);
});

adminRouter.delete("/model-vendors/:id", (req, res) => {
  const index = db.modelVendors.findIndex((vendor) => vendor.id === req.params.id);
  if (index === -1) throw httpError(404, "模型厂商不存在");
  if (db.modelVendors.length <= 1) throw httpError(409, "必须至少保留一个模型厂商");
  if (db.modelCatalog.some((entry) => entry.vendorId === req.params.id)) {
    throw httpError(409, "模型厂商仍包含模型，请先迁移或删除模型");
  }
  const [removed] = db.modelVendors.splice(index, 1);
  saveData();
  appendAudit("model-vendor-delete", { id: removed.id, adapter: removed.adapter });
  res.status(204).end();
});

adminRouter.post("/model-catalog", (req, res) => {
  const entry = sanitizeAdminModelCatalogEntry(req.body || {});
  if (db.modelCatalog.some((current) => current.vendorId === entry.vendorId && current.model === entry.model)) {
    throw httpError(409, "当前模型厂商已存在相同的实际请求模型名");
  }
  db.modelCatalog.push(entry);
  saveData();
  appendAudit("model-create", { id: entry.id, vendor: entry.vendor, model: entry.model });
  res.status(201).json(entry);
});

adminRouter.patch("/model-catalog/order", (req, res) => {
  const modelIds = req.body?.modelIds;
  if (!Array.isArray(modelIds) || modelIds.length !== db.modelCatalog.length) {
    throw httpError(400, "模型排序必须包含完整的模型 ID 列表");
  }
  if (modelIds.some((id) => typeof id !== "string" || !id.trim())) {
    throw httpError(400, "模型排序包含无效的模型 ID");
  }
  if (new Set(modelIds).size !== modelIds.length) {
    throw httpError(400, "模型排序不能包含重复的模型 ID");
  }

  const catalogById = new Map(db.modelCatalog.map((entry) => [entry.id, entry]));
  if (modelIds.some((id) => !catalogById.has(id))) {
    throw httpError(400, "模型排序包含未知的模型 ID");
  }

  db.modelCatalog = modelIds.map((id, order) => ({ ...catalogById.get(id), order }));
  saveData();
  appendAudit("model-reorder", {
    count: db.modelCatalog.length,
    firstModelId: db.modelCatalog[0]?.id || null
  });
  res.json(db.modelCatalog);
});

adminRouter.patch("/model-catalog/:id", (req, res) => {
  const index = db.modelCatalog.findIndex((entry) => entry.id === req.params.id);
  if (index === -1) throw httpError(404, "模型不存在");
  const nextEntry = sanitizeAdminModelCatalogEntry(req.body || {}, db.modelCatalog[index]);
  if (db.modelCatalog.some((current, currentIndex) =>
    currentIndex !== index && current.vendorId === nextEntry.vendorId && current.model === nextEntry.model
  )) {
    throw httpError(409, "当前模型厂商已存在相同的实际请求模型名");
  }
  db.modelCatalog[index] = nextEntry;
  saveData();
  appendAudit("model-update", { id: db.modelCatalog[index].id, vendor: db.modelCatalog[index].vendor, model: db.modelCatalog[index].model });
  res.json(db.modelCatalog[index]);
});

adminRouter.delete("/model-catalog/:id", (req, res) => {
  const index = db.modelCatalog.findIndex((entry) => entry.id === req.params.id);
  if (index === -1) throw httpError(404, "模型不存在");
  const [removed] = db.modelCatalog.splice(index, 1);
  saveData();
  appendAudit("model-delete", { id: removed.id, vendor: removed.vendor, model: removed.model });
  res.status(204).end();
});

adminRouter.post("/assistants", (req, res) => {
  const assistant = assistantFromBody(req.body || {});
  db.assistants.unshift(assistant);
  saveData();
  res.status(201).json(assistant);
});

adminRouter.patch("/assistants/:id", (req, res) => {
  const index = db.assistants.findIndex((assistant) => assistant.id === req.params.id);
  if (index === -1) throw httpError(404, "助手不存在");
  db.assistants[index] = assistantFromBody(req.body || {}, db.assistants[index]);
  saveData();
  res.json(db.assistants[index]);
});

adminRouter.delete("/assistants/:id", (req, res) => {
  if (db.assistants.length <= 1) throw httpError(400, "至少保留一个助手");
  const index = db.assistants.findIndex((assistant) => assistant.id === req.params.id);
  if (index === -1) throw httpError(404, "助手不存在");
  db.assistants.splice(index, 1);
  saveData();
  res.status(204).end();
});

adminRouter.post("/apps", (req, res) => {
  const preset = sanitizeAppPreset(req.body || {});
  db.appPresets.unshift(preset);
  saveData();
  res.status(201).json(preset);
});

adminRouter.patch("/apps/:id", (req, res) => {
  const index = db.appPresets.findIndex((preset) => preset.id === req.params.id);
  if (index === -1) throw httpError(404, "应用不存在");
  db.appPresets[index] = sanitizeAppPreset(req.body || {}, db.appPresets[index]);
  saveData();
  res.json(db.appPresets[index]);
});

adminRouter.delete("/apps/:id", (req, res) => {
  const index = db.appPresets.findIndex((preset) => preset.id === req.params.id);
  if (index === -1) throw httpError(404, "应用不存在");
  db.appPresets.splice(index, 1);
  saveData();
  res.status(204).end();
});

adminRouter.post("/prompt-presets", (req, res) => {
  const preset = sanitizePromptPreset(req.body || {});
  db.promptPresets.unshift(preset);
  saveData();
  res.status(201).json(preset);
});

adminRouter.patch("/prompt-presets/:id", (req, res) => {
  const index = db.promptPresets.findIndex((preset) => preset.id === req.params.id);
  if (index === -1) throw httpError(404, "提示词预设不存在");
  db.promptPresets[index] = sanitizePromptPreset(req.body || {}, db.promptPresets[index]);
  saveData();
  res.json(db.promptPresets[index]);
});

adminRouter.delete("/prompt-presets/:id", (req, res) => {
  const index = db.promptPresets.findIndex((preset) => preset.id === req.params.id);
  if (index === -1) throw httpError(404, "提示词预设不存在");
  db.promptPresets.splice(index, 1);
  saveData();
  res.status(204).end();
});

function langflowWorkflowFromBody(body, existing = null) {
  try {
    return normalizeLangflowWorkflow(body, existing);
  } catch (error) {
    throw httpError(400, error instanceof Error ? error.message : "工作流配置无效");
  }
}

adminRouter.get("/langflow-workflows", (req, res) => {
  res.json({
    status: publicLangflowStatus(langflowConfig),
    items: db.langflowWorkflows
  });
});

adminRouter.post("/langflow-workflows", (req, res) => {
  const workflow = langflowWorkflowFromBody(req.body || {});
  if (db.langflowWorkflows.some((item) => item.flowId === workflow.flowId)) {
    throw httpError(409, "该 Langflow Flow ID 已经发布");
  }
  db.langflowWorkflows = normalizeLangflowWorkflows([...db.langflowWorkflows, workflow]);
  saveData();
  appendAudit("langflow-workflow-create", { id: workflow.id, flowId: workflow.flowId });
  res.status(201).json(workflow);
});

adminRouter.patch("/langflow-workflows/:id", (req, res) => {
  const index = db.langflowWorkflows.findIndex((workflow) => workflow.id === req.params.id);
  if (index === -1) throw httpError(404, "工作流不存在");
  const workflow = langflowWorkflowFromBody(req.body || {}, db.langflowWorkflows[index]);
  if (db.langflowWorkflows.some((item, itemIndex) => itemIndex !== index && item.flowId === workflow.flowId)) {
    throw httpError(409, "该 Langflow Flow ID 已经发布");
  }
  db.langflowWorkflows[index] = workflow;
  db.langflowWorkflows = normalizeLangflowWorkflows(db.langflowWorkflows);
  saveData();
  appendAudit("langflow-workflow-update", { id: workflow.id, flowId: workflow.flowId, enabled: workflow.enabled });
  res.json(workflow);
});

adminRouter.delete("/langflow-workflows/:id", (req, res) => {
  const index = db.langflowWorkflows.findIndex((workflow) => workflow.id === req.params.id);
  if (index === -1) throw httpError(404, "工作流不存在");
  const [removed] = db.langflowWorkflows.splice(index, 1);
  saveData();
  appendAudit("langflow-workflow-delete", { id: removed.id, flowId: removed.flowId });
  res.status(204).end();
});

adminRouter.patch("/tool-settings", (req, res) => {
  const incoming = Array.isArray(req.body?.toolSettings) ? req.body.toolSettings : req.body;
  db.toolSettings = normalizeToolsData(incoming);
  saveData();
  appendAudit("tool-settings-update", {
    enabled: db.toolSettings.filter((tool) => tool.enabled).map((tool) => tool.name)
  });
  res.json(db.toolSettings);
});

function adminMetadataPayload() {
  return {
    settings: db.settings,
    menuItems: adminMenuItems(),
    modelVendors: db.modelVendors,
    modelCatalog: db.modelCatalog,
    assistants: db.assistants,
    appPresets: db.appPresets,
    promptPresets: db.promptPresets,
    langflowWorkflows: db.langflowWorkflows,
    toolSettings: normalizeToolSettings(db.toolSettings)
  };
}

const allowedMetadataKeys = new Set([
  "settings",
  "menuItems",
  "modelVendors",
  "modelCatalog",
  "assistants",
  "appPresets",
  "promptPresets",
  "langflowWorkflows",
  "toolSettings"
]);

function findCredentialLikeKeys(value, pathParts = [], matches = []) {
  if (!value || typeof value !== "object") return matches;
  Object.entries(value).forEach(([key, child]) => {
    const nextPath = [...pathParts, key];
    const pathName = nextPath.join(".");
    if (/^(apiKey|baseUrl|secret|token|password)$/i.test(key) && pathName !== "settings.upstreamBaseUrl") {
      matches.push(pathName);
    }
    if (child && typeof child === "object") findCredentialLikeKeys(child, nextPath, matches);
  });
  return matches;
}

function buildMetadataImport(body) {
  const source = body && typeof body === "object" ? body : {};
  const unknownKeys = Object.keys(source).filter((key) => !allowedMetadataKeys.has(key));
  if (unknownKeys.length) throw httpError(400, `不支持的元数据字段：${unknownKeys.join(", ")}`);
  const credentialKeys = findCredentialLikeKeys(source);
  if (credentialKeys.length) throw httpError(400, `元数据不能包含凭据字段：${credentialKeys.slice(0, 8).join(", ")}`);

  if (Array.isArray(source.modelVendors) && !source.modelVendors.length) {
    throw httpError(400, "元数据必须至少包含一个模型厂商");
  }
  if (Array.isArray(source.modelVendors)) {
    const labels = new Set();
    for (const vendor of source.modelVendors) {
      const label = String(vendor?.label || "").trim();
      const normalizedLabel = label.toLocaleLowerCase("en-US");
      if (!label) throw httpError(400, "模型厂商名称不能为空");
      if (!vendorKinds.includes(vendor?.adapter)) throw httpError(400, "模型厂商适配器不受支持");
      if (labels.has(normalizedLabel)) throw httpError(409, "模型厂商名称重复");
      labels.add(normalizedLabel);
    }
  }
  const importedVendors = Array.isArray(source.modelVendors)
    ? normalizeModelVendors(source.modelVendors, [])
    : db.modelVendors;
  const importedCatalog = Array.isArray(source.modelCatalog)
    ? source.modelCatalog
    : db.modelCatalog;
  const registry = reconcileModelRegistry(importedVendors, importedCatalog, db.modelCatalog);

  return {
    settings: source.settings ? normalizeSettings(source.settings) : db.settings,
    menuItems: Array.isArray(source.menuItems) ? normalizeMenuItems(source.menuItems) : db.menuItems,
    modelVendors: registry.modelVendors,
    modelCatalog: registry.modelCatalog,
    assistants: Array.isArray(source.assistants) ? normalizeAssistants(source.assistants, db.assistants) : db.assistants,
    appPresets: Array.isArray(source.appPresets) ? normalizeAppPresets(source.appPresets, db.appPresets) : db.appPresets,
    promptPresets: Array.isArray(source.promptPresets) ? normalizePromptPresets(source.promptPresets, db.promptPresets) : db.promptPresets,
    langflowWorkflows: Array.isArray(source.langflowWorkflows)
      ? normalizeLangflowWorkflows(source.langflowWorkflows, db.langflowWorkflows)
      : db.langflowWorkflows,
    toolSettings: Array.isArray(source.toolSettings) ? normalizeToolsData(source.toolSettings) : normalizeToolsData(db.toolSettings)
  };
}

function metadataImportReport(nextData) {
  const current = adminMetadataPayload();
  const counts = {
    menuItems: nextData.menuItems.length,
    modelVendors: nextData.modelVendors.length,
    modelCatalog: nextData.modelCatalog.length,
    assistants: nextData.assistants.length,
    appPresets: nextData.appPresets.length,
    promptPresets: nextData.promptPresets.length,
    langflowWorkflows: nextData.langflowWorkflows.length,
    toolSettings: nextData.toolSettings.length
  };
  const changed = Object.entries(counts)
    .filter(([key, count]) => current[key]?.length !== count)
    .map(([key, count]) => `${key}: ${current[key]?.length || 0} -> ${count}`);
  return {
    ok: true,
    dryRun: true,
    counts,
    changed,
    warnings: nextData.modelCatalog.some((entry) => entry.enabled && entry.capabilities.includes("chat"))
      ? []
      : ["导入后没有启用的对话模型"]
  };
}

adminRouter.get("/metadata-export", (req, res) => {
  res.json(adminMetadataPayload());
});

adminRouter.patch("/metadata-import", asyncRoute(async (req, res) => {
  const nextData = buildMetadataImport(req.body);
  try {
    nextData.settings.upstreamBaseUrl = await assertManagedUpstreamBaseUrl(nextData.settings.upstreamBaseUrl, {
      production: isProduction,
      allowLocal: String(process.env.ALLOW_LOCAL_UPSTREAM || "").toLowerCase() === "true",
      rejectOverride: true
    });
  } catch {
    throw httpError(400, "导入数据中的上游 API 域名无效或不被允许");
  }
  const report = metadataImportReport(nextData);
  if (String(req.query.dryRun || "") === "true") return res.json(report);
  const backupFile = backupCurrentData("metadata-import");
  db.settings = nextData.settings;
  db.menuItems = nextData.menuItems;
  db.modelVendors = nextData.modelVendors;
  db.modelCatalog = nextData.modelCatalog;
  db.assistants = nextData.assistants;
  db.appPresets = nextData.appPresets;
  db.promptPresets = nextData.promptPresets;
  db.langflowWorkflows = nextData.langflowWorkflows;
  db.toolSettings = nextData.toolSettings;
  progressSyncService.updateConfig(db.settings.progressSync);
  if (knowledgeRuntime?.upstreamRef) knowledgeRuntime.upstreamRef.current = db.settings.upstreamBaseUrl;
  saveData();
  clearMetadataDegraded();
  appendAudit("metadata-import", {
    backupFile: path.relative(dataDir, backupFile),
    counts: report.counts,
    warnings: report.warnings
  });
  res.json(adminMetadataPayload());
}));

adminRouter.get("/ops", (req, res) => {
  res.json(buildAdminOpsPayload());
});

adminRouter.get("/backups", (req, res) => {
  res.json(listBackupFiles());
});

adminRouter.post("/backups/:name/restore", asyncRoute(async (req, res) => {
  const backupPath = safeBackupPath(req.params.name);
  const restored = normalizeData(JSON.parse(fs.readFileSync(backupPath, "utf8")));
  try {
    restored.settings.upstreamBaseUrl = await assertManagedUpstreamBaseUrl(restored.settings.upstreamBaseUrl, {
      production: isProduction,
      allowLocal: String(process.env.ALLOW_LOCAL_UPSTREAM || "").toLowerCase() === "true",
      rejectOverride: true
    });
  } catch {
    throw httpError(400, "备份中的上游 API 域名无效或不被允许");
  }
  const preRestoreBackup = backupCurrentData("pre-restore");
  db = restored;
  progressSyncService.updateConfig(db.settings.progressSync);
  if (knowledgeRuntime?.upstreamRef) knowledgeRuntime.upstreamRef.current = db.settings.upstreamBaseUrl;
  saveData();
  clearMetadataDegraded();
  appendAudit("backup-restore", {
    backupFile: path.relative(dataDir, backupPath),
    preRestoreBackup: path.relative(dataDir, preRestoreBackup)
  });
  res.json({
    ...adminMetadataPayload(),
    restored: true,
    restoredBackup: path.basename(backupPath)
  });
}));

adminRouter.get("/audit-log", (req, res) => {
  res.json(
    readAuditLog({
      action: req.query.action,
      limit: req.query.limit
    })
  );
});

app.use("/api/admin", adminRouter);

function publicConversationGone(req, res) {
  res.status(410).json({
    error: "公开对话历史已改为浏览器本地保存，服务端不再提供共享会话接口"
  });
}

app.get("/api/conversations", (req, res) => {
  publicConversationGone(req, res);
});

app.get("/api/conversations/:id", (req, res) => {
  publicConversationGone(req, res);
});

app.post("/api/conversations", (req, res) => {
  publicConversationGone(req, res);
});

app.patch("/api/conversations/:id", (req, res) => {
  publicConversationGone(req, res);
});

app.delete("/api/conversations/:id", (req, res) => {
  publicConversationGone(req, res);
});

app.get("/api/image/timing-estimate", (req, res) => {
  assertModuleAllowed("image");
  const entry = resolveCatalogEntry({ modelId: req.query.modelId }, "image");
  const key = normalizeImageTimingKey({
    modelId: entry.id,
    mode: req.query.mode,
    resolution: req.query.resolution,
    aspectRatio: req.query.aspectRatio,
    count: req.query.count
  });
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.json(imageGenerationTimingStore.estimate(key));
});

app.post(
  "/api/chat/title",
  asyncRoute(async (req, res) => {
    assertChatAllowed();
    const { connection, entry, provider } = resolveRuntimeProvider(req.body || {}, "chat");
    const history = sanitizeRequestMessages(req.body?.history).slice(-16);
    assertModelInputCharacters(entry, history.map((message) => message.content), "Title context");
    if (!history.length) throw httpError(400, "没有可用于总结标题的聊天记录");
    const transcript = history
      .map((message) => `${message.role === "assistant" ? "助手" : "用户"}：${message.content}`)
      .join("\n");
    const controller = createRequestAbortController(req, res);
    try {
      trackModelInvocation(res, entry, "chat-title");
      const result = await requestChatCompletion({
        provider,
        model: entry.model,
        messages: [
          {
            role: "system",
            content: "请将对话总结为一个准确、简洁的标题。只返回标题，不要引号、标点前缀或解释，最长 24 个汉字。"
          },
          { role: "user", content: transcript }
        ],
        temperature: 0.2,
        maxTokens: 64,
        tools: [],
        hostedTools: [],
        signal: controller.signal
      });
      res.json({ title: sanitizeGeneratedConversationTitle(result) });
    } catch (error) {
      if (req.upstreamTimedOut) throw httpError(504, "上游服务响应超时");
      if (error?.name === "AbortError" || controller.signal.aborted) throw httpError(499, "请求已取消");
      throw httpError(502, publicProviderError(error, connection));
    }
  })
);

app.post(
  "/api/image/import",
  asyncRoute(async (req, res) => {
    assertModuleAllowed("image");
    const sourceUrl = String(req.body?.url || "").trim();
    if (!sourceUrl) throw httpError(400, "缺少远程图片地址");
    try {
      const asset = await importPublicImageAsset(sourceUrl, {
        maxBytes: MAX_IMAGE_EDIT_UPLOAD_BYTES,
        timeoutMs: Number(process.env.IMAGE_IMPORT_TIMEOUT_MS || 30_000)
      });
      res.setHeader("Cache-Control", "no-store, max-age=0");
      return res.json(asset);
    } catch (error) {
      const message = error instanceof Error ? error.message : "远程图片读取失败";
      if (/invalid|HTTPS|credential|restricted|私网|限制|地址/u.test(message)) {
        throw httpError(400, message);
      }
      if (/超过允许大小/u.test(message)) throw httpError(413, message);
      throw httpError(502, message);
    }
  })
);

app.post(
  "/api/image/optimize-prompt",
  asyncRoute(async (req, res) => {
    assertModuleAllowed("image");
    const prompt = String(req.body?.prompt || "").trim();
    if (!prompt) throw httpError(400, "请输入需要优化的提示词");
    const { connection, entry, provider } = resolveRuntimeProvider(req.body || {}, "chat");
    assertModelInputCharacters(entry, [prompt], "Prompt optimization input");
    const controller = createRequestAbortController(req, res);
    try {
      trackModelInvocation(res, entry, "image-prompt-optimization");
      const optimized = await requestChatCompletion({
        provider,
        model: entry.model,
        messages: imagePromptOptimizationMessages(prompt),
        temperature: 0.3,
        maxTokens: 1200,
        tools: [],
        hostedTools: [],
        signal: controller.signal
      });
      res.json({ prompt: normalizeOptimizedImagePrompt(optimized) });
    } catch (error) {
      if (req.upstreamTimedOut) throw httpError(504, "上游服务响应超时");
      if (error?.name === "AbortError" || controller.signal.aborted) throw httpError(499, "请求已取消");
      throw httpError(502, publicProviderError(error, connection));
    }
  })
);

app.post(
  "/api/chat/stream",
  asyncRoute(async (req, res) => {
    assertChatAllowed();
    const content = String(req.body?.content || "").trim();
    if (!content) throw httpError(400, "消息不能为空");
    const displaySource = req.body?.displayContent || content;

    const { connection, entry, provider } = resolveRuntimeProvider(req.body || {}, "chat");
    const inputLimit = assertModelInputCharacters(entry, [content], "Chat message");
    const displayContent = boundedText(displaySource, inputLimit);
    const assistant = getOptionalAssistant(req.body?.assistantId);
    const model = entry.model;
    const attachments = sanitizeChatAttachments(req.body?.attachments, entry);
    const skillInstructions = chatSkillInstructionsFromBody(req.body?.skillInstructions);
    const toolInvocationMode = req.body?.toolInvocationMode === "prompt" ? "prompt" : "function";
    if (req.body?.allowedTools !== undefined && !Array.isArray(req.body.allowedTools)) {
      throw httpError(400, "allowedTools 必须是工具名称数组");
    }
    const requestedTools = Array.isArray(req.body?.allowedTools)
      ? req.body.allowedTools
          .slice(0, 32)
          .filter((tool) => typeof tool === "string")
          .map((tool) => compact(tool, 140))
          .filter(Boolean)
      : [];
    const toolContext = { trace: [] };
    const resolvedTools = resolveRequestedTools({
      context: toolContext,
      settings: db.toolSettings,
      entry,
      requestedNames: requestedTools,
      invocationMode: toolInvocationMode
    });
    if (resolvedTools.unavailable.length) {
      throw httpError(
        400,
        resolvedTools.unavailable.map((tool) => `${tool.name}：${tool.reason}`).join("；")
      );
    }
    const controller = createRequestAbortController(req, res);
    const cloudKnowledge = await prepareCloudKnowledge(req, displayContent, controller.signal);
    let searchContext = "";
    if (resolvedTools.searchTools.length) {
      if (!isSearchServiceReady(req.body?.searchService, { upstreamBaseUrl: db.settings.upstreamBaseUrl })) {
        throw httpError(400, "请先配置独立联网搜索服务的 API Key");
      }
      try {
        searchContext = await prepareIndependentSearch({
          resolvedTools,
          service: req.body.searchService,
          query: displayContent,
          signal: controller.signal,
          trace: toolContext.trace
        });
      } catch (searchError) {
        if (req.upstreamTimedOut) throw httpError(504, "上游服务响应超时");
        if (searchError?.name === "AbortError" || controller.signal.aborted) {
          throw httpError(499, "请求已取消");
        }
        throw httpError(502, publicProviderError(searchError, connection, req.body?.searchService));
      }
    }
    const temperature = boundedNumber(req.body?.temperature, 0.7, 0, 2);
    const topP = optionalBoundedNumber(req.body?.topP, 0, 1);
    const reasoningEffort = sanitizeReasoningEffort(req.body?.reasoningEffort);
    const responseVerbosity = ["low", "medium", "high"].includes(req.body?.responseVerbosity)
      ? req.body.responseVerbosity
      : undefined;
    const maxTokens = optionalBoundedInteger(req.body?.maxTokens, 1, 1_000_000);
    const conversation = requestConversationFromBody(req.body || {}, assistant, displayContent, entry);
    assertModelInputCharacters(
      entry,
      [
        ...conversation.messages.map((message) => message.content),
        content,
        ...attachments.filter((attachment) => attachment.type === "text").map((attachment) => attachment.text)
      ],
      "Chat context"
    );

    const createdAt = now();
    const userMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: displayContent,
      createdAt
    };
    const providerUserMessage = { ...userMessage, content };
    const assistantMessage = withCloudKnowledgeCitations({
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      model,
      providerId: entry.id,
      status: "streaming",
      createdAt
    }, cloudKnowledge);

    if (conversation.messages.length === 0 || conversation.title === "新对话") {
      conversation.title = makeTitle(displayContent);
    }
    conversation.messages.push(providerUserMessage, assistantMessage);
    conversation.updatedAt = now();

    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    });
    res.flushHeaders?.();
    writeSse(res, "meta", {
      conversation: conversationSummary(conversation),
      userMessage,
      assistantMessageId: assistantMessage.id
    });

    let finished = false;
    let clientClosed = false;
    let responseUsage = null;
    let tokenBufferError = null;
    const downstreamController = new AbortController();
    const tokenBuffer = createSseTokenBuffer({
      flushMs: optionalBoundedInteger(process.env.SSE_TOKEN_FLUSH_MS, 16, 100)
        ?? DEFAULT_SSE_TOKEN_FLUSH_MS,
      maxWaitMs: optionalBoundedInteger(process.env.SSE_TOKEN_MAX_WAIT_MS, 40, 200)
        ?? DEFAULT_SSE_TOKEN_MAX_WAIT_MS,
      maxChars: optionalBoundedInteger(process.env.SSE_TOKEN_MAX_CHARS, 128, 4096)
        ?? DEFAULT_SSE_TOKEN_MAX_CHARS,
      maxQueueChars: optionalBoundedInteger(process.env.SSE_TOKEN_MAX_QUEUE_CHARS, 1024, 131_072)
        ?? DEFAULT_SSE_TOKEN_MAX_QUEUE_CHARS,
      onFlush: (token) => {
        if (clientClosed) return undefined;
        return writeSseEventWithBackpressure(res, "token", { token }, {
          signal: downstreamController.signal,
          timeoutMs: optionalBoundedInteger(process.env.SSE_BACKPRESSURE_TIMEOUT_MS, 500, 30_000)
            ?? DEFAULT_SSE_BACKPRESSURE_TIMEOUT_MS
        });
      },
      onError: (error) => {
        tokenBufferError = error;
        if (!controller.signal.aborted) controller.abort();
      }
    });
    const heartbeatMs = optionalBoundedInteger(process.env.SSE_HEARTBEAT_MS, 5_000, 60_000)
      || DEFAULT_SSE_HEARTBEAT_MS;
    const heartbeat = setInterval(() => {
      if (!clientClosed && !res.writableEnded && !res.destroyed) res.write(": heartbeat\n\n");
    }, heartbeatMs);
    heartbeat.unref?.();
    res.on("close", () => {
      if (!finished && !res.writableEnded) {
        clientClosed = true;
        downstreamController.abort();
        controller.abort();
        tokenBuffer.cancel();
      }
    });

    try {
      trackModelInvocation(res, entry, "chat");
      await streamProviderReply({
        provider,
        assistant,
        conversation,
        model,
        attachments,
        temperature,
        topP,
        reasoningEffort,
        maxTokens,
        responseVerbosity,
        toolInvocationMode,
        skillInstructions,
        cloudKnowledge,
        searchContext,
        tools: resolvedTools.localTools,
        hostedTools: resolvedTools.hostedTools,
        toolContext,
        signal: controller.signal,
        onUsage: (usage) => {
          responseUsage = addTokenUsage(responseUsage, usage);
        },
        onToken: async (token) => {
          assistantMessage.content += token;
          if (!clientClosed) await tokenBuffer.push(token);
        }
      });
      await tokenBuffer.finish();

      assistantMessage.status = "done";
      if (req.body?.includeUsage === true && responseUsage?.totalTokens > 0) {
        assistantMessage.usage = responseUsage;
      }
      conversation.updatedAt = now();

      if (!clientClosed) {
        writeSse(res, "done", {
          conversation: conversationSummary(conversation),
          message: assistantMessage
        });
      }
    } catch (error) {
      const timedOut = Boolean(req.upstreamTimedOut);
      if (!clientClosed && !tokenBufferError) {
        try {
          await tokenBuffer.finish();
        } catch (flushError) {
          tokenBufferError = flushError;
        }
      }
      const failure = tokenBufferError || error;
      const aborted = !timedOut && !tokenBufferError && (error?.name === "AbortError" || controller.signal.aborted);
      assistantMessage.status = aborted ? "stopped" : "error";
      if (!assistantMessage.content && !aborted) {
        assistantMessage.content = timedOut
          ? "请求失败：上游服务响应超时"
          : `请求失败：${publicProviderError(failure, connection, req.body?.searchService)}`;
      }
      conversation.updatedAt = now();

      if (!clientClosed) {
        if (!aborted) {
          writeSse(res, "error", {
            error: timedOut ? "上游服务响应超时" : publicProviderError(failure, connection, req.body?.searchService)
          });
        }
        writeSse(res, "done", {
          conversation: conversationSummary(conversation),
          message: assistantMessage
        });
      }
    } finally {
      finished = true;
      clearInterval(heartbeat);
      downstreamController.abort();
      tokenBuffer.cancel();
      if (!res.writableEnded && !res.destroyed) res.end();
    }
  })
);

app.post(
  "/api/agents/run",
  asyncRoute(async (req, res) => {
    const sourceModule = req.body?.moduleId === "workflows" ? "workflows" : "agents";
    assertModuleAllowed(sourceModule);
    const prompt = boundedText(req.body?.prompt, 24000);
    if (!prompt) throw httpError(400, "请输入智能体任务");
    const { connection, entry, provider } = resolveRuntimeProvider(req.body || {}, "chat");
    const inlineAgent = inlineAgentFromBody(req.body?.agent);
    const assistant = inlineAgent || getAssistant(req.body?.assistantId);
    if (!assistant) throw httpError(400, "没有可用智能体");
    if (req.body?.allowedTools !== undefined && !Array.isArray(req.body.allowedTools)) {
      throw httpError(400, "allowedTools 必须是工具名称数组");
    }
    const requestedTools = Array.isArray(req.body?.allowedTools)
      ? req.body.allowedTools
          .slice(0, 32)
          .filter((tool) => typeof tool === "string")
          .map((tool) => compact(tool, 140))
          .filter(Boolean)
      : [];
    const contextChunks = requestKnowledgeChunks(req.body?.contextChunks);
    const controller = createRequestAbortController(req, res);
    const cloudKnowledge = await prepareCloudKnowledge(req, prompt, controller.signal);
    const searchableKnowledgeChunks = combineCloudKnowledgeSearchChunks(
      contextChunks,
      cloudKnowledge
    );
    const hasKnowledgeContext = searchableKnowledgeChunks.length > 0 || Boolean(cloudKnowledge);
    const toolContext = {
      trace: [],
      searchKnowledge: hasKnowledgeContext
        ? async (query, topK) => (
            await retrieveContext({ query, chunks: searchableKnowledgeChunks, topK })
          ).chunks
        : undefined
    };
    const resolvedTools = resolveRequestedTools({
      context: toolContext,
      settings: db.toolSettings,
      entry,
      requestedNames: requestedTools
    });
    if (resolvedTools.unavailable.length) {
      throw httpError(
        400,
        resolvedTools.unavailable.map((tool) => `${tool.name}：${tool.reason}`).join("；")
      );
    }
    const tools = resolvedTools.localTools;
    const hostedTools = resolvedTools.hostedTools;
    const searchTools = resolvedTools.searchTools;
    const trace = toolContext.trace;
    if (searchTools.length && !isSearchServiceReady(req.body?.searchService, { upstreamBaseUrl: db.settings.upstreamBaseUrl })) {
      throw httpError(400, "请先配置独立联网搜索服务的 API Key");
    }

    try {
      const searchContext = await prepareIndependentSearch({
        resolvedTools,
        service: req.body?.searchService,
        query: prompt,
        signal: controller.signal,
        trace
      });
      const trustedSystemContext = boundedText([
        "你正在作为智能体执行任务。必要时使用允许的工具；最终回答必须包含目标拆解、执行结果、风险和下一步。",
        assistant.systemPrompt,
        ...(inlineAgent?.skillInstructions || []).map((instruction, index) => `Skill ${index + 1}:\n${instruction}`)
      ].join("\n\n"), 48000);
      const providerSystemContext = composeCloudKnowledgeSystemContext({
        trustedContext: trustedSystemContext,
        knowledge: cloudKnowledge,
        trailingContext: boundedText(searchContext, 24000)
      });
      trackModelInvocation(res, entry, sourceModule);
      const content = await requestChatCompletion({
        provider,
        model: entry.model,
        temperature: boundedNumber(req.body?.options?.temperature, 0.35, 0, 2),
        topP: optionalBoundedNumber(req.body?.options?.topP, 0, 1),
        maxTokens: optionalBoundedInteger(req.body?.options?.maxTokens, 1, 32768),
        messages: [
          {
            role: "system",
            content: providerSystemContext
          },
          { role: "user", content: prompt }
        ],
        signal: controller.signal,
        tools,
        hostedTools,
        toolContext
      });
      res.json(
        resultPayload("agents", "智能体结果", {
          text: content,
          raw: withCloudKnowledgeResultRaw({
            toolTrace: trace,
            tools: [...tools, ...hostedTools, ...searchTools].map((tool) => tool.name),
            agent: { id: assistant.id, name: assistant.name, source: inlineAgent ? "browser" : "server" },
            sourceModule
          }, cloudKnowledge)
        })
      );
    } catch (error) {
      if (req.upstreamTimedOut) throw httpError(504, "上游服务响应超时");
      if (error?.name === "AbortError" || controller.signal.aborted) throw httpError(499, "请求已取消");
      throw httpError(502, publicProviderError(error, connection, req.body?.searchService));
    }
  })
);

app.post(
  "/api/audio/transcribe",
  asyncRoute(async (req, res) => {
    assertModuleAllowed("audio");
    const { connection, entry, provider } = resolveRuntimeProvider(req.body || {}, "stt");
    const audio = audioFromDataUrl(req.body?.dataUrl, req.body?.fileName, req.body?.mimeType);
    const controller = createRequestAbortController(req, res);
    try {
      const adapter = createProviderAdapter(provider);
      if (typeof adapter.transcribeAudio !== "function") {
        throw new Error("当前供应商未提供语音识别接口");
      }
      trackModelInvocation(res, entry, "audio-transcription");
      const json = await adapter.transcribeAudio({
        model: entry.model,
        ...audio,
        endpointPath: req.body?.endpointPath,
        signal: controller.signal
      });
      res.json({
        text: json.text || json.transcript || json.output_text || "",
        raw: json
      });
    } catch (error) {
      if (req.upstreamTimedOut) throw httpError(504, "上游服务响应超时");
      if (error?.name === "AbortError" || controller.signal.aborted) throw httpError(499, "请求已取消");
      throw httpError(502, publicProviderError(error, connection));
    }
  })
);

app.post(
  "/api/retrieval/embed",
  asyncRoute(async (req, res) => {
    const input = req.body?.input;
    const values = Array.isArray(input) ? input.map((item) => String(item || "")) : [String(input || "")];
    const nonEmptyValues = values.map((item) => item.trim()).filter(Boolean);
    if (!nonEmptyValues.length) throw httpError(400, "Embedding input is required");
    if (nonEmptyValues.join("\n").length > 30000) {
      throw httpError(400, "Embedding input is too large");
    }

    const { connection, entry, provider } = resolveRuntimeProvider(req.body || {}, "embedding");
    const controller = createRequestAbortController(req, res);

    try {
      trackModelInvocation(res, entry, "embedding");
      const result = await createProviderAdapter(provider).embedText({
        model: entry.model,
        input: Array.isArray(input) ? nonEmptyValues : nonEmptyValues[0],
        signal: controller.signal
      });
      res.json({
        modelId: entry.id,
        vendor: entry.vendor,
        model: entry.model,
        dimensions: result.embeddings?.[0]?.length || 0,
        embeddings: result.embeddings || [],
        usage: result.usage
      });
    } catch (error) {
      if (req.upstreamTimedOut) throw httpError(504, "上游服务响应超时");
      if (error?.name === "AbortError" || controller.signal.aborted) {
        throw httpError(499, "Request was cancelled");
      }
      throw httpError(502, publicProviderError(error, connection));
    }
  })
);

app.post(
  "/api/media/video/status",
  asyncRoute(async (req, res) => {
    const { connection, entry, provider } = resolveRuntimeProvider(req.body || {}, "video");
    const endpointPath = req.body?.endpointPath || entry.mediaConfig?.statusPath || "/video/generations/status";
    const providerJobId = String(req.body?.providerJobId || "").trim();
    if (!providerJobId) throw httpError(400, "缺少视频任务 ID");

    const controller = createRequestAbortController(req, res);

    try {
      const adapter = createProviderAdapter(provider);
      if (typeof adapter.getVideoStatus !== "function") {
        throw new Error("当前供应商未提供视频状态查询接口");
      }
      trackModelInvocation(res, entry, "video-status");
      const json = await adapter.getVideoStatus({
        model: entry.model,
        endpointPath,
        providerJobId,
        signal: controller.signal
      });
      const status = mediaStatusFromJson(json, entry);
      res.json(
        resultPayload("video", "视频任务状态", {
          status,
          assets: mediaAssetsFromJson(json, "video", entry),
          text:
            status === "submitted"
              ? "视频仍在生成中，请稍后刷新状态。"
              : status === "failed"
                ? json.error || json.message || "视频任务失败。"
                : json.text || json.message || "视频任务已更新。",
          raw: json
        })
      );
    } catch (error) {
      if (req.upstreamTimedOut) throw httpError(504, "上游服务响应超时");
      if (error?.name === "AbortError" || controller.signal.aborted) {
        throw httpError(499, "请求已取消");
      }
      if (Number.isInteger(error?.status)) throw error;
      throw httpError(502, publicProviderError(error, connection));
    }
  })
);

app.post(
  "/api/generate/:module",
  asyncRoute(async (req, res) => {
    const module = String(req.params.module || "");
    const allowedModules = new Set(["image", "audio", "video", "agents", "knowledge", "ppt", "mindmap", "translate"]);
    if (!allowedModules.has(module)) throw httpError(404, "功能不存在");
    assertModuleAllowed(module);

    const prompt = String(req.body?.prompt || "").trim();
    if (!prompt) throw httpError(400, "请输入请求内容");

    const capability =
      module === "image" ? "image" : module === "audio" ? "tts" : module === "video" ? "video" : "chat";
    const { connection, entry, provider } = resolveRuntimeProvider(req.body || {}, capability);
    const model = entry.model;
    const options = req.body?.options || {};
    if (module === "image") assertModelInputCharacters(entry, [prompt], "Image prompt");
    const imageTimeoutMs = optionalBoundedInteger(process.env.IMAGE_UPSTREAM_TIMEOUT_MS, 30_000, 900_000)
      || DEFAULT_IMAGE_TIMEOUT_MS;
    const controller = createRequestAbortController(
      req,
      res,
      module === "image" ? imageTimeoutMs : undefined
    );

    try {
      if (module === "image") {
        trackModelInvocation(res, entry, "image");
        const mode = options.mode === "edit" ? "edit" : "generate";
        if (mode === "edit" && !entry.capabilities.includes("imageEdit")) {
          throw httpError(400, "所选模型未启用图片编辑能力");
        }
        const maxReferenceImages = entry.vendor === "botcf" ? 4 : entry.vendor === "openai" ? 16 : 1;
        const requestedInputImages = Array.isArray(options.inputImages)
          ? options.inputImages
          : options.inputImage
            ? [options.inputImage]
            : [];
        const inputImages = mode === "edit"
          ? imageInputsFrom(requestedInputImages, "参考图", maxReferenceImages)
          : [];
        const inputImage = inputImages[0];
        const referenceImageUrls = mode === "edit" && entry.vendor === "botcf"
          ? await referenceImageUrlsFrom(options.referenceImageUrls, 4)
          : [];
        if (mode === "edit" && entry.vendor !== "botcf" && Array.isArray(options.referenceImageUrls) && options.referenceImageUrls.length) {
          throw httpError(400, "当前模型不支持参考图链接，请上传本地图片");
        }
        if (inputImages.length && referenceImageUrls.length) {
          throw httpError(400, "请使用上传参考图或 HTTPS 参考图链接中的一种方式");
        }
        const maskImage = mode === "edit" && options.maskImage
          ? imageInputFrom(options.maskImage, "蒙版", 4)
          : undefined;
        const totalUploadBytes = inputImages.reduce((sum, item) => sum + Number(item.size || 0), 0)
          + Number(maskImage?.size || 0);
        if (totalUploadBytes > MAX_IMAGE_EDIT_UPLOAD_BYTES) {
          throw httpError(413, "Image edit uploads exceed the total request limit");
        }
        if (entry.vendor === "openai" && maskImage && maskImage.mimeType !== "image/png") {
          throw httpError(400, "OpenAI 图片编辑蒙版必须为 PNG");
        }
        if (entry.vendor === "openai" && maskImage) {
          if (inputImage?.mimeType !== "image/png") {
            throw httpError(400, "使用蒙版时，OpenAI 原图与蒙版必须同为 PNG");
          }
          const inputMetadata = pngImageMetadata(inputImage.dataUrl);
          const maskMetadata = pngImageMetadata(maskImage.dataUrl);
          if (!inputMetadata || !maskMetadata) throw httpError(400, "原图或蒙版不是有效的 PNG 文件");
          if (inputMetadata.width !== maskMetadata.width || inputMetadata.height !== maskMetadata.height) {
            throw httpError(400, "OpenAI 蒙版尺寸必须与原图一致");
          }
          if (!maskMetadata.hasAlpha) throw httpError(400, "OpenAI 蒙版必须包含透明通道");
        }
        const maxImageCount = entry.vendor === "gemini" ? 4 : 10;
        const requestedCount = Number.isFinite(Number(options.count))
          ? Math.max(1, Math.min(maxImageCount, Math.trunc(Number(options.count))))
          : 1;
        const aspectRatio = ["1:1", "3:2", "2:3", "16:9", "9:16"].includes(options.aspectRatio)
          ? options.aspectRatio
          : undefined;
        const imageSize = ["512px", "1K", "2K", "4K"].includes(options.imageSize)
          ? options.imageSize
          : undefined;
        const outputFormat = ["png", "jpeg", "webp"].includes(options.outputFormat)
          ? options.outputFormat
          : undefined;
        const outputCompression = Number.isFinite(Number(options.outputCompression))
          ? Math.max(0, Math.min(100, Math.trunc(Number(options.outputCompression))))
          : undefined;
        const timingKey = normalizeImageTimingKey({
          modelId: entry.id,
          mode,
          resolution: imageSize,
          aspectRatio,
          count: requestedCount
        });
        const imageGenerationStartedAt = Date.now();
        const fallbackMimeType = outputFormat === "jpeg"
          ? "image/jpeg"
          : outputFormat === "webp"
            ? "image/webp"
            : "image/png";
        const imageAdapter = createProviderAdapter(provider);
        const requestImageBatch = (batchCount) => imageAdapter.generateImage({
          model,
          prompt,
          mode,
          inputImage,
          inputImages,
          referenceImageUrls,
          maskImage,
          size: options.size || "1024x1024",
          aspectRatio,
          imageSize,
          count: batchCount,
          quality: options.quality,
          outputFormat,
          outputCompression,
          background: options.background,
          signal: controller.signal
        });
        const providerResponses = [await requestImageBatch(requestedCount)];
        const assets = extractAssets(providerResponses[0], "image", fallbackMimeType).slice(0, requestedCount);
        if (!assets.length) throw httpError(502, "Image provider returned no usable image assets");
        while (assets.length < requestedCount && providerResponses.length < requestedCount) {
          const supplementalResponse = await requestImageBatch(1);
          providerResponses.push(supplementalResponse);
          const missingCount = requestedCount - assets.length;
          const supplementalAssets = extractAssets(supplementalResponse, "image", fallbackMimeType)
            .slice(0, missingCount);
          if (!supplementalAssets.length) break;
          assets.push(...supplementalAssets);
        }
        if (assets.length < requestedCount) {
          throw httpError(502, `Image provider returned only ${assets.length} of ${requestedCount} requested images`);
        }
        const json = providerResponses[0];
        const revisedPrompts = providerResponses.flatMap((response) => (
          Array.isArray(response?.data)
            ? response.data.map((item) => item?.revised_prompt).filter(Boolean)
            : []
        ));
        imageGenerationTimingStore.record({
          ...timingKey,
          status: "completed",
          durationMs: Date.now() - imageGenerationStartedAt,
          createdAt: now()
        });
        const timingEstimate = imageGenerationTimingStore.estimate(timingKey);
        return res.json(
          resultPayload("image", "画图结果", {
            assets,
            text: json.text || json.revised_prompt || revisedPrompts.join("\n"),
            timingEstimate,
            raw: {
              provider: entry.vendor,
              model,
              mode,
              requestedCount,
              assetCount: assets.length,
              providerRequestCount: providerResponses.length
            }
          })
        );
      }

      if (module === "audio") {
        trackModelInvocation(res, entry, "audio");
        const jsonOrAsset = await createProviderAdapter(provider).synthesizeSpeech({
          model,
          input: prompt,
          voice: options.voice || "alloy",
          format: "mp3",
          signal: controller.signal
        });
        const assets = jsonOrAsset.dataUrl
          ? [{ type: "audio", url: jsonOrAsset.dataUrl, label: "语音合成" }]
          : extractAssets(jsonOrAsset, "audio");
        return res.json(
          resultPayload("audio", "音频结果", {
            assets,
            text: jsonOrAsset.text || "",
            raw: jsonOrAsset.dataUrl ? undefined : jsonOrAsset
          })
        );
      }

      if (module === "video") {
        trackModelInvocation(res, entry, "video");
        const videoPrompt = [
          prompt,
          options.duration ? `时长：${compact(options.duration, 80)}` : "",
          options.cameraMotion ? `镜头运动：${compact(options.cameraMotion, 120)}` : "",
          options.stylePreset ? `风格：${compact(options.stylePreset, 120)}` : ""
        ]
          .filter(Boolean)
          .join("\n");
        const json = await createProviderAdapter(provider).generateVideo({
          model,
          prompt: videoPrompt,
          size: options.size || "1280x720",
          endpointPath: options.endpointPath || entry.mediaConfig?.generatePath || "/video/generations",
          signal: controller.signal
        });
        const status = mediaStatusFromJson(json, entry);
        return res.json(
          resultPayload("video", "视频任务", {
            status,
            assets: mediaAssetsFromJson(json, "video", entry),
            text:
              status === "submitted"
                ? "任务已提交，请在供应商控制台或返回内容中查看进度。"
                : status === "failed"
                  ? json.error || json.message || "视频任务失败。"
                  : json.text || json.message || "",
            raw: json
          })
        );
      }

      if (module === "ppt") {
        trackModelInvocation(res, entry, module);
        const messages = pptGenerationMessages(prompt, options.ppt);
        const content = await requestChatCompletion({
          provider,
          model,
          temperature: Number.isFinite(Number(options.temperature))
            ? Number(options.temperature)
            : 0.4,
          topP: Number.isFinite(Number(options.topP)) ? Number(options.topP) : undefined,
          maxTokens: Number.isFinite(Number(options.maxTokens))
            ? Math.max(1, Math.trunc(Number(options.maxTokens)))
            : undefined,
          messages,
          signal: controller.signal
        });
        const fallbackTitle = prompt.split(/\r?\n/u)[0].trim() || "AI 演示文稿";
        const deck = parsePptDeckModelOutput(content, options.ppt, fallbackTitle);
        return res.json(
          resultPayload("ppt", "PPT 演示文稿", {
            text: deck ? pptDeckToMarkdown(deck) : content,
            deck: deck || undefined,
            raw: { format: deck ? "ppt-deck-v1" : "markdown-fallback" }
          })
        );
      }

      if (module === "mindmap") {
        trackModelInvocation(res, entry, module);
        assertModelInputCharacters(entry, [prompt], "Mind map source");
        const mindmapOptions = normalizeMindmapGenerationOptions(options.mindmap);
        const currentDocument = options.mindmap?.currentDocument
          ? normalizeMindmapDocument(options.mindmap.currentDocument, {
              maxDepth: 5,
              preserveIds: true
            }, prompt.split(/\r?\n/u)[0])
          : null;
        if (mindmapOptions.operation !== "generate" && !currentDocument) {
          throw httpError(400, "请先生成思维导图后再执行 AI 操作");
        }
        if (
          mindmapOptions.operation === "expand"
          && !findMindmapNode(currentDocument?.root, mindmapOptions.targetNodeId)
        ) {
          throw httpError(400, "请选择需要扩展的有效节点");
        }
        const messages = mindmapGenerationMessages(prompt, {
          ...(options.mindmap || {}),
          currentDocument
        });
        const content = await requestChatCompletion({
          provider,
          model,
          temperature: Number.isFinite(Number(options.temperature))
            ? Number(options.temperature)
            : 0.4,
          topP: Number.isFinite(Number(options.topP)) ? Number(options.topP) : undefined,
          maxTokens: Number.isFinite(Number(options.maxTokens))
            ? Math.max(1, Math.trunc(Number(options.maxTokens)))
            : undefined,
          messages,
          signal: controller.signal
        });
        const fallbackTitle = prompt.split(/\r?\n/u)[0].trim().slice(0, 120) || "思维导图";
        let mindmap;
        if (mindmapOptions.operation === "expand") {
          const targetNode = findMindmapNode(currentDocument.root, mindmapOptions.targetNodeId);
          const expansion = parseMindmapExpansionOutput(content, mindmapOptions, targetNode?.label || fallbackTitle);
          if (!expansion) throw httpError(502, "模型未返回可用的扩展节点");
          mindmap = mergeMindmapExpansion(
            currentDocument,
            mindmapOptions.targetNodeId,
            expansion,
            mindmapOptions
          );
        } else {
          mindmap = parseMindmapModelOutput(content, mindmapOptions, fallbackTitle);
        }
        if (!mindmap) throw httpError(502, "模型未返回可用的思维导图结构");
        return res.json(
          resultPayload("mindmap", "思维导图", {
            text: mindmapDocumentToMarkdown(mindmap),
            mindmap,
            raw: {
              format: "mindmap-document-v1",
              operation: mindmapOptions.operation,
              presetId: mindmapOptions.presetId
            }
          })
        );
      }

      if (module === "translate") {
        trackModelInvocation(res, entry, module);
        const content = await requestChatCompletion({
          provider,
          model,
          temperature: Number.isFinite(Number(options.temperature))
            ? Number(options.temperature)
            : 0.4,
          topP: Number.isFinite(Number(options.topP)) ? Number(options.topP) : undefined,
          maxTokens: Number.isFinite(Number(options.maxTokens))
            ? Math.max(1, Math.trunc(Number(options.maxTokens)))
            : undefined,
          messages: [
            {
              role: "system",
              content: [
                "你是专业翻译助手。",
                "识别原文语言，并翻译为用户指定的目标语言；未指定目标语言时，默认翻译为简体中文。",
                "保留原文格式、专有名词、数字和代码，只输出译文，不添加解释。"
              ].join("\n")
            },
            { role: "user", content: prompt }
          ],
          signal: controller.signal
        });
        return res.json(resultPayload("translate", "翻译结果", { text: content }));
      }

      if (module === "agents") {
        trackModelInvocation(res, entry, "agents");
        const assistant = getAssistant(req.body?.assistantId);
        const tools = entry.capabilities.includes("toolCalling") ? availableTools({}, db.toolSettings) : [];
        const trace = [];
        const content = await requestChatCompletion({
          provider,
          model,
          temperature: Number.isFinite(Number(options.temperature))
            ? Number(options.temperature)
            : 0.4,
          topP: Number.isFinite(Number(options.topP)) ? Number(options.topP) : undefined,
          maxTokens: Number.isFinite(Number(options.maxTokens))
            ? Math.max(1, Math.trunc(Number(options.maxTokens)))
            : undefined,
          messages: [
            {
              role: "system",
              content: `${assistant.systemPrompt}\n你正在作为智能体执行任务。请先拆解目标，再给出可执行步骤、需要的输入、风险和最终结果。`
            },
            { role: "user", content: prompt }
          ],
          signal: controller.signal,
          tools,
          toolContext: { trace }
        });
        return res.json(resultPayload("agents", "智能体结果", { text: content, raw: { toolTrace: trace } }));
      }

      const context = compact(req.body?.context || "", 12000);
      const contextChunks = requestKnowledgeChunks(req.body?.contextChunks);
      if (!context && !contextChunks.length) throw httpError(400, "请先提供知识库资料");
      trackModelInvocation(res, entry, "knowledge");
      const embeddingRuntime = resolveEmbeddingRuntime(req.body || {}, connection, entry.vendor);
      const retrieval = await retrieveContext({
        query: prompt,
        context,
        chunks: contextChunks,
        topK: Number.isFinite(Number(options.topK)) ? Number(options.topK) : 5,
        embed: embeddingRuntime
          ? (input) =>
              createProviderAdapter(embeddingRuntime.provider).embedText({
                model: embeddingRuntime.entry.model,
                input,
                signal: controller.signal
              })
          : undefined
      });
      const retrievedContext = formatRetrievedContext(retrieval.chunks);
      const content = await requestChatCompletion({
        provider,
        model,
        temperature: Number.isFinite(Number(options.temperature))
          ? Number(options.temperature)
          : 0.2,
        topP: Number.isFinite(Number(options.topP)) ? Number(options.topP) : undefined,
        maxTokens: Number.isFinite(Number(options.maxTokens))
          ? Math.max(1, Math.trunc(Number(options.maxTokens)))
          : undefined,
        messages: [
          {
            role: "system",
            content:
              "你是知识库问答助手。只能基于用户提供的资料回答；资料不足时直接说明缺口，并给出需要补充的内容。"
          },
          {
            role: "user",
            content: `Retrieved context:\n${retrievedContext || context}\n\nQuestion:\n${prompt}`
          }
        ],
        signal: controller.signal
      });
      return res.json(
        resultPayload("knowledge", "知识库回答", {
          text: content,
          raw: {
            retrieval: {
              mode: retrieval.mode,
              chunks: publicRetrievedChunks(retrieval.chunks),
              embeddingModel: embeddingRuntime
                ? {
                    id: embeddingRuntime.entry.id,
                    vendor: embeddingRuntime.entry.vendor,
                    model: embeddingRuntime.entry.model
                  }
                : null
            }
          }
        })
      );
    } catch (error) {
      if (req.upstreamTimedOut) throw httpError(504, "上游服务响应超时");
      if (error?.name === "AbortError" || controller.signal.aborted) {
        throw httpError(499, "请求已取消");
      }
      if (Number.isInteger(error?.status)) throw error;
      throw httpError(502, publicProviderError(error, connection));
    }
  })
);

app.use("/api", (req, res) => {
  res.status(404).json({ error: "API route not found" });
});

if (isProduction) {
  const distDir = path.join(rootDir, "dist");
  app.use(express.static(distDir, { index: false }));
  app.use((req, res, next) => {
    if (req.method !== "GET") return next();
    res.sendFile(path.join(distDir, "index.html"));
  });
} else {
  const vite = await import("vite").then(({ createServer }) =>
    createServer({
      root: rootDir,
      server: {
        middlewareMode: true,
        ws: {
          server: httpServer
        },
        watch: {
          ignored: [
            "**/.git/**",
            "**/.omx/**",
            "**/data/**",
            "**/dist/**",
            "**/node_modules/**",
            "**/plans/**",
            "**/reports/**"
          ]
        }
      },
      appType: "custom"
    })
  );
  app.use(vite.middlewares);
  app.use(
    asyncRoute(async (req, res) => {
      const template = fs.readFileSync(path.join(rootDir, "index.html"), "utf8");
      const html = await vite.transformIndexHtml(req.originalUrl, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(html);
    })
  );
}

app.use((error, req, res, next) => {
  if (
    /^\/api\/kb(?:\/|$)/.test(req.originalUrl || "") ||
    (error instanceof KnowledgeError && isCloudKnowledgePublicRequest(req))
  ) {
    req.knowledgeRuntime = knowledgeRuntime;
    return knowledgeErrorMiddleware(error, req, res, next);
  }
  return next(error);
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = error.status || 500;
  if (status >= 500) console.error(error);
  res.status(status).json({ error: error.message || "服务器错误" });
});

httpServer.listen(port, "0.0.0.0", () => {
  const mode = isProduction ? "production" : "development";
  console.log(`xi-ai-web listening on http://localhost:${port} (${mode})`);
  if (!adminCredentialStore.configured) {
    console.log("ADMIN_PASSWORD is not set; admin APIs are locked.");
  }
});

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`xi-ai-web stopping (${signal})`);
  const forceExit = setTimeout(() => process.exit(1), 10_000);
  forceExit.unref();
  httpServer.close(async () => {
    await Promise.all([
      knowledgeRuntime.close().catch((error) => console.error(error)),
      progressSyncService?.close().catch((error) => console.error(error))
    ]);
    clearTimeout(forceExit);
    process.exit(0);
  });
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
