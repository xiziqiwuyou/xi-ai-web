export type ModuleId =
  | "home"
  | "chat"
  | "image"
  | "audio"
  | "video"
  | "ppt"
  | "apps"
  | "agents"
  | "workflows"
  | "skills"
  | "knowledge"
  | "mindmap"
  | "gallery"
  | "assistants"
  | "translate";

export type MenuItem = {
  id: ModuleId;
  label: string;
  enabled: boolean;
  visible: boolean;
  order: number;
};

export type SiteSettings = {
  siteName: string;
  theme: "rednote";
  allowGuestChat: boolean;
  defaultModule: ModuleId;
  upstreamBaseUrl: string;
};

export type LangflowStatus = {
  enabled: boolean;
  available: boolean;
  state: "ready" | "unavailable" | "disabled";
  reasonCode: "LANGFLOW_NOT_CONFIGURED" | "LANGFLOW_DISABLED" | null;
};

export type LangflowWorkflow = {
  id: string;
  name: string;
  description: string;
  welcomeMessage: string;
  inputPlaceholder: string;
  tags: string[];
  enabled: boolean;
  order: number;
};

export type AdminLangflowWorkflow = LangflowWorkflow & {
  flowId: string;
  createdAt: string;
  updatedAt: string;
};

export type FeatureSettings = {
  chat: { enabledProviderIds: string[] };
  image: { enabledProviderIds: string[]; defaultModel?: string };
  audio: { enabledProviderIds: string[]; defaultModel?: string };
  video: { enabledProviderIds: string[]; defaultModel?: string };
  knowledge: { maxUploadMb: number; enabled: boolean };
};

export type ProviderKind =
  | "openai"
  | "anthropic"
  | "gemini"
  | "kimi"
  | "deepseek"
  | "qwen"
  | "botcf"
  | "openai-compatible";

export type ModelCapability =
  | "chat"
  | "vision"
  | "image"
  | "imageEdit"
  | "tts"
  | "stt"
  | "audio"
  | "video"
  | "embedding"
  | "fileSearch"
  | "toolCalling"
  | "webSearch"
  | "urlContext"
  | "codeExecution";

export type ProviderCapability = ModelCapability;

export type ModelDefaultFor = "chat" | "image" | "tts" | "stt" | "video" | "embedding";

export type ModelEndpointProtocol =
  | "openai-chat"
  | "openai-responses"
  | "anthropic-messages"
  | "gemini-generate-content";

export type ModelVendorEntry = {
  id: string;
  label: string;
  adapter: ProviderKind;
  enabled: boolean;
  order: number;
};

export type ModelCatalogEntry = {
  id: string;
  order: number;
  vendorId: string;
  vendor: ProviderKind;
  vendorLabel: string;
  endpointProtocol: ModelEndpointProtocol;
  model: string;
  label: string;
  capabilities: ModelCapability[];
  defaultFor: ModelDefaultFor[];
  enabled: boolean;
  contextWindowTokens?: number;
  maxInputCharacters?: number;
  mediaConfig?: MediaEndpointConfig;
};

export type MediaEndpointConfig = {
  generatePath?: string;
  statusPath?: string;
  idJsonPath?: string;
  statusJsonPath?: string;
  assetJsonPath?: string;
  requestShape?: "openai-compatible" | "simple-json";
  pollIntervalSeconds?: number;
  maxPollAttempts?: number;
};

export type Assistant = {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  starterPrompts: string[];
  color: string;
  systemPrompt: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: ChatAttachment[];
  model?: string;
  providerId?: string;
  knowledgeCitations?: KnowledgeCitation[];
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  status?: "streaming" | "done" | "error" | "stopped";
  createdAt: string;
};

export type ChatAttachment = {
  id: string;
  kind: "image" | "text" | "audio";
  name: string;
  mimeType: string;
  size: number;
  dataUrl?: string;
  text?: string;
};

