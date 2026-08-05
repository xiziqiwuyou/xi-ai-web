import { expect, test as base, type Page } from "@playwright/test";
import type {
  AdminBootstrapPayload,
  AdminOpsPayload,
  AdminStatus,
  AgentRunPayload,
  ChatStreamPayload,
  ChatTitlePayload,
  Conversation,
  GenerationPayload,
  GenerationResult,
  KnowledgeAuthResponse,
  KnowledgeBase,
  KnowledgeAdminAccount,
  KnowledgeAdminAccountDeletionResult,
  KnowledgeAdminAuditEntry,
  KnowledgeAdminInvite,
  KnowledgeAdminJob,
  KnowledgeAdminMaintenanceResult,
  KnowledgeAdminOverview,
  KnowledgeAdminReadiness,
  KnowledgeAdminReconcileResult,
  KnowledgeAdminSettings,
  KnowledgeRetrievalRequest,
  AdminLangflowWorkflow,
  LangflowWorkflow,
  MindmapDocument,
  ModelCatalogEntry,
  ModelVendorEntry,
  ProviderKind,
  PublicBootstrapPayload,
  SearchServiceConfig,
  UserProviderConfig
} from "../../../src/types";

type ModelCatalogMutation = {
  method: "POST" | "PATCH" | "REORDER";
  id?: string;
  payload?: Partial<ModelCatalogEntry>;
  modelIds?: string[];
};

type ModelVendorMutation = {
  method: "POST" | "DELETE" | "REORDER";
  id?: string;
  payload?: Partial<Pick<ModelVendorEntry, "label" | "adapter">>;
  result?: ModelVendorEntry;
  vendorIds?: string[];
};

const modelVendorLabels: Record<ProviderKind, string> = {
  openai: "OpenAI",
  anthropic: "Claude",
  gemini: "Gemini",
  kimi: "Kimi",
  deepseek: "DeepSeek",
  qwen: "通义千问",
  botcf: "BotCF",
  "openai-compatible": "OpenAI Compatible"
};

function modelFixtures(
  entries: Array<Omit<ModelCatalogEntry, "vendorId" | "vendorLabel" | "order"> & { order?: number }>
): ModelCatalogEntry[] {
  return entries.map((entry, order) => ({
    ...entry,
    order: entry.order ?? order,
    vendorId: entry.vendor,
    vendorLabel: modelVendorLabels[entry.vendor]
  }));
}

export const providerStorageKey = "cherry-web-user-provider";
export const searchServiceStorageKey = "xi-ai-web-search-service";
export const knowledgeEmbeddingStorageKey = "xi-ai-web-knowledge-embedding-connections";
export const chatKnowledgeSelectionStorageKey = "xi-ai-web-chat-knowledge-selections";
export const knowledgeCsrfToken = "e2e-knowledge-csrf-token";
export const mappedRequestModel = "gpt-5.6-provider-production-chat-long-context-2026-07-21";

export const readyProvider: UserProviderConfig = {
  baseUrl: "https://api.example.test/v1",
  apiKey: "e2e-session-key",
  lastModelId: "test-chat"
};

export const readySearchService: SearchServiceConfig = {
  provider: "glm",
  baseUrl: "https://open.bigmodel.cn/api",
  apiKey: "e2e-search-session-key",
  model: "",
  searchEngine: "search_std",
  count: 8,
  contentSize: "medium"
};

