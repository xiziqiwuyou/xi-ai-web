import { expect, test as base, type Page } from "@playwright/test";
import type {
  AdminBootstrapPayload,
  AdminOpsPayload,
  AdminStatus,
  AgentRunPayload,
  ChatStreamPayload,
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
  PublicBootstrapPayload,
  SearchServiceConfig,
  UserProviderConfig
} from "../../../src/types";

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
  { id: "ppt", path: "/ppt", label: "AI \u4e00\u952e PPT", heading: "\u4e00\u53e5\u4e3b\u9898\uff0c\u4e00\u4efd\u597d PPT\u3002" },
  { id: "mindmap", path: "/mindmap", label: "\u601d\u7ef4\u5bfc\u56fe", heading: "\u628a\u6a21\u7cca\u60f3\u6cd5\uff0c\u53d8\u6210\u6e05\u6670\u8def\u5f84\u3002" },
  { id: "assistants", path: "/assistants", label: "\u52a9\u624b\u5e93", heading: "\u7ed9\u4efb\u52a1\u627e\u4e00\u4f4d \u771f\u6b63\u61c2\u884c\u7684\u4f19\u4f34\u3002" },
  { id: "translate", path: "/translate", label: "\u7ffb\u8bd1", heading: "\u4e0d\u53ea\u662f\u7ffb\u8bd1\uff0c\u66f4\u50cf\u6bcd\u8bed\u8868\u8fbe\u3002" }
] as const;

