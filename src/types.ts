export type ModuleId =
  | "chat"
  | "image"
  | "audio"
  | "video"
  | "ppt"
  | "apps"
  | "agents"
  | "knowledge"
  | "mindmap"
  | "gallery"
  | "assistants";

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
};

export type FeatureSettings = {
  chat: { enabledProviderIds: string[] };
  image: { enabledProviderIds: string[]; defaultModel?: string };
  audio: { enabledProviderIds: string[]; defaultModel?: string };
  video: { enabledProviderIds: string[]; defaultModel?: string };
  knowledge: { maxUploadMb: number; enabled: boolean };
};

export type ProviderKind = "openai" | "anthropic" | "gemini" | "openai-compatible";

export type ModelCapability =
  | "chat"
  | "vision"
  | "image"
  | "tts"
  | "stt"
  | "audio"
  | "video"
  | "embedding"
  | "fileSearch"
  | "toolCalling"
  | "streaming";

export type ProviderCapability = ModelCapability;

export type ModelDefaultFor = "chat" | "image" | "tts" | "stt" | "video" | "embedding";

export type ModelCatalogEntry = {
  id: string;
  vendor: ProviderKind;
  model: string;
  label: string;
  capabilities: ModelCapability[];
  defaultFor: ModelDefaultFor[];
  enabled: boolean;
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
  color: string;
  systemPrompt: string;
  createdAt: string;
  updatedAt: string;
};

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  model?: string;
  providerId?: string;
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
};

export type PublicBootstrapPayload = {
  settings: SiteSettings;
  menuItems: MenuItem[];
  modelCatalog: ModelCatalogEntry[];
  assistants: Assistant[];
  appPresets: AppPreset[];
  promptPresets: PromptPreset[];
  conversations: ConversationSummary[];
  toolSettings?: ToolSetting[];
};

export type AdminBootstrapPayload = {
  settings: SiteSettings;
  menuItems: MenuItem[];
  modelCatalog: ModelCatalogEntry[];
  assistants: Assistant[];
  appPresets: AppPreset[];
  promptPresets: PromptPreset[];
  toolSettings?: ToolSetting[];
};

export type AdminStatus = {
  authRequired: boolean;
  authenticated: boolean;
  adminConfigured: boolean;
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
    enabledModels: number;
    modelCatalog: number;
    assistants: number;
    apps: number;
    prompts: number;
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
  backups: AdminBackupItem[];
};

export type AuthStatus = AdminStatus;
export type BootstrapPayload = PublicBootstrapPayload;

export type UserConnectionConfig = {
  baseUrl: string;
  apiKey: string;
  lastModelId?: string;
};

export type UserProviderConfig = UserConnectionConfig;

export type ChatStreamPayload = {
  conversation?: ConversationSummary;
  history?: Message[];
  assistantId: string;
  connection: UserConnectionConfig;
  modelId: string;
  temperature: number;
  content: string;
  displayContent?: string;
  attachments?: ChatAttachment[];
};

export type GenerationModuleId =
  | "image"
  | "audio"
  | "video"
  | "agents"
  | "knowledge"
  | "ppt"
  | "mindmap";

export type GenerationPayload = {
  connection: UserConnectionConfig;
  modelId: string;
  prompt: string;
  assistantId?: string;
  context?: string;
  contextChunks?: KnowledgeChunk[];
  options?: {
    size?: string;
    voice?: string;
    endpointPath?: string;
    temperature?: number;
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
  connection: UserConnectionConfig;
  modelId: string;
  assistantId: string;
  prompt: string;
  allowedTools: string[];
  contextChunks?: KnowledgeChunk[];
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