function knowledgeBaseFixture(
  id: string,
  name: string,
  vendor: "openai" | "qwen",
  index: number
): KnowledgeBase {
  return {
    id,
    name,
    description: `${name} E2E fixture`,
    status: "active",
    embeddingProfile: {
      id: vendor === "openai" ? "openai-text-embedding-3-small" : "qwen-text-embedding-v4",
      vendor,
      actualModel: vendor === "openai" ? "text-embedding-3-small" : "text-embedding-v4",
      dimensions: vendor === "openai" ? 1536 : 1024,
      fingerprint: `e2e-${vendor}-fingerprint`
    },
    chunkVersion: 1,
    activeIndexVersion: index,
    pendingIndexVersion: null,
    version: 1,
    documentCount: 1,
    readyDocumentCount: 1,
    logicalBytes: "2048",
    embeddingProgress: {
      totalChunks: 2,
      readyChunks: 2,
      pendingChunks: 0,
      leasedChunks: 0,
      failedChunks: 0,
      lastErrorCode: null
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    archivedAt: null
  };
}

export const readyKnowledgeBases: KnowledgeBase[] = [
  knowledgeBaseFixture("11111111-1111-4111-8111-111111111111", "产品手册", "openai", 1),
  knowledgeBaseFixture("22222222-2222-4222-8222-222222222222", "运营规范", "qwen", 1),
  knowledgeBaseFixture("33333333-3333-4333-8333-333333333333", "项目档案", "openai", 1),
  knowledgeBaseFixture("44444444-4444-4444-8444-444444444444", "研究资料", "qwen", 1)
];

export const publicDestinations = [
  { id: "chat", path: "/chat", label: "AI \u5bf9\u8bdd", heading: "AI \u5bf9\u8bdd\u5de5\u4f5c\u53f0" },
  { id: "image", path: "/image", label: "\u56fe\u50cf\u751f\u6210", heading: "\u56fe\u50cf\u751f\u6210" },
  { id: "agents", path: "/agents", label: "\u667a\u80fd\u4f53", heading: "\u8ba9\u667a\u80fd\u4f53\uff0c\u771f\u6b63\u5f00\u59cb\u5de5\u4f5c\u3002" },
  { id: "workflows", path: "/workflows", label: "\u5de5\u4f5c\u6d41", heading: "\u5de5\u4f5c\u6d41" },
  { id: "ppt", path: "/ppt", label: "AI \u4e00\u952e PPT", heading: "AI \u4e00\u952e PPT" },
  { id: "mindmap", path: "/mindmap", label: "\u601d\u7ef4\u5bfc\u56fe", heading: "\u628a\u6a21\u7cca\u60f3\u6cd5\uff0c\u53d8\u6210\u6e05\u6670\u8def\u5f84\u3002" },
  { id: "assistants", path: "/assistants", label: "\u52a9\u624b\u5e93", heading: "\u7ed9\u4efb\u52a1\u627e\u4e00\u4f4d \u771f\u6b63\u61c2\u884c\u7684\u4f19\u4f34\u3002" },
  { id: "translate", path: "/translate", label: "\u7ffb\u8bd1", heading: "\u4e0d\u53ea\u662f\u7ffb\u8bd1\uff0c\u66f4\u50cf\u6bcd\u8bed\u8868\u8fbe\u3002" }
] as const;

export const publicBootstrapFixture: PublicBootstrapPayload = {
  settings: {
    siteName: "xi-ai-web",
    theme: "rednote",
    allowGuestChat: true,
    defaultModule: "chat",
    upstreamBaseUrl: "https://api.xi-ai.cn",
    progressSync: {
      enabled: true,
      ttlSeconds: 600,
      maxPayloadMb: 32,
      maxIpJoinAttempts: 5,
      maxSessionJoinAttempts: 5
    }
  },
  menuItems: publicDestinations.map((destination, index) => ({
    id: destination.id,
    label: destination.label,
    enabled: true,
    visible: true,
    order: (index + 1) * 10
  })),
  modelCatalog: modelFixtures([
    {
      id: "test-chat",
      vendor: "openai",
      endpointProtocol: "openai-responses",
      model: mappedRequestModel,
      label: "Test Chat",
      capabilities: ["chat", "vision", "toolCalling", "webSearch", "codeExecution"],
      defaultFor: ["chat"],
      contextWindowTokens: 32768,
      maxInputCharacters: 24000,
      enabled: true
    },
    {
      id: "openai-fast",
      vendor: "openai",
      endpointProtocol: "openai-responses",
      model: "openai-fast",
      label: "OpenAI Fast",
      capabilities: ["chat"],
      defaultFor: [],
      enabled: true
    },
    {
      id: "openai-code",
      vendor: "openai",
      endpointProtocol: "openai-responses",
      model: "openai-code",
      label: "OpenAI Code",
      capabilities: ["chat", "toolCalling"],
      defaultFor: [],
      enabled: true
    },
    {
      id: "openai-long",
      vendor: "openai",
      endpointProtocol: "openai-responses",
      model: "openai-long",
      label: "OpenAI Long",
      capabilities: ["chat"],
      defaultFor: [],
      enabled: true
    },
    {
      id: "anthropic-sonnet",
      vendor: "anthropic",
      endpointProtocol: "anthropic-messages",
      model: "anthropic-sonnet",
      label: "Claude Sonnet",
      capabilities: ["chat", "vision"],
      defaultFor: [],
      enabled: true
    },
    {
      id: "anthropic-haiku",
      vendor: "anthropic",
      endpointProtocol: "anthropic-messages",
      model: "anthropic-haiku",
      label: "Claude Haiku",
      capabilities: ["chat"],
      defaultFor: [],
      enabled: true
    },
    {
      id: "anthropic-reason",
      vendor: "anthropic",
      endpointProtocol: "anthropic-messages",
      model: "anthropic-reason",
      label: "Claude Reason",
      capabilities: ["chat", "toolCalling"],
      defaultFor: [],
      enabled: true
    },
    {
      id: "anthropic-long",
      vendor: "anthropic",
      endpointProtocol: "anthropic-messages",
      model: "anthropic-long",
      label: "Claude Long",
      capabilities: ["chat"],
      defaultFor: [],
      enabled: true
    },
    {
      id: "gemini-vision",
      vendor: "gemini",
      endpointProtocol: "gemini-generate-content",
      model: "gemini-vision",
      label: "Gemini Vision",
      capabilities: ["chat", "vision"],
      defaultFor: [],
      enabled: true
    },
    {
      id: "gemini-flash",
      vendor: "gemini",
      endpointProtocol: "gemini-generate-content",
      model: "gemini-flash",
      label: "Gemini Flash",
      capabilities: ["chat", "vision"],
      defaultFor: [],
      contextWindowTokens: 1048576,
      maxInputCharacters: 600000,
      enabled: true
    },
    {
      id: "gemini-pro-vision",
      vendor: "gemini",
      endpointProtocol: "gemini-generate-content",
      model: "gemini-pro-vision",
      label: "Gemini Pro Vision",
      capabilities: ["chat", "vision", "toolCalling"],
      defaultFor: [],
      enabled: true
    },
    {
      id: "compatible-vision",
      vendor: "openai-compatible",
      endpointProtocol: "openai-chat",
      model: "compatible-vision",
      label: "Compatible Vision",
      capabilities: ["chat", "vision"],
      defaultFor: [],
      enabled: true
    },
    {
      id: "kimi-chat",
      vendor: "kimi",
      endpointProtocol: "openai-chat",
      model: "kimi-k3",
      label: "Kimi K3",
      capabilities: ["chat", "vision", "toolCalling"],
      defaultFor: [],
      enabled: true
    },
    {
      id: "deepseek-chat",
      vendor: "deepseek",
      endpointProtocol: "openai-chat",
      model: "deepseek-v4-flash",
      label: "DeepSeek V4 Flash",
      capabilities: ["chat", "toolCalling"],
      defaultFor: [],
      enabled: true
    },
    {
      id: "qwen-chat",
      vendor: "qwen",
      endpointProtocol: "openai-chat",
      model: "qwen3.7-plus",
      label: "Qwen 3.7 Plus",
      capabilities: ["chat", "vision", "toolCalling"],
      defaultFor: [],
      enabled: true
    },
    {
      id: "test-image",
      vendor: "openai",
      endpointProtocol: "openai-responses",
      model: "gpt-image-2",
      label: "OpenAI Image",
      capabilities: ["image", "imageEdit"],
      defaultFor: ["image"],
      enabled: true
    },
    {
      id: "gemini-image",
      vendor: "gemini",
      endpointProtocol: "gemini-generate-content",
      model: "gemini-3.1-flash-image",
      label: "Gemini Image",
      capabilities: ["image", "imageEdit", "vision"],
      defaultFor: [],
      enabled: true
    }
  ]),
  assistants: [
    {
      id: "test-assistant",
      name: "Strategy Partner",
      description: "Turns ambiguous goals into a focused strategy.",
      category: "通用效率",
      tags: ["战略", "拆解"],
      starterPrompts: ["帮我把一个模糊目标拆成行动计划", "评估这个方案的关键风险"],
      avatar: "sparkles",
      color: "#ff2442",
      systemPrompt: "Answer briefly.",
      enabled: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    },
    {
      id: "writing-assistant",
      name: "Writing Partner",
      description: "Sharpens structure, tone, and final copy.",
      category: "内容创作",
      tags: ["写作", "润色"],
      starterPrompts: ["把这段草稿改成一篇清晰的文章"],
      avatar: "pen-line",
      color: "#2368e8",
      systemPrompt: "Improve the writing.",
      enabled: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    },
    {
      id: "product-assistant",
      name: "Product Partner",
      description: "Connects user needs to product decisions.",
      category: "商业办公",
      tags: ["产品", "需求"],
      starterPrompts: ["把这个想法整理成产品需求", "帮我设计一轮用户访谈"],
      avatar: "panels-top-left",
      color: "#168f5b",
      systemPrompt: "Think like a product lead.",
      enabled: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    },
    {
      id: "data-assistant",
      name: "Data Partner",
      description: "Explains metrics and identifies useful signals.",
      category: "学习研究",
      tags: ["数据", "洞察"],
      starterPrompts: ["解释这组指标背后的变化"],
      avatar: "chart-no-axes-combined",
      color: "#a96800",
      systemPrompt: "Analyze the supplied data.",
      enabled: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    },
    {
      id: "efficiency-assistant",
      name: "Efficiency Partner",
      description: "Breaks complex work into executable steps.",
      category: "通用效率",
      tags: ["效率", "执行"],
      starterPrompts: ["把今天的任务排出优先级"],
      avatar: "list-checks",
      color: "#7b61ff",
      systemPrompt: "Create an efficient action plan.",
      enabled: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    },
    {
      id: "code-assistant",
      name: "Code Partner",
      description: "Reviews code and proposes verifiable fixes.",
      category: "编程开发",
      tags: ["代码", "调试"],
      starterPrompts: ["审查这段代码并指出高风险问题"],
      avatar: "code-2",
      color: "#3f6ccf",
      systemPrompt: "Review code rigorously.",
      enabled: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    },
    {
      id: "creative-assistant",
      name: "Creative Partner",
      description: "Turns rough inspiration into distinct concepts.",
      category: "生活创意",
      tags: ["创意", "灵感"],
      starterPrompts: ["给这个主题设计三个不同创意方向"],
      avatar: "palette",
      color: "#c34f8c",
      systemPrompt: "Develop original, practical concepts.",
      enabled: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    }
  ],
  appPresets: [
    {
      id: "test-app",
      name: "Test App",
      description: "Deterministic browser fixture",
      category: "Test",
      prompt: "Return a deterministic result.",
      enabled: true
    }
  ],
  promptPresets: [],
  langflow: {
    enabled: false,
    available: false,
    state: "disabled",
    reasonCode: "LANGFLOW_DISABLED"
  },
  langflowWorkflows: [],
  conversations: [],
  toolSettings: [
    {
      name: "datetime_now",
      label: "当前时间",
      description: "Read the current server time",
      enabled: true,
      riskLevel: "low",
      execution: "local",
      requiredCapability: "toolCalling",
      supportedVendors: ["openai", "anthropic", "gemini", "kimi", "deepseek", "qwen", "openai-compatible"],
      requiresContext: false
    },
    {
      name: "calculator_eval",
      label: "Calculator",
      description: "Deterministic tool fixture",
      enabled: true,
      riskLevel: "low",
      execution: "local",
      requiredCapability: "toolCalling",
      supportedVendors: ["openai", "anthropic", "gemini", "kimi", "deepseek", "qwen", "openai-compatible"],
      requiresContext: false
    },
    {
      name: "knowledge_search",
      label: "Knowledge Search",
      description: "Search request-scoped local knowledge chunks",
      enabled: true,
      riskLevel: "medium",
      execution: "local",
      requiredCapability: "toolCalling",
      supportedVendors: ["openai", "anthropic", "gemini", "kimi", "deepseek", "qwen", "openai-compatible"],
      requiresContext: true
    },
    {
      name: "web_search",
      label: "联网搜索",
      description: "Independent web search fixture",
      enabled: true,
      riskLevel: "medium",
      execution: "search",
      supportedVendors: ["openai", "anthropic", "gemini", "kimi", "deepseek", "qwen", "openai-compatible"],
      requiresContext: false
    }
  ]
};

const modelVendorFixtures: ModelVendorEntry[] = [
  { id: "openai", label: "OpenAI", adapter: "openai", enabled: true, order: 10 },
  { id: "anthropic", label: "Claude", adapter: "anthropic", enabled: true, order: 20 },
  { id: "gemini", label: "Gemini", adapter: "gemini", enabled: true, order: 30 },
  { id: "kimi", label: "Kimi", adapter: "kimi", enabled: true, order: 40 },
  { id: "deepseek", label: "DeepSeek", adapter: "deepseek", enabled: true, order: 50 },
  { id: "qwen", label: "通义千问", adapter: "qwen", enabled: true, order: 60 },
  { id: "botcf", label: "BotCF", adapter: "botcf", enabled: true, order: 70 },
  { id: "openai-compatible", label: "OpenAI Compatible", adapter: "openai-compatible", enabled: true, order: 80 }
];

const adminBootstrapFixture: AdminBootstrapPayload = {
  adminUsername: "xizi2333",
  settings: publicBootstrapFixture.settings,
  menuItems: publicBootstrapFixture.menuItems,
  modelVendors: modelVendorFixtures,
  modelCatalog: publicBootstrapFixture.modelCatalog,
  assistants: publicBootstrapFixture.assistants,
  appPresets: publicBootstrapFixture.appPresets,
  promptPresets: publicBootstrapFixture.promptPresets,
  langflow: publicBootstrapFixture.langflow,
  langflowWorkflows: [],
  toolSettings: publicBootstrapFixture.toolSettings
};

const adminOpsFixture: AdminOpsPayload = {
  runtime: {
    version: "0.1.0",
    node: "test",
    mode: "development",
    uptimeSeconds: 3600,
    dataDir: "test-data",
    metadataFile: "test-data/app-data.json"
  },
  counts: {
    menus: 8,
    visibleMenus: 8,
    enabledModels: publicBootstrapFixture.modelCatalog.filter((model) => model.enabled).length,
    modelCatalog: publicBootstrapFixture.modelCatalog.length,
    assistants: 7,
    apps: 1,
    prompts: 0,
    workflows: 0,
    tools: 4,
    backups: 0,
    auditRecords: 0
  },
  checklist: [],
  modelCoverage: [],
  modelInvocations: [
    {
      modelId: "openai-test-chat",
      displayName: "Test Chat",
      requestModel: "gpt-test-chat",
      vendor: "OpenAI",
      calls: 18,
      successCalls: 17,
      errorCalls: 1,
      cancelledCalls: 0,
      averageDurationMs: 1840,
      totalDurationMs: 33120,
      lastCalledAt: "2026-07-29T10:05:00.000Z"
    },
    {
      modelId: "anthropic-claude-sonnet",
      displayName: "Claude Sonnet",
      requestModel: "claude-sonnet-test",
      vendor: "Claude",
      calls: 6,
      successCalls: 6,
      errorCalls: 0,
      cancelledCalls: 0,
      averageDurationMs: 2680,
      totalDurationMs: 16080,
      lastCalledAt: "2026-07-29T09:40:00.000Z"
    }
  ],
  backups: []
};

const knowledgeAdminSettingsFixture: KnowledgeAdminSettings = {
  version: 1,
  registrationMode: "invite_only",
  limits: {
    defaultQuotaBytes: 5 * 1024 ** 3,
    maxKnowledgeBasesPerAccount: 20,
    maxDocumentsPerAccount: 1000,
    maxDocumentsPerKnowledgeBase: 500,
    maxFileBytes: 100 * 1024 ** 2,
    maxChunksPerAccount: 100000,
    maxConcurrentUploadsPerAccount: 3,
    maxConcurrentIngestionsPerAccount: 2,
    maxConcurrentEmbeddingsPerAccount: 2,
    retrievalRequestsPerMinutePerAccount: 60,
    maxRetrievalTopK: 20
  },
  updatedBy: "admin",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

const knowledgeAdminAccountFixture: KnowledgeAdminAccount = {
  id: "11111111-1111-4111-8111-111111111111",
  username: "knowledge-owner",
  status: "active",
  version: 1,
  quotaBytes: String(5 * 1024 ** 3),
  usedBytes: String(768 * 1024 ** 2),
  reservedBytes: String(16 * 1024 ** 2),
  activeSessionCount: 2,
  knowledgeBaseCount: 3,
  documentCount: 18,
  chunkCount: 420,
  failedLoginCount: 0,
  lockedUntil: null,
  lastLoginAt: "2026-01-01T00:00:00.000Z",
  createdAt: "2025-12-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  limitOverrides: {},
  effectiveLimits: {
    quotaBytes: 5 * 1024 ** 3,
    maxKnowledgeBasesPerAccount: 20,
    maxDocumentsPerAccount: 1000,
    maxDocumentsPerKnowledgeBase: 500,
    maxFileBytes: 100 * 1024 ** 2,
    maxChunksPerAccount: 100000,
    maxConcurrentUploadsPerAccount: 3,
    maxConcurrentIngestionsPerAccount: 2,
    maxConcurrentEmbeddingsPerAccount: 2,
    retrievalRequestsPerMinutePerAccount: 60,
    maxRetrievalTopK: 20
  },
  overLimit: []
};

const knowledgeAdminOverviewFixture: KnowledgeAdminOverview = {
  accounts: { total: 12, active: 10, frozen: 2 },
  activeSessions: 16,
  knowledgeBases: 28,
  documents: 186,
  chunks: 9230,
  jobs: { queued: 3, running: 1, failed: 2 },
  storage: {
    quotaBytes: String(60 * 1024 ** 3),
    usedBytes: String(18 * 1024 ** 3),
    reservedBytes: String(512 * 1024 ** 2)
  },
  registrationMode: "invite_only",
  objectStore: { state: "configured" }
};

const knowledgeAdminReadinessFixture: KnowledgeAdminReadiness = {
  generatedAt: "2026-01-01T00:00:00.000Z",
  status: "maintenance_required",
  checks: {
    database: "ok",
    migrations: "ok",
    vectorExtension: "ok",
    objectStore: "configured"
  },
  runtime: {
    enabled: true,
    available: true,
    schemaVersion: 10,
    vectorVersion: "0.8.0",
    worker: {
      concurrency: 2,
      leaseSeconds: 60
    },
    objectStore: { state: "configured" }
  },
  metrics: {
    accounts: {
      total: 12,
      active: 10,
      frozen: 2,
      deleting: 1,
      locked: 0,
      overQuota: 1,
      failedLoginCount: 3
    },
    auth: {
      activeSessions: 16,
      expiredSessions: 2,
      activeInvites: 1,
      expiredInvites: 1,
      activeAdminResets: 0,
      expiredAdminResets: 1
    },
    storage: {
      quotaBytes: String(60 * 1024 ** 3),
      usedBytes: String(18 * 1024 ** 3),
      reservedBytes: String(512 * 1024 ** 2),
      staleReservationCount: 2,
      staleReservationBytes: String(8 * 1024 ** 2),
      expiredPendingUploads: 1
    },
    queue: {
      queued: 3,
      running: 1,
      retry: 1,
      failed: 2,
      cancelled: 0,
      oldestReadyAgeSeconds: 180
    },
    vectors: {
      incompleteChunks: 12,
      leasedChunks: 2,
      failedChunks: 1
    },
    cleanup: {
      deletingAccounts: 1,
      deletingKnowledgeBases: 2,
      deletingDocuments: 5
    }
  }
};

const knowledgeAdminInviteFixture: KnowledgeAdminInvite = {
  id: "33333333-3333-4333-8333-333333333333",
  status: "active",
  initialLimitOverrides: {},
  expiresAt: "2026-01-08T00:00:00.000Z",
  consumedByAccountId: null,
  consumedAt: null,
  revokedAt: null,
  createdBy: "admin",
  createdAt: "2026-01-01T00:00:00.000Z"
};

const knowledgeAdminJobFixture: KnowledgeAdminJob = {
  id: "44444444-4444-4444-8444-444444444444",
  accountId: knowledgeAdminAccountFixture.id,
  knowledgeBaseId: "55555555-5555-4555-8555-555555555555",
  documentId: "66666666-6666-4666-8666-666666666666",
  kind: "parse",
  status: "running",
  attempts: 1,
  maxAttempts: 5,
  progressCurrent: 4,
  progressTotal: 10,
  errorCode: null,
  leaseActive: true,
  runAfter: "2026-01-01T00:00:00.000Z",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:01:00.000Z"
};

const knowledgeAdminMaintenanceFixture: KnowledgeAdminMaintenanceResult = {
  expiredUploads: { inspected: 2, cleaned: 1, failed: 0 },
  expiredReservations: { inspected: 3, released: 2 },
  expiredSessions: 2,
  expiredAdminResets: 1,
  expiredInvites: 1,
  finalizedAccountIds: ["99999999-9999-4999-8999-999999999999"]
};

function knowledgeAdminReconcileFixture(accountId = knowledgeAdminAccountFixture.id): KnowledgeAdminReconcileResult {
  return {
    queuedJobs: 1,
    jobs: [{
      ...knowledgeAdminJobFixture,
      id: "88888888-8888-4888-8888-888888888888",
      accountId,
      knowledgeBaseId: null,
      documentId: null,
      kind: "reconcile",
      status: "queued",
      progressCurrent: 0,
      progressTotal: 0,
      leaseActive: false,
      errorCode: null
    }]
  };
}

const knowledgeAdminAuditFixture: KnowledgeAdminAuditEntry = {
  id: "1",
  requestId: "request-admin-knowledge-1",
  adminActor: "admin",
  operation: "account.update",
  targetType: "account",
  targetId: knowledgeAdminAccountFixture.id,
  reason: "E2E 运营调整",
  result: "succeeded",
  metadata: { status: "active" },
  createdAt: "2026-01-01T00:00:00.000Z"
};

const conversationStorageKey = "cherry-web-local-conversations";
const conversationFixture: Conversation[] = [
  {
    id: "chat-e2e-existing",
    title: "\u5df2\u6709\u5bf9\u8bdd",
    assistantId: "test-assistant",
    pinned: false,
    messageCount: 1,
    preview: "\u786e\u5b9a\u6027\u5386\u53f2\u6d88\u606f",
    messages: [
      {
        id: "chat-e2e-message",
        role: "assistant",
        content: "\u8fd9\u662f\u786e\u5b9a\u6027\u5386\u53f2\u6d88\u606f\u3002",
        status: "done",
        createdAt: "2026-01-01T00:00:00.000Z"
      }
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  }
];

type ApiHarness = {
  requests: string[];
  unexpectedRequests: string[];
  chatRequests: ChatStreamPayload[];
  chatTitleRequests: ChatTitlePayload[];
  chatKnowledgeCsrfHeaders: string[];
  agentRequests: AgentRunPayload[];
  agentKnowledgeCsrfHeaders: string[];
  langflowRequests: Array<{ workflowId: string; payload: Record<string, unknown> }>;
  knowledgeRetrievalRequests: Array<KnowledgeRetrievalRequest & { query: string }>;
  generationRequests: Array<{
    moduleId: "image" | "ppt" | "mindmap" | "translate";
    payload: GenerationPayload;
  }>;
  imageTimingEstimateRequests: Array<Record<string, string>>;
  modelCatalogMutations: ModelCatalogMutation[];
  modelVendorMutations: ModelVendorMutation[];
  setBootstrap: (payload: PublicBootstrapPayload) => void;
  setImageAssetUrls: (urls: string[] | null) => void;
  setGenerationDelayMs: (delayMs: number) => void;
  setAdminBootstrap: (payload: AdminBootstrapPayload) => void;
  setAdminBootstrapModelVendors: (modelVendors: ModelVendorEntry[] | undefined) => void;
  setAdminStatus: (status: AdminStatus) => void;
  setKnowledgeSession: (authenticated: boolean, bases?: KnowledgeBase[]) => void;
  setKnowledgeRetrievalError: (error: { code: string; message: string; status?: number } | null) => void;
};

type BrowserFixtures = {
  apiHarness: ApiHarness;
};

function cloneBootstrap(payload: PublicBootstrapPayload): PublicBootstrapPayload {
  return structuredClone(payload);
}

export const test = base.extend<BrowserFixtures>({
  apiHarness: [
    async ({ page }, use) => {
      let bootstrap = cloneBootstrap(publicBootstrapFixture);
      let adminBootstrap = structuredClone(adminBootstrapFixture);
      let adminModelVendorsOverride: ModelVendorEntry[] | undefined | null = null;
      let adminStatus: AdminStatus = {
        authRequired: true,
        authenticated: false,
        adminConfigured: true
      };
      const requests: string[] = [];
      const unexpectedRequests: string[] = [];
      const chatRequests: ChatStreamPayload[] = [];
      const chatTitleRequests: ChatTitlePayload[] = [];
      const chatKnowledgeCsrfHeaders: string[] = [];
      const agentRequests: AgentRunPayload[] = [];
      const agentKnowledgeCsrfHeaders: string[] = [];
      const langflowRequests: ApiHarness["langflowRequests"] = [];
      const knowledgeRetrievalRequests: ApiHarness["knowledgeRetrievalRequests"] = [];
      let knowledgeSession: KnowledgeAuthResponse = { authenticated: false };
      let knowledgeBases = structuredClone(readyKnowledgeBases);
      let knowledgeRetrievalError: { code: string; message: string; status?: number } | null = null;
      let imageAssetUrls: string[] | null = null;
      let generationDelayMs = 0;
      const generationRequests: ApiHarness["generationRequests"] = [];
      const imageTimingEstimateRequests: ApiHarness["imageTimingEstimateRequests"] = [];
      const modelCatalogMutations: ModelCatalogMutation[] = [];
      const modelVendorMutations: ModelVendorMutation[] = [];

      await page.route("https://api.example.test/**", async (route) => {
        const request = route.request();
        const requestLabel = `${request.method()} ${new URL(request.url()).pathname}`;
        unexpectedRequests.push(requestLabel);
        await route.fulfill({
          status: 501,
          contentType: "application/json",
          body: JSON.stringify({ error: `Unexpected provider request: ${requestLabel}` })
        });
      });

      await page.route("**/api/**", async (route) => {
        const request = route.request();
        const pathname = new URL(request.url()).pathname;
        const requestLabel = `${request.method()} ${pathname}`;
        requests.push(requestLabel);

        if (request.method() === "GET" && pathname === "/api/public/bootstrap") {
          await route.fulfill({ json: bootstrap });
          return;
        }

        if (request.method() === "GET" && pathname === "/api/image/timing-estimate") {
          const searchParams = new URL(request.url()).searchParams;
          imageTimingEstimateRequests.push(Object.fromEntries(searchParams.entries()));
          await route.fulfill({
            json: {
              estimatedMs: 29_000,
              sampleCount: 10,
              sampleLimit: 10,
              source: "global",
              scope: "exact",
              updatedAt: "2026-08-02T12:00:00.000Z"
            }
          });
          return;
        }

        if (request.method() === "GET" && pathname === "/api/kb/auth/session") {
          await route.fulfill({ json: knowledgeSession });
          return;
        }

        if (request.method() === "GET" && pathname === "/api/kb/public-config") {
          await route.fulfill({
            json: {
              registrationMode: "invite_only",
              accountRules: {
                usernameMinLength: 3,
                usernameMaxLength: 64,
                passwordMinLength: 10,
                passwordMaxLength: 200
              },
              recoveryCodeShownOnce: true
            }
          });
          return;
        }

        if (request.method() === "GET" && pathname === "/api/kb/embedding-profiles") {
          await route.fulfill({
            json: {
              items: [
                {
                  id: "openai-text-embedding-3-small",
                  vendor: "openai",
                  label: "OpenAI Embedding 3 Small",
                  actualModel: "text-embedding-3-small",
                  dimensions: 1536,
                  fingerprint: "e2e-openai-fingerprint",
                  defaultBaseUrl: "https://api.openai.com/v1",
                  protocol: "openai-embeddings",
                  maxBatchInputs: 64,
                  maxInputTokens: 8191,
                  bytesPerComponent: 4,
                  storageType: "vector"
                },
                {
                  id: "qwen-text-embedding-v4",
                  vendor: "qwen",
                  label: "Qwen Text Embedding v4",
                  actualModel: "text-embedding-v4",
                  dimensions: 1024,
                  fingerprint: "e2e-qwen-fingerprint",
                  defaultBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
                  protocol: "qwen-openai-compatible-embeddings",
                  maxBatchInputs: 10,
                  maxInputTokens: 8192,
                  bytesPerComponent: 4,
                  storageType: "vector"
                }
              ]
            }
          });
          return;
        }

        if (request.method() === "GET" && pathname === "/api/kb/bases") {
          await route.fulfill({ json: { items: knowledgeSession.authenticated ? knowledgeBases : [] } });
          return;
        }

        if (request.method() === "POST" && pathname === "/api/kb/retrieve") {
          const payload = request.postDataJSON() as KnowledgeRetrievalRequest & { query: string };
          knowledgeRetrievalRequests.push(payload);
          if (knowledgeRetrievalError) {
            await route.fulfill({
              status: knowledgeRetrievalError.status || 409,
              json: { error: { ...knowledgeRetrievalError, requestId: "e2e-retrieval-error" } }
            });
            return;
          }
          const selected = knowledgeBases.filter((base) => payload.knowledgeBaseIds.includes(base.id));
          const citations = selected.slice(0, 2).map((base, index) => ({
            id: `K0${index + 1}`,
            knowledgeBaseId: base.id,
            knowledgeBaseName: base.name,
            documentId: `${index + 5}5555555-5555-4555-8555-555555555555`,
            documentName: `${base.name}.md`,
            chunkId: `${index + 6}6666666-6666-4666-8666-666666666666`,
            chunkOrdinal: index,
            locator: { lineStart: index + 1, lineEnd: index + 8 },
            score: 0.91 - index * 0.05,
            mode: "vector" as const,
            source: {
              method: "GET" as const,
              openPath: `/api/kb/documents/source-${index}/source-url`,
              downloadPath: `/api/kb/documents/source-${index}/source-url?disposition=attachment`
            }
          }));
          await route.fulfill({
            json: {
              mode: "vector",
              knowledgeBaseIds: payload.knowledgeBaseIds,
              topK: payload.topK || 20,
              maxTopK: 20,
              queryBytes: payload.query.length,
              context: citations.map((citation) => `[${citation.id}] ${citation.documentName}`).join("\n"),
              contextBytes: 128,
              contextTruncated: false,
              chunks: citations.map((citation) => ({
                citationId: citation.id,
                knowledgeBaseId: citation.knowledgeBaseId,
                documentId: citation.documentId,
                chunkId: citation.chunkId,
                ordinal: citation.chunkOrdinal,
                text: `Knowledge for ${citation.documentName}`,
                score: citation.score,
                mode: "vector"
              })),
              citations
            }
          });
          return;
        }

        const knowledgeSourceMatch = pathname.match(/^\/api\/kb\/documents\/([^/]+)\/source-url$/);
        if (request.method() === "GET" && knowledgeSourceMatch) {
          const url = new URL(request.url());
          await route.fulfill({
            json: {
              source: {
                url: "https://download.example.test/signed-source",
                expiresAt: "2026-01-01T00:05:00.000Z",
                expiresInSeconds: 300,
                disposition: url.searchParams.get("disposition") === "attachment" ? "attachment" : "inline",
                knowledgeBaseId: readyKnowledgeBases[0].id,
                knowledgeBaseName: readyKnowledgeBases[0].name,
                documentId: knowledgeSourceMatch[1],
                documentName: "产品手册.md",
                chunkId: url.searchParams.get("chunkId"),
                locator: { lineStart: 1, lineEnd: 8 }
              }
            }
          });
          return;
        }

        if (request.method() === "POST" && pathname === "/api/kb/auth/logout") {
          knowledgeSession = { authenticated: false };
          await route.fulfill({ json: { ok: true } });
          return;
        }

        if (request.method() === "GET" && pathname === "/api/admin/status") {
          await route.fulfill({ json: adminStatus });
          return;
        }

        if (request.method() === "GET" && pathname === "/api/admin/bootstrap") {
          await route.fulfill({
            json: adminModelVendorsOverride === null
              ? adminBootstrap
              : { ...adminBootstrap, modelVendors: adminModelVendorsOverride }
          });
          return;
        }

        if (request.method() === "PATCH" && pathname === "/api/admin/credentials") {
          const payload = request.postDataJSON() as {
            currentPassword?: string;
            username?: string;
            password?: string;
          };
          const username = String(payload.username || "").trim();
          if (!payload.currentPassword || !username) {
            await route.fulfill({ status: 400, json: { error: "管理员凭据无效" } });
            return;
          }
          adminBootstrap = { ...adminBootstrap, adminUsername: username };
          adminStatus = { authRequired: true, authenticated: false, adminConfigured: true };
          await route.fulfill({
            json: { ok: true, username, reauthenticationRequired: true }
          });
          return;
        }

        if (request.method() === "POST" && pathname === "/api/admin/model-vendors") {
          const payload = request.postDataJSON() as Partial<Pick<ModelVendorEntry, "label" | "adapter">>;
          const mutation: ModelVendorMutation = { method: "POST", payload };
          modelVendorMutations.push(mutation);
          const label = String(payload.label || "").trim();
          const supportedAdapters: ProviderKind[] = [
            "openai",
            "anthropic",
            "gemini",
            "kimi",
            "deepseek",
            "qwen",
            "botcf",
            "openai-compatible"
          ];
          if (!label) {
            await route.fulfill({ status: 400, json: { error: "模型厂商名称不能为空" } });
            return;
          }
          if (!payload.adapter || !supportedAdapters.includes(payload.adapter)) {
            await route.fulfill({ status: 400, json: { error: "模型厂商适配器不受支持" } });
            return;
          }
          if (adminBootstrap.modelVendors.some((vendor) => vendor.label.localeCompare(label, undefined, { sensitivity: "accent" }) === 0)) {
            await route.fulfill({ status: 409, json: { error: "模型厂商名称已存在" } });
            return;
          }
          let sequence = adminBootstrap.modelVendors.length + 1;
          while (adminBootstrap.modelVendors.some((vendor) => vendor.id === `vendor-e2e-${sequence}`)) sequence += 1;
          const created: ModelVendorEntry = {
            id: `vendor-e2e-${sequence}`,
            label,
            adapter: payload.adapter,
            enabled: true,
            order: Math.max(-1, ...adminBootstrap.modelVendors.map((vendor) => vendor.order)) + 1
          };
          adminBootstrap = {
            ...adminBootstrap,
            modelVendors: [...adminBootstrap.modelVendors, created]
          };
          mutation.result = created;
          await route.fulfill({ status: 201, json: created });
          return;
        }

        if (request.method() === "PATCH" && pathname === "/api/admin/model-vendors/order") {
          const payload = request.postDataJSON() as { vendorIds?: string[] };
          const vendorIds = Array.isArray(payload.vendorIds) ? payload.vendorIds : [];
          const vendorsById = new Map(adminBootstrap.modelVendors.map((vendor) => [vendor.id, vendor]));
          if (
            vendorIds.length !== adminBootstrap.modelVendors.length
            || new Set(vendorIds).size !== vendorIds.length
            || vendorIds.some((id) => !vendorsById.has(id))
          ) {
            await route.fulfill({ status: 400, json: { error: "模型厂商排序必须包含完整且唯一的厂商 ID" } });
            return;
          }
          modelVendorMutations.push({ method: "REORDER", vendorIds: [...vendorIds] });
          const modelVendors = vendorIds.map((id, order) => ({ ...vendorsById.get(id)!, order }));
          adminBootstrap = { ...adminBootstrap, modelVendors };
          await route.fulfill({ json: modelVendors });
          return;
        }

        const modelVendorAdminMatch = pathname.match(/^\/api\/admin\/model-vendors\/([^/]+)$/);
        if (request.method() === "DELETE" && modelVendorAdminMatch) {
          const vendorId = decodeURIComponent(modelVendorAdminMatch[1]);
          modelVendorMutations.push({ method: "DELETE", id: vendorId });
          if (!adminBootstrap.modelVendors.some((vendor) => vendor.id === vendorId)) {
            await route.fulfill({ status: 404, json: { error: "模型厂商不存在" } });
            return;
          }
          if (adminBootstrap.modelVendors.length <= 1) {
            await route.fulfill({ status: 409, json: { error: "必须至少保留一个模型厂商" } });
            return;
          }
          if (adminBootstrap.modelCatalog.some((entry) => entry.vendorId === vendorId)) {
            await route.fulfill({ status: 409, json: { error: "模型厂商仍包含模型，请先迁移或删除模型" } });
            return;
          }
          adminBootstrap = {
            ...adminBootstrap,
            modelVendors: adminBootstrap.modelVendors.filter((vendor) => vendor.id !== vendorId)
          };
          await route.fulfill({ status: 204, body: "" });
          return;
        }

        if (request.method() === "POST" && pathname === "/api/admin/model-catalog") {
          const payload = request.postDataJSON() as Partial<ModelCatalogEntry>;
          modelCatalogMutations.push({ method: "POST", payload });
          const vendorId = String(payload.vendorId || "");
          const selectedVendor = adminBootstrap.modelVendors.find((vendor) => vendor.id === vendorId);
          if (!selectedVendor) {
            await route.fulfill({ status: 400, json: { error: "模型厂商不存在" } });
            return;
          }
          const created: ModelCatalogEntry = {
            id: `model-e2e-${adminBootstrap.modelCatalog.length + 1}`,
            vendorId: selectedVendor.id,
            vendor: selectedVendor.adapter,
            vendorLabel: selectedVendor.label,
            order: adminBootstrap.modelCatalog.length,
            endpointProtocol: payload.endpointProtocol || "openai-responses",
            model: String(payload.model || "e2e-model"),
            label: String(payload.label || "E2E Model"),
            capabilities: payload.capabilities || ["chat"],
            defaultFor: payload.defaultFor || [],
            enabled: payload.enabled !== false,
            contextWindowTokens: payload.contextWindowTokens,
            maxInputCharacters: payload.maxInputCharacters,
            mediaConfig: payload.mediaConfig
          };
          adminBootstrap = {
            ...adminBootstrap,
            modelCatalog: [...adminBootstrap.modelCatalog, created]
          };
          bootstrap = {
            ...bootstrap,
            modelCatalog: adminBootstrap.modelCatalog.filter((entry) => entry.enabled)
          };
          await route.fulfill({ status: 201, json: created });
          return;
        }

        if (request.method() === "PATCH" && pathname === "/api/admin/model-catalog/order") {
          const payload = request.postDataJSON() as { modelIds?: string[] };
          const modelIds = Array.isArray(payload.modelIds) ? payload.modelIds : [];
          const catalogById = new Map(adminBootstrap.modelCatalog.map((entry) => [entry.id, entry]));
          if (
            modelIds.length !== adminBootstrap.modelCatalog.length
            || new Set(modelIds).size !== modelIds.length
            || modelIds.some((id) => !catalogById.has(id))
          ) {
            await route.fulfill({ status: 400, json: { error: "模型排序必须包含完整且唯一的模型 ID" } });
            return;
          }
          modelCatalogMutations.push({ method: "REORDER", modelIds: [...modelIds] });
          const modelCatalog = modelIds.map((id, order) => ({ ...catalogById.get(id)!, order }));
          adminBootstrap = { ...adminBootstrap, modelCatalog };
          bootstrap = { ...bootstrap, modelCatalog: modelCatalog.filter((entry) => entry.enabled) };
          await route.fulfill({ json: modelCatalog });
          return;
        }

        const modelCatalogAdminMatch = pathname.match(/^\/api\/admin\/model-catalog\/([^/]+)$/);
        if (request.method() === "PATCH" && modelCatalogAdminMatch) {
          const payload = request.postDataJSON() as Partial<ModelCatalogEntry>;
          modelCatalogMutations.push({ method: "PATCH", id: modelCatalogAdminMatch[1], payload });
          const current = adminBootstrap.modelCatalog.find((entry) => entry.id === modelCatalogAdminMatch[1]);
          if (!current) {
            await route.fulfill({ status: 404, json: { error: "Model not found" } });
            return;
          }
          const vendorId = String(payload.vendorId || current.vendorId);
          const selectedVendor = adminBootstrap.modelVendors.find((vendor) => vendor.id === vendorId);
          if (!selectedVendor) {
            await route.fulfill({ status: 400, json: { error: "模型厂商不存在" } });
            return;
          }
          const updated: ModelCatalogEntry = {
            ...current,
            ...payload,
            id: current.id,
            vendorId: selectedVendor.id,
            vendor: selectedVendor.adapter,
            vendorLabel: selectedVendor.label
          };
          adminBootstrap = {
            ...adminBootstrap,
            modelCatalog: adminBootstrap.modelCatalog.map((entry) => entry.id === updated.id ? updated : entry)
          };
          bootstrap = {
            ...bootstrap,
            modelCatalog: adminBootstrap.modelCatalog.filter((entry) => entry.enabled)
          };
          await route.fulfill({ json: updated });
          return;
        }

        if (request.method() === "DELETE" && modelCatalogAdminMatch) {
          const modelId = modelCatalogAdminMatch[1];
          const current = adminBootstrap.modelCatalog.find((entry) => entry.id === modelId);
          if (!current) {
            await route.fulfill({ status: 404, json: { error: "Model not found" } });
            return;
          }
          adminBootstrap = {
            ...adminBootstrap,
            modelCatalog: adminBootstrap.modelCatalog.filter((entry) => entry.id !== modelId)
          };
          bootstrap = {
            ...bootstrap,
            modelCatalog: adminBootstrap.modelCatalog.filter((entry) => entry.enabled)
          };
          await route.fulfill({ json: { ok: true } });
          return;
        }

        if (request.method() === "POST" && pathname === "/api/admin/langflow-workflows") {
          const payload = request.postDataJSON() as Partial<AdminLangflowWorkflow>;
          const created: AdminLangflowWorkflow = {
            id: "langflow-e2e-published",
            flowId: String(payload.flowId || "e2e-flow"),
            name: String(payload.name || "E2E Workflow"),
            description: String(payload.description || ""),
            welcomeMessage: String(payload.welcomeMessage || ""),
            inputPlaceholder: String(payload.inputPlaceholder || ""),
            tags: Array.isArray(payload.tags) ? payload.tags.map(String) : [],
            enabled: payload.enabled !== false,
            order: Number(payload.order) || 100,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z"
          };
          adminBootstrap = {
            ...adminBootstrap,
            langflowWorkflows: [created, ...adminBootstrap.langflowWorkflows]
          };
          await route.fulfill({ status: 201, json: created });
          return;
        }

        const langflowAdminMatch = pathname.match(/^\/api\/admin\/langflow-workflows\/([^/]+)$/);
        if (request.method() === "PATCH" && langflowAdminMatch) {
          const payload = request.postDataJSON() as Partial<AdminLangflowWorkflow>;
          const current = adminBootstrap.langflowWorkflows.find((item) => item.id === langflowAdminMatch[1]);
          const updated: AdminLangflowWorkflow = {
            ...(current || {
              id: langflowAdminMatch[1],
              flowId: "e2e-flow",
              name: "E2E Workflow",
              description: "",
              welcomeMessage: "",
              inputPlaceholder: "",
              tags: [],
              enabled: true,
              order: 100,
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z"
            }),
            ...payload,
            id: langflowAdminMatch[1],
            tags: Array.isArray(payload.tags) ? payload.tags.map(String) : (current?.tags || []),
            updatedAt: "2026-01-01T00:00:00.000Z"
          };
          adminBootstrap = {
            ...adminBootstrap,
            langflowWorkflows: adminBootstrap.langflowWorkflows.map((item) => item.id === updated.id ? updated : item)
          };
          await route.fulfill({ json: updated });
          return;
        }

        if (request.method() === "DELETE" && langflowAdminMatch) {
          adminBootstrap = {
            ...adminBootstrap,
            langflowWorkflows: adminBootstrap.langflowWorkflows.filter((item) => item.id !== langflowAdminMatch[1])
          };
          await route.fulfill({ status: 204, body: "" });
          return;
        }

        if (request.method() === "GET" && pathname === "/api/admin/ops") {
          await route.fulfill({ json: adminOpsFixture });
          return;
        }

        if (request.method() === "GET" && pathname === "/api/admin/backups") {
          await route.fulfill({ json: [] });
          return;
        }

        if (request.method() === "GET" && pathname === "/api/admin/audit-log") {
          await route.fulfill({ json: [] });
          return;
        }

        if (request.method() === "GET" && pathname === "/api/admin/knowledge/settings") {
          await route.fulfill({ json: knowledgeAdminSettingsFixture });
          return;
        }

        if (request.method() === "PUT" && pathname === "/api/admin/knowledge/settings") {
          const payload = request.postDataJSON() as Partial<KnowledgeAdminSettings>;
          await route.fulfill({
            json: {
              ...knowledgeAdminSettingsFixture,
              ...payload,
              version: knowledgeAdminSettingsFixture.version + 1,
              limits: payload.limits || knowledgeAdminSettingsFixture.limits
            }
          });
          return;
        }

        if (request.method() === "GET" && pathname === "/api/admin/knowledge/overview") {
          await route.fulfill({ json: knowledgeAdminOverviewFixture });
          return;
        }

        if (request.method() === "GET" && pathname === "/api/admin/knowledge/readiness") {
          await route.fulfill({ json: knowledgeAdminReadinessFixture });
          return;
        }

        if (request.method() === "GET" && pathname === "/api/admin/knowledge/accounts") {
          await route.fulfill({ json: { items: [knowledgeAdminAccountFixture], nextCursor: null } });
          return;
        }

        const knowledgeAccountMatch = pathname.match(/^\/api\/admin\/knowledge\/accounts\/([^/]+)$/);
        if (request.method() === "PATCH" && knowledgeAccountMatch) {
          const payload = request.postDataJSON() as { status?: KnowledgeAdminAccount["status"] };
          await route.fulfill({
            json: {
              ...knowledgeAdminAccountFixture,
              status: payload.status || knowledgeAdminAccountFixture.status,
              version: knowledgeAdminAccountFixture.version + 1
            }
          });
          return;
        }

        if (request.method() === "DELETE" && knowledgeAccountMatch) {
          const result: KnowledgeAdminAccountDeletionResult = {
            accepted: true,
            accountId: knowledgeAccountMatch[1],
            status: "deleting",
            version: knowledgeAdminAccountFixture.version + 1,
            knowledgeBasesMarked: knowledgeAdminAccountFixture.knowledgeBaseCount,
            documentsMarked: knowledgeAdminAccountFixture.documentCount,
            job: {
              ...knowledgeAdminJobFixture,
              id: "99999999-9999-4999-8999-999999999999",
              accountId: knowledgeAccountMatch[1],
              knowledgeBaseId: null,
              documentId: null,
              kind: "cleanup",
              status: "queued",
              progressCurrent: 0,
              progressTotal: 0,
              leaseActive: false,
              errorCode: null
            }
          };
          await route.fulfill({ json: result });
          return;
        }

        const knowledgeRevokeMatch = pathname.match(/^\/api\/admin\/knowledge\/accounts\/([^/]+)\/revoke-sessions$/);
        if (request.method() === "POST" && knowledgeRevokeMatch) {
          await route.fulfill({ json: { accountId: knowledgeRevokeMatch[1], revokedSessions: 2 } });
          return;
        }

        const knowledgeResetMatch = pathname.match(/^\/api\/admin\/knowledge\/accounts\/([^/]+)\/reset$/);
        if (request.method() === "POST" && knowledgeResetMatch) {
          await route.fulfill({
            json: {
              accountId: knowledgeResetMatch[1],
              resetId: "77777777-7777-4777-8777-777777777777",
              resetCode: "XI-KB-RESET-E2E1-E2E2-E2E3-E2E4-E2E5-E2E6-E2E7-E2E8-E2E9-E2EA",
              expiresAt: "2026-01-01T00:15:00.000Z",
              revokedSessions: 2
            }
          });
          return;
        }

        if (request.method() === "GET" && pathname === "/api/admin/knowledge/invites") {
          await route.fulfill({ json: { items: [knowledgeAdminInviteFixture], nextCursor: null } });
          return;
        }

        if (request.method() === "POST" && pathname === "/api/admin/knowledge/invites") {
          await route.fulfill({
            status: 201,
            json: {
              invite: knowledgeAdminInviteFixture,
              inviteCode: "XI-KB-INV-E2E1-E2E2-E2E3-E2E4-E2E5-E2E6-E2E7-E2E8-E2E9"
            }
          });
          return;
        }

        const knowledgeInviteMatch = pathname.match(/^\/api\/admin\/knowledge\/invites\/([^/]+)$/);
        if (request.method() === "DELETE" && knowledgeInviteMatch) {
          await route.fulfill({ json: { invite: { ...knowledgeAdminInviteFixture, status: "revoked" } } });
          return;
        }

        if (request.method() === "GET" && pathname === "/api/admin/knowledge/jobs") {
          await route.fulfill({ json: { items: [knowledgeAdminJobFixture], nextCursor: null } });
          return;
        }

        if (request.method() === "POST" && pathname === "/api/admin/knowledge/maintenance/reconcile") {
          const payload = request.postDataJSON() as { accountId?: string };
          await route.fulfill({ json: knowledgeAdminReconcileFixture(payload.accountId) });
          return;
        }

        if (request.method() === "POST" && pathname === "/api/admin/knowledge/maintenance/cleanup-stale") {
          await route.fulfill({ json: knowledgeAdminMaintenanceFixture });
          return;
        }

        const knowledgeJobActionMatch = pathname.match(/^\/api\/admin\/knowledge\/jobs\/([^/]+)\/(retry|cancel)$/);
        if (request.method() === "POST" && knowledgeJobActionMatch) {
          await route.fulfill({
            json: {
              job: {
                ...knowledgeAdminJobFixture,
                status: knowledgeJobActionMatch[2] === "retry" ? "queued" : "cancelled",
                leaseActive: false,
                errorCode: knowledgeJobActionMatch[2] === "retry" ? null : "KB_JOB_CANCELLED"
              }
            }
          });
          return;
        }

        if (request.method() === "GET" && pathname === "/api/admin/knowledge/audit") {
          await route.fulfill({ json: { items: [knowledgeAdminAuditFixture], nextCursor: null } });
          return;
        }

        if (request.method() === "POST" && pathname === "/api/chat/title") {
          chatTitleRequests.push(request.postDataJSON() as ChatTitlePayload);
          await route.fulfill({ json: { title: "自动总结标题" } });
          return;
        }

        if (request.method() === "POST" && pathname === "/api/chat/stream") {
          const payload = request.postDataJSON() as ChatStreamPayload;
          chatRequests.push(payload);
          chatKnowledgeCsrfHeaders.push(request.headers()["x-knowledge-csrf"] || "");
          const createdAt = "2026-01-01T00:00:00.000Z";
          const conversation = payload.conversation || {
            id: "e2e-chat",
            title: "Deterministic chat",
            assistantId: payload.assistantId,
            pinned: false,
            messageCount: 0,
            preview: "",
            createdAt,
            updatedAt: createdAt
          };
          const completedConversation = {
            ...conversation,
            messageCount: conversation.messageCount + 2,
            preview: payload.displayContent || payload.content,
            updatedAt: createdAt
          };
          const userMessage = {
            id: "e2e-chat-user",
            role: "user" as const,
            content: payload.displayContent || payload.content,
            createdAt
          };
          const selectedBase = knowledgeBases.find((base) => payload.knowledgeBaseIds?.includes(base.id));
          const assistantMessage = {
            id: "e2e-chat-assistant",
            role: "assistant" as const,
            content: "Deterministic assistant response.",
            model: payload.modelId,
            providerId: payload.modelId,
            status: "done" as const,
            knowledgeCitations: selectedBase ? [{
              id: "K01",
              knowledgeBaseId: selectedBase.id,
              knowledgeBaseName: selectedBase.name,
              documentId: "55555555-5555-4555-8555-555555555555",
              documentName: `${selectedBase.name}.md`,
              chunkId: "66666666-6666-4666-8666-666666666666",
              chunkOrdinal: 0,
              locator: { lineStart: 1, lineEnd: 8 },
              score: 0.91,
              mode: "vector" as const,
              source: {
                method: "GET" as const,
                openPath: "/api/kb/documents/55555555-5555-4555-8555-555555555555/source-url",
                downloadPath: "/api/kb/documents/55555555-5555-4555-8555-555555555555/source-url?disposition=attachment"
              }
            }] : undefined,
            createdAt
          };
          const events = [
            `event: meta\ndata: ${JSON.stringify({
              conversation: completedConversation,
              userMessage,
              assistantMessageId: assistantMessage.id
            })}`,
            `event: token\ndata: ${JSON.stringify({ token: assistantMessage.content })}`,
            `event: done\ndata: ${JSON.stringify({ conversation: completedConversation, message: assistantMessage })}`
          ];
          await route.fulfill({
            status: 200,
            contentType: "text/event-stream; charset=utf-8",
            body: `${events.join("\n\n")}\n\n`
          });
          return;
        }

        const langflowMatch = pathname.match(/^\/api\/workflows\/([^/]+)\/stream$/);
        if (request.method() === "POST" && langflowMatch) {
          const payload = request.postDataJSON() as Record<string, unknown>;
          const workflowId = decodeURIComponent(langflowMatch[1]);
          langflowRequests.push({ workflowId, payload });
          const selectedWorkflow = bootstrap.langflowWorkflows.find((item) => item.id === workflowId);
          const responseText = `Workflow result: ${String(payload.input || "")}`;
          const events = [
            `event: meta\ndata: ${JSON.stringify({
              sessionId: String(payload.sessionId || "e2e-session"),
              workflow: selectedWorkflow,
              requestId: "e2e-langflow-request"
            })}`,
            `event: token\ndata: ${JSON.stringify({ token: responseText })}`,
            `event: done\ndata: ${JSON.stringify({
              sessionId: String(payload.sessionId || "e2e-session"),
              text: responseText,
              finished: true
            })}`
          ];
          await route.fulfill({
            status: 200,
            contentType: "text/event-stream; charset=utf-8",
            body: `${events.join("\n\n")}\n\n`
          });
          return;
        }

        if (request.method() === "POST" && pathname === "/api/agents/run") {
          const payload = request.postDataJSON() as AgentRunPayload;
          agentRequests.push(payload);
          agentKnowledgeCsrfHeaders.push(request.headers()["x-knowledge-csrf"] || "");
          const cloudCitationBase = knowledgeBases.find((base) => payload.knowledgeBaseIds?.includes(base.id));
          const knowledgeCitations = cloudCitationBase ? [{
            id: "K01",
            knowledgeBaseId: cloudCitationBase.id,
            knowledgeBaseName: cloudCitationBase.name,
            documentId: "55555555-5555-4555-8555-555555555555",
            documentName: `${cloudCitationBase.name}.md`,
            chunkId: "66666666-6666-4666-8666-666666666666",
            chunkOrdinal: 0,
            locator: { lineStart: 1, lineEnd: 8 },
            score: 0.91,
            mode: "vector" as const,
            source: {
              method: "GET" as const,
              openPath: "/api/kb/documents/55555555-5555-4555-8555-555555555555/source-url",
              downloadPath: "/api/kb/documents/55555555-5555-4555-8555-555555555555/source-url?disposition=attachment"
            }
          }] : undefined;
          await route.fulfill({
            json: {
              id: `e2e-${payload.moduleId || "agents"}-result`,
              module: "agents",
              title: "Deterministic agent result",
              status: "completed",
              text: payload.moduleId === "workflows"
                ? `Workflow step completed: ${payload.prompt.slice(0, 48)}`
                : "Deterministic agent response.",
              raw: {
                toolTrace: [],
                agent: payload.agent ? { id: payload.agent.id, name: payload.agent.name, source: "browser" } : null,
                ...(knowledgeCitations ? { knowledgeCitations } : {})
              },
              createdAt: "2026-01-01T00:00:00.000Z"
            }
          });
          return;
        }

        if (request.method() === "POST" && pathname === "/api/image/optimize-prompt") {
          await route.fulfill({
            json: {
              prompt: "未来深海图书馆悬浮于幽蓝海水中，生物荧光勾勒建筑轮廓，电影级构图与体积光"
            }
          });
          return;
        }

        const generationMatch = pathname.match(/^\/api\/generate\/(image|ppt|mindmap|translate)$/);
        if (request.method() === "POST" && generationMatch) {
          const moduleId = generationMatch[1] as ApiHarness["generationRequests"][number]["moduleId"];
          const payload = request.postDataJSON() as GenerationPayload;
          generationRequests.push({ moduleId, payload });
          const requestedAssetCount = moduleId === "image"
            ? Math.max(1, Math.min(4, Math.trunc(Number(payload.options?.count) || 1)))
            : 0;
          const requestedPptSlideCount = moduleId === "ppt"
            ? Math.max(4, Math.min(20, Math.trunc(Number(payload.options?.ppt?.slideCount) || 8)))
            : 0;
          const mindmapOperation = payload.options?.mindmap?.operation || "generate";
          const mindmapFixture: MindmapDocument | undefined = moduleId === "mindmap"
            ? structuredClone(payload.options?.mindmap?.currentDocument || {
                version: 1,
                title: payload.prompt || "Deterministic map",
                summary: "Structured mind map fixture",
                root: {
                  id: "root",
                  label: payload.prompt || "Deterministic map",
                  children: [
                    {
                      id: "branch-one",
                      label: "目标与价值",
                      children: [{ id: "detail-one", label: "成功标准", children: [] }]
                    },
                    {
                      id: "branch-two",
                      label: "行动路径",
                      children: [{ id: "detail-two", label: "下一步", children: [] }]
                    },
                    {
                      id: "branch-three",
                      label: "风险与验证",
                      children: []
                    }
                  ]
                }
              } satisfies MindmapDocument)
            : undefined;
          if (mindmapFixture && mindmapOperation === "expand") {
            const findNode = (node: MindmapDocument["root"]): MindmapDocument["root"] | null => {
              if (node.id === payload.options?.mindmap?.targetNodeId) return node;
              for (const child of node.children) {
                const match = findNode(child);
                if (match) return match;
              }
              return null;
            };
            findNode(mindmapFixture.root)?.children.push({
              id: "expanded-evidence",
              label: "AI 新增节点",
              note: "只更新选中分支",
              children: []
            });
          }
          if (mindmapFixture && mindmapOperation === "reorganize") {
            mindmapFixture.root.children.reverse();
            mindmapFixture.summary = "AI 已按逻辑重新组织";
          }
          const pptFixtureLayoutCycle = ["quote", "two-column", "data", "timeline", "section", "content"] as const;
          const result: GenerationResult = {
            id: `e2e-${moduleId}-result`,
            module: moduleId,
            title: `Deterministic ${moduleId} result`,
            status: "completed",
            text: moduleId === "mindmap"
              ? `# ${mindmapFixture?.root.label || "Deterministic map"}\n${mindmapFixture?.root.children.map((child) => `## ${child.label}`).join("\n") || ""}`
              : moduleId === "translate"
                ? "Deterministic translated result."
                : moduleId === "ppt"
                  ? "# Deterministic deck\n\n## Slide 1"
                  : undefined,
            deck: moduleId === "ppt"
              ? {
                  version: 1,
                  title: payload.prompt || "Deterministic deck",
                  subtitle: "Structured preview fixture",
                  summary: "A deterministic browser-rendered presentation",
                  themeId: payload.options?.ppt?.themeId || "red-note",
                  aspectRatio: "16:9",
                  slides: Array.from({ length: requestedPptSlideCount }, (_, index) => {
                    const type = index === 0
                      ? "cover" as const
                      : index === requestedPptSlideCount - 1
                        ? "summary" as const
                        : pptFixtureLayoutCycle[(index - 1) % pptFixtureLayoutCycle.length];
                    const bullets = type === "cover" || type === "section"
                      ? []
                      : type === "quote"
                        ? ["让复杂信息更快转化为清晰行动"]
                        : type === "data"
                          ? ["增长率 24%", "满意度 92%", "交付周期 -18%"]
                          : type === "timeline"
                            ? ["洞察问题", "验证方案", "规模落地", "持续优化"]
                            : [`要点 ${index + 1}-1`, `要点 ${index + 1}-2`, `要点 ${index + 1}-3`];
                    return {
                      id: `fixture-slide-${index + 1}`,
                      type,
                      title: index === 0 ? payload.prompt : `第 ${index + 1} 页内容`,
                      subtitle: type === "cover"
                        ? "Structured preview fixture"
                        : type === "section"
                          ? "从关键事实进入下一章节"
                          : undefined,
                      bullets,
                      leftContent: type === "two-column" ? ["当前体验", "主要问题"] : undefined,
                      rightContent: type === "two-column" ? ["目标体验", "改进结果"] : undefined,
                      speakerNotes: index > 0 ? `第 ${index + 1} 页演讲备注` : undefined
                    };
                  })
                }
              : undefined,
            mindmap: mindmapFixture,
            assets: moduleId === "image"
              ? Array.from({ length: requestedAssetCount }, (_, index) => ({
                  type: "image" as const,
                  url: imageAssetUrls?.[index % imageAssetUrls.length]
                    || `/assets/figma/inspiration-01.jpg?asset=${index + 1}`,
                  label: `Generated image ${index + 1}`
                }))
              : undefined,
            timingEstimate: moduleId === "image"
              ? {
                  estimatedMs: 32_000,
                  sampleCount: 10,
                  sampleLimit: 10,
                  source: "global",
                  scope: "exact",
                  updatedAt: "2026-08-02T12:01:00.000Z"
                }
              : undefined,
            createdAt: "2026-01-01T00:00:00.000Z"
          };
          if (generationDelayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, generationDelayMs));
          }
          await route.fulfill({ json: result });
          return;
        }

        unexpectedRequests.push(requestLabel);
        await route.fulfill({
          status: 501,
          contentType: "application/json",
          body: JSON.stringify({ error: `Unexpected browser-test API request: ${requestLabel}` })
        });
      });

      await use({
        requests,
        unexpectedRequests,
        chatRequests,
        chatTitleRequests,
        chatKnowledgeCsrfHeaders,
        agentRequests,
        agentKnowledgeCsrfHeaders,
        langflowRequests,
        knowledgeRetrievalRequests,
        generationRequests,
        imageTimingEstimateRequests,
        modelCatalogMutations,
        modelVendorMutations,
        setBootstrap(nextPayload) {
          bootstrap = cloneBootstrap(nextPayload);
        },
        setImageAssetUrls(urls) {
          imageAssetUrls = urls?.length ? [...urls] : null;
        },
        setGenerationDelayMs(delayMs) {
          generationDelayMs = Math.max(0, Math.min(5_000, Math.trunc(delayMs)));
        },
        setAdminBootstrap(nextPayload) {
          adminBootstrap = structuredClone(nextPayload);
        },
        setAdminBootstrapModelVendors(modelVendors) {
          adminModelVendorsOverride = modelVendors === undefined
            ? undefined
            : structuredClone(modelVendors);
        },
        setAdminStatus(nextStatus) {
          adminStatus = { ...nextStatus };
        },
        setKnowledgeSession(authenticated, bases = readyKnowledgeBases) {
          knowledgeSession = authenticated
            ? {
                authenticated: true,
                account: {
                  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                  username: "knowledge-e2e",
                  status: "active"
                },
                csrfToken: knowledgeCsrfToken,
                expiresAt: "2026-01-02T00:00:00.000Z"
              }
            : { authenticated: false };
          knowledgeBases = structuredClone(bases);
        },
        setKnowledgeRetrievalError(nextError) {
          knowledgeRetrievalError = nextError;
        }
      });

      expect.soft(
        unexpectedRequests,
        "Shell tests must not call provider or unmocked application APIs"
      ).toEqual([]);
    },
    { auto: true }
  ]
});

export { expect } from "@playwright/test";

export async function seedReadyProvider(page: Page) {
  await page.addInitScript(
    ({ key, value }) => {
      window.sessionStorage.setItem(key, JSON.stringify(value));
    },
    { key: providerStorageKey, value: readyProvider }
  );
}

export async function seedReadySearchService(page: Page) {
  await page.addInitScript(
    ({ key, value }) => {
      window.sessionStorage.setItem(key, JSON.stringify(value));
    },
    { key: searchServiceStorageKey, value: readySearchService }
  );
}

export async function seedKnowledgeEmbeddingConnections(page: Page) {
  await page.addInitScript(
    ({ key }) => {
      window.sessionStorage.setItem(key, JSON.stringify({
        version: 1,
        connections: {
          openai: {
            vendor: "openai",
            baseUrl: "https://api.openai.example.test/v1",
            apiKey: "e2e-openai-embedding-key"
          },
          qwen: {
            vendor: "qwen",
            baseUrl: "https://dashscope.example.test/compatible-mode/v1",
            apiKey: "e2e-qwen-embedding-key"
          }
        }
      }));
    },
    { key: knowledgeEmbeddingStorageKey }
  );
}

export async function seedChatConversations(page: Page, conversations: Conversation[] = conversationFixture) {
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, JSON.stringify(value));
    },
    { key: conversationStorageKey, value: conversations }
  );
}