export type ConversationSummary = {
  id: string;
  title: string;
  assistantId: string;
  pinned: boolean;
  messageCount: number;
  preview: string;
  createdAt: string;
  updatedAt: string;
};

export type Conversation = ConversationSummary & {
  messages: Message[];
  titleSummaryAt?: string;
};

export type PublicBootstrapPayload = {
  settings: SiteSettings;
  menuItems: MenuItem[];
  modelCatalog: ModelCatalogEntry[];
  assistants: Assistant[];
  appPresets: AppPreset[];
  promptPresets: PromptPreset[];
  langflow: LangflowStatus;
  langflowWorkflows: LangflowWorkflow[];
  conversations: ConversationSummary[];
  toolSettings?: ToolSetting[];
};

export type AdminBootstrapPayload = {
  settings: SiteSettings;
  menuItems: MenuItem[];
  modelVendors: ModelVendorEntry[];
  modelCatalog: ModelCatalogEntry[];
  assistants: Assistant[];
  appPresets: AppPreset[];
  promptPresets: PromptPreset[];
  langflow: LangflowStatus;
  langflowWorkflows: AdminLangflowWorkflow[];
  toolSettings?: ToolSetting[];
};

export type AdminStatus = {
  authRequired: boolean;
  authenticated: boolean;
  adminConfigured: boolean;
};

export type KnowledgeRegistrationMode = "disabled" | "invite_only" | "open";

export type KnowledgeAccount = {
  id: string;
  username: string;
  status: "active" | "frozen" | "deleting";
  quotaBytes?: number;
  usedBytes?: number;
  reservedBytes?: number;
  createdAt?: string;
  lastLoginAt?: string | null;
};

export type KnowledgePublicConfig = {
  requestId?: string;
  registrationMode: KnowledgeRegistrationMode;
  accountRules: {
    usernameMinLength: number;
    usernameMaxLength: number;
    passwordMinLength: number;
    passwordMaxLength: number;
  };
  recoveryCodeShownOnce: boolean;
};

export type KnowledgeAuthResponse = {
  requestId?: string;
  authenticated?: boolean;
  account?: KnowledgeAccount;
  csrfToken?: string;
  expiresAt?: string;
  recoveryCode?: string;
};

export type KnowledgeEmbeddingProfile = {
  id: string;
  vendor: "openai" | "qwen";
  label?: string;
  actualModel: string;
  dimensions: number;
  fingerprint: string;
  defaultBaseUrl: string;
  protocol: "openai-embeddings" | "qwen-openai-compatible-embeddings";
  maxBatchInputs: number;
  maxInputTokens: number;
  bytesPerComponent: 2 | 4;
  storageType: "vector" | "halfvec";
};

export type KnowledgeEmbeddingProfileSnapshot = Pick<
  KnowledgeEmbeddingProfile,
  "id" | "vendor" | "actualModel" | "dimensions" | "fingerprint"
>;

export type KnowledgeEmbeddingProgress = {
  totalChunks: number;
  readyChunks: number;
  pendingChunks: number;
  leasedChunks: number;
  failedChunks: number;
  lastErrorCode: string | null;
};

export type KnowledgeEmbeddingConnection = {
  vendor: "openai" | "qwen";
  baseUrl?: string;
  apiKey: string;
};

export type KnowledgeCitation = {
  id: string;
  knowledgeBaseId: string;
  knowledgeBaseName: string;
  documentId: string;
  documentName: string;
  chunkId: string;
  chunkOrdinal: number;
  locator: Record<string, unknown>;
  score: number;
  mode: "vector";
  source: {
    method: "GET";
    openPath: string;
    downloadPath: string;
  };
};

export type KnowledgeRetrievalRequest = {
  knowledgeBaseIds: string[];
  embeddingConnections?: Partial<
    Record<KnowledgeEmbeddingConnection["vendor"], Pick<KnowledgeEmbeddingConnection, "apiKey">>
  >;
  topK?: number;
};