export const publicBootstrapFixture: PublicBootstrapPayload = {
  settings: {
    siteName: "xi-ai-web",
    theme: "rednote",
    allowGuestChat: true,
    defaultModule: "chat"
  },
  menuItems: publicDestinations.map((destination, index) => ({
    id: destination.id,
    label: destination.label,
    enabled: true,
    visible: true,
    order: (index + 1) * 10
  })),
  modelCatalog: [
    {
      id: "test-chat",
      vendor: "openai",
      model: mappedRequestModel,
      label: "Test Chat",
      capabilities: ["chat", "vision", "toolCalling", "webSearch", "codeExecution", "streaming"],
      defaultFor: ["chat"],
      enabled: true
    },
    {
      id: "openai-fast",
      vendor: "openai",
      model: "openai-fast",
      label: "OpenAI Fast",
      capabilities: ["chat", "streaming"],
      defaultFor: [],
      enabled: true
    },
    {
      id: "openai-code",
      vendor: "openai",
      model: "openai-code",
      label: "OpenAI Code",
      capabilities: ["chat", "toolCalling", "streaming"],
      defaultFor: [],
      enabled: true
    },
    {
      id: "openai-long",
      vendor: "openai",
      model: "openai-long",
      label: "OpenAI Long",
      capabilities: ["chat"],
      defaultFor: [],
      enabled: true
    },
    {
      id: "anthropic-sonnet",
      vendor: "anthropic",
      model: "anthropic-sonnet",
      label: "Claude Sonnet",
      capabilities: ["chat", "vision", "streaming"],
      defaultFor: [],
      enabled: true
    },
    {
      id: "anthropic-haiku",
      vendor: "anthropic",
      model: "anthropic-haiku",
      label: "Claude Haiku",
      capabilities: ["chat", "streaming"],
      defaultFor: [],
      enabled: true
    },
    {
      id: "anthropic-reason",
      vendor: "anthropic",
      model: "anthropic-reason",
      label: "Claude Reason",
      capabilities: ["chat", "toolCalling"],
      defaultFor: [],
      enabled: true
    },
    {
      id: "anthropic-long",
      vendor: "anthropic",
      model: "anthropic-long",
      label: "Claude Long",
      capabilities: ["chat"],
      defaultFor: [],
      enabled: true
    },
    {
      id: "gemini-vision",
      vendor: "gemini",
      model: "gemini-vision",
      label: "Gemini Vision",
      capabilities: ["chat", "vision", "streaming"],
      defaultFor: [],
      enabled: true
    },
    {
      id: "gemini-flash",
      vendor: "gemini",
      model: "gemini-flash",
      label: "Gemini Flash",
      capabilities: ["chat", "vision", "streaming"],
      defaultFor: [],
      enabled: true
    },
    {
      id: "gemini-pro-vision",
      vendor: "gemini",
      model: "gemini-pro-vision",
      label: "Gemini Pro Vision",
      capabilities: ["chat", "vision", "toolCalling"],
      defaultFor: [],
      enabled: true
    },
    {
      id: "compatible-vision",
      vendor: "openai-compatible",
      model: "compatible-vision",
      label: "Compatible Vision",
      capabilities: ["chat", "vision"],
      defaultFor: [],
      enabled: true
    },
    {
      id: "kimi-chat",
      vendor: "kimi",
      model: "kimi-k3",
      label: "Kimi K3",
      capabilities: ["chat", "vision", "toolCalling", "streaming"],
      defaultFor: [],
      enabled: true
    },
    {
      id: "deepseek-chat",
      vendor: "deepseek",
      model: "deepseek-v4-flash",
      label: "DeepSeek V4 Flash",
      capabilities: ["chat", "toolCalling", "streaming"],
      defaultFor: [],
      enabled: true
    },
    {
      id: "qwen-chat",
      vendor: "qwen",
      model: "qwen3.7-plus",
      label: "Qwen 3.7 Plus",
      capabilities: ["chat", "vision", "toolCalling", "streaming"],
      defaultFor: [],
      enabled: true
    },
    {
      id: "test-image",
      vendor: "openai",
      model: "gpt-image-2",
      label: "OpenAI Image",
      capabilities: ["image", "imageEdit"],
      defaultFor: ["image"],
      enabled: true
    },
    {
      id: "gemini-image",
      vendor: "gemini",
      model: "gemini-3.1-flash-image",
      label: "Gemini Image",
      capabilities: ["image", "imageEdit", "vision"],
      defaultFor: [],
      enabled: true
    }
  ],
  assistants: [
    {
      id: "test-assistant",
      name: "Strategy Partner",
      description: "Turns ambiguous goals into a focused strategy.",
      category: "通用效率",
      tags: ["战略", "拆解"],
      starterPrompts: ["帮我把一个模糊目标拆成行动计划", "评估这个方案的关键风险"],
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

const adminBootstrapFixture: AdminBootstrapPayload = {
  settings: publicBootstrapFixture.settings,
  menuItems: publicBootstrapFixture.menuItems,
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
  chatKnowledgeCsrfHeaders: string[];
  agentRequests: AgentRunPayload[];
  agentKnowledgeCsrfHeaders: string[];
  langflowRequests: Array<{ workflowId: string; payload: Record<string, unknown> }>;
  knowledgeRetrievalRequests: Array<KnowledgeRetrievalRequest & { query: string }>;
  generationRequests: Array<{
    moduleId: "image" | "ppt" | "mindmap" | "translate";
    payload: GenerationPayload;
  }>;
  setBootstrap: (payload: PublicBootstrapPayload) => void;
  setAdminBootstrap: (payload: AdminBootstrapPayload) => void;
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
      let adminStatus: AdminStatus = {
        authRequired: true,
        authenticated: false,
        adminConfigured: true
      };
      const requests: string[] = [];
      const unexpectedRequests: string[] = [];
      const chatRequests: ChatStreamPayload[] = [];
      const chatKnowledgeCsrfHeaders: string[] = [];
      const agentRequests: AgentRunPayload[] = [];
      const agentKnowledgeCsrfHeaders: string[] = [];
      const langflowRequests: ApiHarness["langflowRequests"] = [];
      const knowledgeRetrievalRequests: ApiHarness["knowledgeRetrievalRequests"] = [];
      let knowledgeSession: KnowledgeAuthResponse = { authenticated: false };
      let knowledgeBases = structuredClone(readyKnowledgeBases);
      let knowledgeRetrievalError: { code: string; message: string; status?: number } | null = null;
      const generationRequests: ApiHarness["generationRequests"] = [];

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
          await route.fulfill({ json: adminBootstrap });
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

        const generationMatch = pathname.match(/^\/api\/generate\/(image|ppt|mindmap|translate)$/);
        if (request.method() === "POST" && generationMatch) {
          const moduleId = generationMatch[1] as ApiHarness["generationRequests"][number]["moduleId"];
          const payload = request.postDataJSON() as GenerationPayload;
          generationRequests.push({ moduleId, payload });
          const requestedAssetCount = moduleId === "image"
            ? Math.max(1, Math.min(4, Math.trunc(Number(payload.options?.count) || 1)))
            : 0;
          const result: GenerationResult = {
            id: `e2e-${moduleId}-result`,
            module: moduleId,
            title: `Deterministic ${moduleId} result`,
            status: "completed",
            text: moduleId === "mindmap"
              ? "# Deterministic map\n## Branch one\n### Detail"
              : moduleId === "translate"
                ? "Deterministic translated result."
                : moduleId === "ppt"
                  ? "# Deterministic deck\n\n## Slide 1"
                  : undefined,
            assets: moduleId === "image"
              ? Array.from({ length: requestedAssetCount }, (_, index) => ({
                  type: "image" as const,
                  url: `/assets/figma/inspiration-01.jpg?asset=${index + 1}`,
                  label: `Generated image ${index + 1}`
                }))
              : undefined,
            createdAt: "2026-01-01T00:00:00.000Z"
          };
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
        chatKnowledgeCsrfHeaders,
        agentRequests,
        agentKnowledgeCsrfHeaders,
        langflowRequests,
        knowledgeRetrievalRequests,
        generationRequests,
        setBootstrap(nextPayload) {
          bootstrap = cloneBootstrap(nextPayload);
        },
        setAdminBootstrap(nextPayload) {
          adminBootstrap = structuredClone(nextPayload);
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