export async function readWorkspaceRecords<T>(page: Page, storeName: string): Promise<T[]> {
  return page.evaluate(
    ({ database, store }) => new Promise<T[]>((resolve, reject) => {
      const request = indexedDB.open(database);
      request.onerror = () => reject(request.error || new Error("workspace database open failed"));
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction(store, "readonly");
        const records = tx.objectStore(store).getAll();
        records.onsuccess = () => resolve(records.result as T[]);
        records.onerror = () => reject(records.error || new Error("workspace store read failed"));
        tx.oncomplete = () => db.close();
        tx.onerror = () => {
          db.close();
          reject(tx.error || new Error("workspace transaction failed"));
        };
      };
    }),
    { database: "xi-ai-web-workspace", store: storeName }
  );
}

export function isMobileProject(projectName: string) {
  return projectName.startsWith("mobile-");
}

export function visibleModuleNavigation(page: Page) {
  return page.locator(".figma-navigation:visible");
}

export async function openMobileNavigation(page: Page) {
  const trigger = page.getByRole("button", { name: "\u6253\u5f00\u529f\u80fd\u83dc\u5355", exact: true });
  if (await trigger.isVisible() && await trigger.getAttribute("aria-expanded") !== "true") {
    await trigger.click();
  }
}

export function navigationAction(page: Page, accessibleName: string) {
  const navigation = visibleModuleNavigation(page);
  return navigation
    .getByRole("button", { name: accessibleName, exact: true })
    .or(navigation.getByRole("link", { name: accessibleName, exact: true }))
    .first();
}

export async function waitForPublicModule(
  page: Page,
  destination: (typeof publicDestinations)[number]
) {
  await expect(page).toHaveURL(new RegExp(`${destination.path}$`));
  await expect(page).toHaveTitle(`${destination.label} - xi-ai-web`);
  await expect(page.locator("[data-active-module]")).toHaveAttribute(
    "data-active-module",
    destination.id
  );
  await expect(
    page
      .getByRole("main")
      .getByText("\u6b63\u5728\u52a0\u8f7d\u5de5\u4f5c\u53f0", { exact: true })
  ).toHaveCount(0, { timeout: 20_000 });
}

export async function visibleScrollOwners(page: Page) {
  return page.locator("[data-scroll-owner]").evaluateAll((elements) =>
    elements
      .filter((element) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      })
      .map((element) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          className: element.className,
          overflowY: style.overflowY,
          clientHeight: element.clientHeight,
          scrollHeight: element.scrollHeight,
          top: rect.top,
          bottom: rect.bottom
        };
      })
  );
}

export async function documentOverflow(page: Page) {
  return page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth
  }));
}