export type KnowledgeSourceResponse = {
  source: {
    url: string;
    expiresAt: string;
    expiresInSeconds: number;
    disposition: "inline" | "attachment";
    knowledgeBaseId: string;
    knowledgeBaseName: string;
    documentId: string;
    documentName: string;
    chunkId: string;
    locator: Record<string, unknown>;
  };
  requestId?: string;
};

export type KnowledgeRetrievalResult = {
  mode: "vector";
  knowledgeBaseIds: string[];
  topK: number;
  maxTopK: number;
  queryBytes: number;
  context: string;
  contextBytes: number;
  contextTruncated: boolean;
  chunks: Array<{
    citationId: string;
    knowledgeBaseId: string;
    documentId: string;
    chunkId: string;
    ordinal: number;
    text: string;
    score: number;
    mode: "vector";
  }>;
  citations: KnowledgeCitation[];
  requestId?: string;
};

export type KnowledgeEmbeddingBatchResult = {
  done: boolean;
  batch: {
    id: string;
    status: "completed";
    chunkCount: number;
    vectorBytes: string;
    completedAt: string | null;
    idempotent: boolean;
  } | null;
  progress: KnowledgeEmbeddingProgress;
  indexProgress?: KnowledgeEmbeddingProgress;
  cutover?: boolean;
  cleanedIndexVersion?: number | null;
  providerCall: boolean;
  requestId?: string;
};

export type KnowledgeReindexResult = {
  accepted: true;
  reindex: {
    knowledgeBaseId: string;
    sourceIndexVersion: number;
    pendingIndexVersion: number;
    embeddingProfileId: string;
    totalChunks: number;
    reservedBytes: string;
    cutover: boolean;
  };
  requestId?: string;
};

export type KnowledgeBase = {
  id: string;
  name: string;
  description: string;
  status: "active" | "archived" | "deleting";
  embeddingProfile: KnowledgeEmbeddingProfileSnapshot | null;
  chunkVersion: number;
  activeIndexVersion: number | null;
  pendingIndexVersion: number | null;
  version: number;
  documentCount: number;
  readyDocumentCount: number;
  logicalBytes: string;
  embeddingProgress: KnowledgeEmbeddingProgress;
  createdAt: string | null;
  updatedAt: string | null;
  archivedAt: string | null;
};

export type KnowledgeCloudDocumentStatus =
  | "pending_upload"
  | "uploaded"
  | "parsing"
  | "awaiting_embedding"
  | "embedding"
  | "ready"
  | "needs_ocr"
  | "failed"
  | "deleting";

export type KnowledgeCloudDocument = {
  id: string;
  knowledgeBaseId: string;
  displayName: string;
  declaredMimeType: string;
  verifiedMimeType: string | null;
  declaredBytes: string | null;
  verifiedBytes: string | null;
  declaredChecksumSha256: string | null;
  checksumSha256: string | null;
  objectVersionId: string | null;
  objectEtag: string | null;
  uploadExpiresAt: string | null;
  status: KnowledgeCloudDocumentStatus;
  parserVersion: string | null;
  errorCode: string | null;
  version: number;
  createdAt: string | null;
  updatedAt: string | null;
};

export type KnowledgeUploadGrant = {
  provider: "tencent-cos";
  bucket: string;
  region: string;
  objectKey: string;
  uploadUrl: string;
  startTime: number;
  expiredTime: number;
  expiresAt: string;
  credentials: {
    tmpSecretId: string;
    tmpSecretKey: string;
    sessionToken: string;
  };
  constraints: {
    contentLength: number;
    contentType: string;
  };
  requiredHeaders: Record<string, string>;
};

export type KnowledgeCleanupJob = {
  id: string;
  accountId: string;
  knowledgeBaseId: string | null;
  documentId: string | null;
  kind: "parse" | "cleanup" | "reconcile" | "reindex";
  status: "queued" | "running" | "retry" | "succeeded" | "failed" | "cancelled";
  dedupeKey: string | null;
  runAfter: string | null;
};

export type KnowledgeAdminLimits = {
  defaultQuotaBytes: number;
  maxKnowledgeBasesPerAccount: number;
  maxDocumentsPerAccount: number;
  maxDocumentsPerKnowledgeBase: number;
  maxFileBytes: number;
  maxChunksPerAccount: number;
  maxConcurrentUploadsPerAccount: number;
  maxConcurrentIngestionsPerAccount: number;
  maxConcurrentEmbeddingsPerAccount: number;
  retrievalRequestsPerMinutePerAccount: number;
  maxRetrievalTopK: number;
};

export type KnowledgeAdminSettings = {
  version: number;
  registrationMode: KnowledgeRegistrationMode;
  limits: KnowledgeAdminLimits;
  updatedBy: string;
  updatedAt: string | null;
};

export type KnowledgeAdminEffectiveLimits = {
  quotaBytes: number;
  maxKnowledgeBasesPerAccount: number;
  maxDocumentsPerAccount: number;
  maxDocumentsPerKnowledgeBase: number;
  maxFileBytes: number;
  maxChunksPerAccount: number;
  maxConcurrentUploadsPerAccount: number;
  maxConcurrentIngestionsPerAccount: number;
  maxConcurrentEmbeddingsPerAccount: number;
  retrievalRequestsPerMinutePerAccount: number;
  maxRetrievalTopK: number;
};

export type KnowledgeAdminAccount = {
  id: string;
  username: string;
  status: "active" | "frozen" | "deleting";
  version: number;
  quotaBytes: string;
  usedBytes: string;
  reservedBytes: string;
  activeSessionCount: number;
  knowledgeBaseCount: number;
  documentCount: number;
  chunkCount: number;
  failedLoginCount: number;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  limitOverrides: Partial<KnowledgeAdminEffectiveLimits>;
  effectiveLimits: KnowledgeAdminEffectiveLimits;
  overLimit: string[];
};

export type KnowledgeAdminAccountDeletionResult = {
  accepted: true;
  accountId: string;
  status: "deleting";
  version: number;
  knowledgeBasesMarked: number;
  documentsMarked: number;
  job: KnowledgeAdminJob | null;
  requestId?: string;
};

export type KnowledgeAdminOverview = {
  accounts: { total: number; active: number; frozen: number };
  activeSessions: number;
  knowledgeBases: number;
  documents: number;
  chunks: number;
  jobs: { queued: number; running: number; failed: number };
  storage: { quotaBytes: string; usedBytes: string; reservedBytes: string };
  registrationMode: KnowledgeRegistrationMode;
  objectStore: { state: "configured" | "not_checked" };
};

export type KnowledgeAdminReadiness = {
  generatedAt: string;
  status: "ready" | "degraded" | "maintenance_required" | "unavailable";
  checks: {
    database: "ok" | "unknown";
    migrations: "ok" | "unknown";
    vectorExtension: "ok" | "unknown";
    objectStore: "configured" | "not_checked";
  };
  runtime: {
    enabled: boolean;
    available: boolean;
    schemaVersion: number | null;
    vectorVersion: string | null;
    worker: {
      concurrency: number | null;
      leaseSeconds: number | null;
    };
    objectStore: { state: "configured" | "not_checked" };
  };
  metrics: {
    accounts: {
      total: number;
      active: number;
      frozen: number;
      deleting: number;
      locked: number;
      overQuota: number;
      failedLoginCount: number;
    };
    auth: {
      activeSessions: number;
      expiredSessions: number;
      activeInvites: number;
      expiredInvites: number;
      activeAdminResets: number;
      expiredAdminResets: number;
    };
    storage: {
      quotaBytes: string;
      usedBytes: string;
      reservedBytes: string;
      staleReservationCount: number;
      staleReservationBytes: string;
      expiredPendingUploads: number;
    };
    queue: {
      queued: number;
      running: number;
      retry: number;
      failed: number;
      cancelled: number;
      oldestReadyAgeSeconds: number;
    };
    vectors: {
      incompleteChunks: number;
      leasedChunks: number;
      failedChunks: number;
    };
    cleanup: {
      deletingAccounts: number;
      deletingKnowledgeBases: number;
      deletingDocuments: number;
    };
  };
  requestId?: string;
};

export type KnowledgeAdminMaintenanceResult = {
  expiredUploads: { inspected: number; cleaned: number; failed: number };
  expiredReservations: { inspected: number; released: number };
  expiredSessions: number;
  expiredAdminResets: number;
  expiredInvites: number;
  finalizedAccountIds: string[];
  requestId?: string;
};

export type KnowledgeAdminReconcileResult = {
  queuedJobs: number;
  jobs: KnowledgeAdminJob[];
  requestId?: string;
};

export type KnowledgeAdminInvite = {
  id: string;
  status: "active" | "consumed" | "revoked" | "expired";
  initialLimitOverrides: Partial<KnowledgeAdminEffectiveLimits>;
  expiresAt: string | null;
  consumedByAccountId: string | null;
  consumedAt: string | null;
  revokedAt: string | null;
  createdBy: string;
  createdAt: string | null;
};

export type KnowledgeAdminJob = {
  id: string;
  accountId: string;
  knowledgeBaseId: string | null;
  documentId: string | null;
  kind: "parse" | "cleanup" | "reconcile" | "reindex";
  status: "queued" | "running" | "retry" | "succeeded" | "failed" | "cancelled";
  attempts: number;
  maxAttempts: number;
  progressCurrent: number;
  progressTotal: number;
  errorCode: string | null;
  leaseActive: boolean;
  runAfter: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type KnowledgeAdminAuditEntry = {
  id: string;
  requestId: string;
  adminActor: string;
  operation: string;
  targetType: string;
  targetId: string | null;
  reason: string;
  result: "succeeded" | "failed";
  metadata: Record<string, unknown>;
  createdAt: string | null;
};

export type KnowledgeAdminPage<T> = {
  items: T[];
  nextCursor: string | null;
  requestId?: string;
};

export type AdminAuditEntry = {
  id: string;
  action: string;
  details: Record<string, unknown>;
  createdAt: string;
};

export type AdminBackupItem = {
  name: string;
  size: number;
  createdAt: string;
  modifiedAt: string;
};

export type AdminOpsPayload = {
  runtime: {
    version: string;
    node: string;
    mode: "development" | "production";
    uptimeSeconds: number;
    dataDir: string;
    metadataFile: string;
  };
  counts: {
    menus: number;
    visibleMenus: number;
    modelVendors: number;
    enabledModels: number;
    modelCatalog: number;
    assistants: number;
    apps: number;
    prompts: number;
    workflows: number;
    tools: number;
    backups: number;
    auditRecords: number;
  };
  checklist: Array<{
    id: string;
    label: string;
    ok: boolean;
    detail: string;
  }>;
  modelCoverage: Array<{
    moduleId: ModuleId;
    label: string;
    required: ModelCapability[];
    covered: boolean;
    missing: ModelCapability[];
  }>;
  modelInvocations: Array<{
    modelId: string;
    displayName: string;
    requestModel: string;
    vendor: string;
    calls: number;
    successCalls: number;
    errorCalls: number;
    cancelledCalls: number;
    averageDurationMs: number;
    totalDurationMs: number;
    lastCalledAt: string;
  }>;
  backups: AdminBackupItem[];
};

export type AuthStatus = AdminStatus;
export type BootstrapPayload = PublicBootstrapPayload;

export type UserConnectionConfig = {
  baseUrl?: string;
  apiKey: string;
  lastModelId?: string;
};

export type UserProviderConfig = UserConnectionConfig;

export type SearchProviderKind = "glm" | "kimi";

export type SearchEngine = "search_std" | "search_pro" | "search_pro_sogou" | "search_pro_quark";

export type SearchServiceConfig = {
  provider: SearchProviderKind;
  baseUrl?: string;
  apiKey: string;
  model: string;
  searchEngine: SearchEngine;
  count: number;
  contentSize: "medium" | "high";
};

export type ReasoningEffort = "default" | "off" | "low" | "medium" | "high" | "xhigh";

export type ToolInvocationMode = "prompt" | "function";

export type OpenAIResponseVerbosity = "default" | "low" | "medium" | "high";

export type ChatStreamPayload = {
  conversation?: ConversationSummary;
  history?: Message[];
  assistantId: string;
  connection: UserConnectionConfig;
  modelId: string;
  temperature: number;
  topP?: number;
  reasoningEffort?: ReasoningEffort;
  toolInvocationMode?: ToolInvocationMode;
  responseVerbosity?: OpenAIResponseVerbosity;
  includeUsage?: boolean;
  maxTokens?: number;
  content: string;
  displayContent?: string;
  attachments?: ChatAttachment[];
  skillInstructions?: string[];
  allowedTools?: string[];
  searchService?: SearchServiceConfig;
  knowledgeBaseIds?: KnowledgeRetrievalRequest["knowledgeBaseIds"];
  embeddingConnections?: KnowledgeRetrievalRequest["embeddingConnections"];
};

export type ChatTitlePayload = {
  connection: UserConnectionConfig;
  modelId: string;
  history: Message[];
};

export type ChatTitleResult = {
  title: string;
};

export type GenerationModuleId =
  | "image"
  | "audio"
  | "video"
  | "agents"
  | "knowledge"
  | "ppt"
  | "mindmap"
  | "translate";

export type ImageGenerationMode = "generate" | "edit";

export type ImageAspectRatio = "1:1" | "3:2" | "2:3" | "16:9" | "9:16";

export type ImageResolution = "512px" | "1K" | "2K" | "4K";

export type ImageOutputFormat = "png" | "jpeg" | "webp";

export type ImageBackground = "auto" | "opaque" | "transparent";

export type ImageInputPayload = {
  dataUrl: string;
  name?: string;
  mimeType?: string;
};

export type GenerationPayload = {
  connection: UserConnectionConfig;
  modelId: string;
  prompt: string;
  assistantId?: string;
  context?: string;
  contextChunks?: KnowledgeChunk[];
  options?: {
    size?: string;
    count?: number;
    mode?: ImageGenerationMode;
    aspectRatio?: ImageAspectRatio;
    imageSize?: ImageResolution;
    inputImage?: ImageInputPayload;
    inputImages?: ImageInputPayload[];
    referenceImageUrls?: string[];
    maskImage?: ImageInputPayload;
    outputFormat?: ImageOutputFormat;
    outputCompression?: number;
    background?: ImageBackground;
    voice?: string;
    endpointPath?: string;
    temperature?: number;
    topP?: number;
    maxTokens?: number;
    embeddingModelId?: string;
    topK?: number;
    negativePrompt?: string;
    stylePreset?: string;
    quality?: string;
    duration?: string;
    cameraMotion?: string;
  };
};

export type KnowledgeChunk = {
  id: string;
  documentId?: string;
  documentName?: string;
  index: number;
  text: string;
  score?: number;
};

export type KnowledgeDocument = {
  id: string;
  name: string;
  type: string;
  size: number;
  text: string;
  chunks: KnowledgeChunk[];
  tags?: string[];
  indexedAt?: string;
  embeddingModelId?: string;
  createdAt: string;
  updatedAt: string;
};

export type GenerationResult = {
  id: string;
  module: GenerationModuleId;
  title: string;
  status: "completed" | "submitted" | "failed";
  text?: string;
  assets?: Array<{
    type: "image" | "audio" | "video" | "link";
    url: string;
    label?: string;
  }>;
  raw?: unknown;
  createdAt: string;
};

export type GalleryItem = GenerationResult & {
  sourceModule: ModuleId;
  prompt: string;
  modelId: string;
  favorite?: boolean;
  tags?: string[];
};

export type ImageGenerationTimingRecord = {
  id: string;
  modelId: string;
  mode: ImageGenerationMode;
  resolution: ImageResolution;
  aspectRatio: ImageAspectRatio;
  count: number;
  status: "completed" | "failed" | "cancelled";
  startedAt: string;
  completedAt: string;
  updatedAt?: string;
  durationMs: number;
};

export type MediaJobStatus = "submitted" | "processing" | "completed" | "failed";

export type MediaJob = {
  id: string;
  module: "video" | "audio";
  modelId: string;
  endpointPath: string;
  providerJobId?: string;
  status: MediaJobStatus;
  prompt: string;
  result?: GenerationResult;
  failureReason?: string;
  pollAttempts?: number;
  autoPoll?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type UserAgentDefinition = {
  id: string;
  name: string;
  description?: string;
  category?: string;
  tags?: string[];
  systemPrompt: string;
  modelId?: string;
  requiredCapabilities: ModelCapability[];
  skillIds: string[];
  allowedTools: string[];
  knowledgeDocumentIds: string[];
  knowledgeBaseIds?: string[];
  createdAt: string;
  updatedAt: string;
};

export type AgentSkillDefinition = {
  id: string;
  name: string;
  description?: string;
  instructions: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  allowedTools: string[];
  requiredCapabilities: ModelCapability[];
  createdAt: string;
  updatedAt: string;
};

export type AgentMemoryRecord = {
  id: string;
  agentId: string;
  scope: "agent" | "conversation" | "workspace";
  conversationId?: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

export type AgentWorkflowStep = {
  id: string;
  name: string;
  instruction: string;
  agentId?: string;
  skillIds: string[];
  usePreviousOutput: boolean;
};

export type AgentWorkflowNodeKind =
  | "start"
  | "agent"
  | "template"
  | "knowledge"
  | "reply"
  | "model"
  | "conditional"
  | "structured"
  | "webSearch"
  | "textSplit"
  | "merge"
  | "transform"
  | "approval"
  | "loop"
  | "unsupported";

export type AgentWorkflowConfigValue = string | number | boolean | string[];

export type AgentWorkflowNodeConfig = Record<string, AgentWorkflowConfigValue>;

export type AgentWorkflowNode = {
  id: string;
  kind: AgentWorkflowNodeKind;
  componentId?: string;
  componentVersion?: number;
  name: string;
  position: {
    x: number;
    y: number;
  };
  instruction?: string;
  agentId?: string;
  skillIds?: string[];
  template?: string;
  knowledgeDocumentIds?: string[];
  knowledgeBaseIds?: string[];
  maxKnowledgeChunks?: number;
  config?: AgentWorkflowNodeConfig;
};

export type AgentWorkflowEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
};

export type AgentWorkflowViewport = {
  x: number;
  y: number;
  zoom: number;
};

export type AgentWorkflowGraph = {
  version: 1;
  nodes: AgentWorkflowNode[];
  edges: AgentWorkflowEdge[];
  viewport?: AgentWorkflowViewport;
};

export type AgentWorkflowProvenance = {
  kind: "langflow" | "starter-template";
  sourceId?: string;
  sourceName?: string;
  importedAt?: string;
  license?: "MIT";
  unsupportedComponents?: string[];
};

export type AgentWorkflowDefinition = {
  id: string;
  name: string;
  description?: string;
  steps: AgentWorkflowStep[];
  graph?: AgentWorkflowGraph;
  provenance?: AgentWorkflowProvenance;
  createdAt: string;
  updatedAt: string;
};

export type WorkspacePreferenceRecord = {
  key: "theme";
  value: "dark" | "light";
  updatedAt: string;
};

export type WorkspaceBackupRunStatus = "running" | "completed" | "failed";

export type WorkspaceBackupRun = {
  id: string;
  providerId: string;
  status: WorkspaceBackupRunStatus;
  startedAt: string;
  completedAt?: string;
  error?: string;
  byteLength?: number;
};

export type WorkspaceBackupPolicy = {
  enabled: boolean;
  providerId: string;
  intervalMinutes: number;
  retentionCount: number;
  lastRun?: WorkspaceBackupRun;
};

export type WorkspaceSnapshot = {
  conversations: Conversation[];
  galleryItems: GalleryItem[];
  imageGenerationHistory: ImageGenerationTimingRecord[];
  knowledgeDocuments: KnowledgeDocument[];
  mediaJobs: MediaJob[];
  userAgents: UserAgentDefinition[];
  agentSkills: AgentSkillDefinition[];
  workflows: AgentWorkflowDefinition[];
  agentMemories: AgentMemoryRecord[];
  preferences: WorkspacePreferenceRecord[];
  backupRuns: WorkspaceBackupRun[];
};

export type WorkspaceDataCounts = {
  [Key in keyof WorkspaceSnapshot]: number;
};

export type WorkspaceExportEnvelope = {
  schema: "xi-ai-web.workspace-export";
  version: 1;
  exportedAt: string;
  app: {
    name: "xi-ai-web";
    version: string;
  };
  integrity: {
    algorithm: "SHA-256";
    digest: string;
  };
  counts: WorkspaceDataCounts;
  workspace: WorkspaceSnapshot;
};

export type AppPreset = {
  id: string;
  name: string;
  description: string;
  category: string;
  prompt: string;
  enabled: boolean;
};

export type PromptPreset = {
  id: string;
  moduleId: ModuleId;
  title: string;
  prompt: string;
  enabled: boolean;
};

export type ToolSetting = {
  name: string;
  label: string;
  description: string;
  enabled: boolean;
  riskLevel: "low" | "medium" | "high";
  execution?: "local" | "provider" | "search";
  requiredCapability?: ModelCapability;
  supportedVendors?: ProviderKind[];
  requiresContext?: boolean;
};

export type AgentTraceEvent = {
  id: string;
  toolName: string;
  label: string;
  argumentsPreview: string;
  resultPreview: string;
  status: "completed" | "failed";
  createdAt: string;
};

export type AgentRunPayload = {
  moduleId?: "agents" | "workflows";
  connection: UserConnectionConfig;
  modelId: string;
  assistantId?: string;
  agent?: {
    id?: string;
    name: string;
    systemPrompt: string;
    skillInstructions: string[];
  };
  prompt: string;
  allowedTools: string[];
  searchService?: SearchServiceConfig;
  contextChunks?: KnowledgeChunk[];
  knowledgeBaseIds?: KnowledgeRetrievalRequest["knowledgeBaseIds"];
  embeddingConnections?: KnowledgeRetrievalRequest["embeddingConnections"];
  options?: {
    temperature?: number;
  };
};

export type AudioTranscriptionResult = {
  text: string;
  raw?: unknown;
};

export type ChatStreamEvent =
  | {
      type: "meta";
      conversation: ConversationSummary;
      userMessage: Message;
      assistantMessageId: string;
    }
  | { type: "token"; token: string }
  | { type: "error"; error: string }
  | { type: "done"; conversation: ConversationSummary; message: Message };

export type LangflowStreamEvent =
  | { type: "meta"; sessionId: string; workflow: LangflowWorkflow; requestId: string }
  | { type: "token"; token: string }
  | { type: "error"; error: string }
  | { type: "done"; sessionId: string; text: string; finished: boolean };
