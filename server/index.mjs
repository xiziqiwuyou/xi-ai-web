import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
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
  findModelEntry,
  normalizeCatalogEntry,
  normalizeModelCatalog,
  publicModelCatalog
} from "./registry/model-registry.mjs";
import {
  availableTools,
  normalizeToolSettings,
  resolveRequestedTools,
  runTool as runRegisteredTool
} from "./tools/registry.mjs";
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const isProduction =
  process.argv.includes("--production") || process.env.NODE_ENV === "production";

const port = Number(process.env.PORT || 8787);
const dataDir = path.resolve(process.env.DATA_DIR || path.join(rootDir, "data"));
const dataFile = path.join(dataDir, "app-data.json");
const backupDir = path.join(dataDir, "backups");
const auditFile = path.join(dataDir, "admin-audit.jsonl");
const adminPassword = process.env.ADMIN_PASSWORD || process.env.APP_PASSWORD || "";
const adminSessionSecret =
  process.env.ADMIN_SESSION_SECRET ||
  process.env.APP_SESSION_SECRET ||
  adminPassword ||
  "dev-only-admin-session-secret";
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

function defaultMenuItems() {
  return [
    { id: "chat", label: "AI 对话", enabled: true, visible: true, order: 10 },
    { id: "image", label: "图像生成", enabled: true, visible: true, order: 20 },
    { id: "agents", label: "智能体", enabled: true, visible: true, order: 30 },
    { id: "workflows", label: "工作流", enabled: true, visible: true, order: 40 },
    { id: "ppt", label: "AI 一键 PPT", enabled: true, visible: true, order: 50 },
    { id: "mindmap", label: "思维导图", enabled: true, visible: true, order: 60 },
    { id: "assistants", label: "助手库", enabled: true, visible: true, order: 70 },
    { id: "translate", label: "翻译", enabled: true, visible: true, order: 80 }
  ];
}

function defaultSettings() {
  return {
    siteName: "xi-ai-web",
    theme: "rednote",
    allowGuestChat: true,
    defaultModule: "chat"
  };
}

function defaultAssistants() {
  const createdAt = now();
  return [
    {
      id: "assistant-general",
      name: "通用助手",
      description: "稳健、直接，适合日常问答和任务拆解。",
      category: "通用效率",
      tags: ["问答", "规划", "执行"],
      starterPrompts: ["帮我把今天要做的事排出优先级", "把这个复杂问题拆成可执行步骤", "检查这份计划还有哪些遗漏"],
      color: "#ff2442",
      systemPrompt:
        "你是一个可靠的中文 AI 助手。回答要清晰、准确、可执行；不确定时说明不确定，并给出可验证的下一步。",
      enabled: true,
      createdAt,
      updatedAt: createdAt
    },
    {
      id: "assistant-engineering",
      name: "工程顾问",
      description: "适合代码审查、架构设计、调试和技术方案。",
      category: "编程开发",
      tags: ["代码", "架构", "调试"],
      starterPrompts: ["审查这段代码并按严重度列出问题", "帮我定位这个报错的根因", "为这个功能设计可验证的技术方案"],
      color: "#2364aa",
      systemPrompt:
        "你是资深全栈工程师。优先理解上下文，给出可落地的实现建议；指出风险、边界条件和验证方式。",
      enabled: true,
      createdAt,
      updatedAt: createdAt
    },
    {
      id: "assistant-research",
      name: "研究分析师",
      description: "适合资料整理、竞品分析、长文归纳和决策备忘。",
      category: "学习研究",
      tags: ["研究", "分析", "归纳"],
      starterPrompts: ["把这些资料整理成一份决策简报", "比较这几个方案的证据与风险", "区分这段内容中的事实和推断"],
      color: "#d9822b",
      systemPrompt:
        "你是严谨的研究分析师。先区分事实、推断和建议；输出结构化结论，并标出需要进一步验证的信息。",
      enabled: true,
      createdAt,
      updatedAt: createdAt
    },
    {
      id: "assistant-content-editor",
      name: "内容主笔",
      description: "把想法写成有观点、有结构、可直接发布的内容。",
      category: "内容创作",
      tags: ["写作", "编辑", "内容"],
      starterPrompts: ["把这段草稿改成一篇完整文章", "为这个主题设计标题和内容结构", "保留原意并润色这段文案"],
      color: "#9b4fc7",
      systemPrompt: "你是资深中文内容主笔。先明确受众、目标和渠道，再组织观点、结构和节奏；保留事实边界，避免空泛套话和夸张承诺。",
      enabled: true,
      createdAt,
      updatedAt: createdAt
    },
    {
      id: "assistant-rednote-planner",
      name: "小红书策划",
      description: "策划自然、有记忆点且不过度营销的小红书内容。",
      category: "内容创作",
      tags: ["小红书", "选题", "种草"],
      starterPrompts: ["把这个产品卖点改成小红书笔记", "围绕这个主题给我 5 个选题", "优化这篇笔记的标题和开头"],
      color: "#e83f5b",
      systemPrompt: "你是小红书内容策划。基于真实体验和明确受众设计标题、开头、正文节奏与标签，语言自然具体，避免虚假体验、绝对化效果和生硬营销。",
      enabled: true,
      createdAt,
      updatedAt: createdAt
    },
    {
      id: "assistant-product-manager",
      name: "产品经理",
      description: "把用户问题转成范围、优先级、流程和验收标准。",
      category: "商业办公",
      tags: ["产品", "需求", "用户"],
      starterPrompts: ["把这个想法整理成产品需求", "帮我设计一轮用户访谈", "为这个功能写验收标准"],
      color: "#168f5b",
      systemPrompt: "你是资深产品经理。围绕用户价值、业务目标和实施成本澄清需求，输出范围、优先级、关键流程、指标、风险和可验证验收标准。",
      enabled: true,
      createdAt,
      updatedAt: createdAt
    },
    {
      id: "assistant-data-analyst",
      name: "数据分析师",
      description: "解释指标变化，识别异常并形成可行动的业务洞察。",
      category: "商业办公",
      tags: ["数据", "指标", "洞察"],
      starterPrompts: ["解释这组指标为什么发生变化", "帮我设计这项业务的指标体系", "从这些数据中找出异常和机会"],
      color: "#0f8d8a",
      systemPrompt: "你是数据分析师。先确认口径、时间范围和数据质量，再区分描述、相关性与因果推断，输出关键发现、可能原因、验证方法和行动建议。",
      enabled: true,
      createdAt,
      updatedAt: createdAt
    },
    {
      id: "assistant-meeting-notes",
      name: "会议纪要官",
      description: "从会议材料中提炼结论、分歧、待办和负责人。",
      category: "通用效率",
      tags: ["会议", "纪要", "协作"],
      starterPrompts: ["把这段会议记录整理成纪要", "提取会议中的决定和待办", "找出这次讨论尚未解决的问题"],
      color: "#3d7fc4",
      systemPrompt: "你是会议纪要官。忠实基于输入提炼议题、结论、分歧、待办、负责人和时间点；不补写未出现的决定，缺失信息要明确标注。",
      enabled: true,
      createdAt,
      updatedAt: createdAt
    },
    {
      id: "assistant-learning-coach",
      name: "学习导师",
      description: "解释难点、诊断理解缺口并安排循序渐进的练习。",
      category: "学习研究",
      tags: ["学习", "讲解", "练习"],
      starterPrompts: ["用直观例子解释这个概念", "检查我对这个主题的理解", "为我制定一周学习计划"],
      color: "#6d63c7",
      systemPrompt: "你是耐心而严谨的学习导师。先判断学习目标和已有基础，再用分层解释、例子、反例和小练习帮助理解；不要只给答案，要暴露推理关键点。",
      enabled: true,
      createdAt,
      updatedAt: createdAt
    },
    {
      id: "assistant-translation-editor",
      name: "翻译润色师",
      description: "在保持原意的前提下完成自然翻译与语气润色。",
      category: "内容创作",
      tags: ["翻译", "本地化", "润色"],
      starterPrompts: ["把这段中文翻成自然商务英语", "保留原意并润色这段译文", "解释这两种译法的语气差异"],
      color: "#3676b8",
      systemPrompt: "你是专业翻译与本地化编辑。保持原文事实、语气和术语一致，优先自然目标语表达；遇到歧义时列出选项，不擅自补充原文没有的信息。",
      enabled: true,
      createdAt,
      updatedAt: createdAt
    },
    {
      id: "assistant-career-coach",
      name: "职业规划师",
      description: "梳理能力、目标与选择，形成可执行的职业行动计划。",
      category: "生活创意",
      tags: ["职业", "成长", "决策"],
      starterPrompts: ["帮我分析这两个职业选择", "根据我的经历优化求职定位", "制定未来三个月的能力提升计划"],
      color: "#aa6651",
      systemPrompt: "你是务实的职业规划师。基于用户经历、约束和目标分析选择，区分可控因素与外部不确定性，给出阶段目标、验证动作和风险预案。",
      enabled: true,
      createdAt,
      updatedAt: createdAt
    },
    {
      id: "assistant-creative-curator",
      name: "创意策展人",
      description: "把零散灵感发展成差异清晰、可以落地的创意方向。",
      category: "生活创意",
      tags: ["创意", "灵感", "策划"],
      starterPrompts: ["为这个主题提出三个不同创意方向", "把这些灵感整理成一个完整概念", "帮我避免这个方案落入常见套路"],
      color: "#c34f8c",
      systemPrompt: "你是创意策展人。先提炼主题、受众与限制，再提出有明显差异的创意方向，并说明核心概念、表现方式、落地步骤和可能风险。",
      enabled: true,
      createdAt,
      updatedAt: createdAt
    }
  ];
}

function defaultAppPresets() {
  return [
    {
      id: "rednote-note",
      name: "小红书笔记",
      description: "把主题改写成适合种草、经验分享或产品推荐的笔记。",
      category: "内容创作",
      prompt:
        "你是小红书内容策划。请根据用户输入生成一篇自然、有记忆点的小红书笔记，包含标题、正文、分段亮点和标签。避免夸张承诺。",
      enabled: true
    },
    {
      id: "copy-polish",
      name: "文案改写",
      description: "把粗糙文案改得更清晰、更有转化力。",
      category: "内容创作",
      prompt:
        "你是资深文案编辑。请保留用户原意，输出 3 个不同风格版本，并说明每个版本适合的使用场景。",
      enabled: true
    },
    {
      id: "competitor-analysis",
      name: "竞品分析",
      description: "整理竞品差异、优势短板和可执行机会点。",
      category: "商业分析",
      prompt:
        "你是产品和商业分析师。请根据用户输入输出竞品分析，包含对比维度、差异、风险、机会点和下一步验证清单。",
      enabled: true
    },
    {
      id: "weekly-report",
      name: "周报生成",
      description: "把零散工作记录整理成结构化周报。",
      category: "办公效率",
      prompt:
        "你是工作汇报助手。请根据用户输入生成周报，包含本周完成、关键进展、问题风险、下周计划和需要协同的事项。",
      enabled: true
    },
    {
      id: "requirement-breakdown",
      name: "需求拆解",
      description: "把想法拆成范围、任务、边界和验收标准。",
      category: "产品研发",
      prompt:
        "你是资深产品经理和工程负责人。请把用户需求拆成目标、用户故事、功能范围、技术任务、风险和验收标准。",
      enabled: true
    },
    {
      id: "code-explainer",
      name: "代码解释",
      description: "解释代码、SQL 或报错，给出修复建议。",
      category: "产品研发",
      prompt:
        "你是资深工程师。请解释用户提供的代码、SQL 或错误信息，指出问题原因、风险和可执行修复步骤。",
      enabled: true
    }
  ];
}

function defaultPromptPresets() {
  return [
    { id: "image-product-poster", moduleId: "image", title: "产品海报", prompt: "产品海报，干净高级，红白配色，留白充足", enabled: true },
    { id: "image-rednote-cover", moduleId: "image", title: "小红书封面", prompt: "小红书封面图，明亮质感，主体清晰，圆润卡片排版", enabled: true },
    { id: "agents-launch-plan", moduleId: "agents", title: "上线计划", prompt: "拆解一个上线计划，包含目标、里程碑、风险和验收标准", enabled: true },
    { id: "mindmap-meeting", moduleId: "mindmap", title: "会议导图", prompt: "把会议纪要整理成行动导图，分为结论、任务、负责人和时间点", enabled: true }
  ];
}

function createDefaultData() {
  return {
    version: 9,
    settings: defaultSettings(),
    menuItems: defaultMenuItems(),
    modelCatalog: defaultModelCatalog(),
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

  return {
    theme: "rednote",
    siteName: String(source.siteName || fallback.siteName).trim(),
    allowGuestChat: typeof source.allowGuestChat === "boolean" ? source.allowGuestChat : fallback.allowGuestChat,
    defaultModule
  };
}

function normalizeAssistantTextList(value, fallback, splitPattern, limit, maxLength) {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(splitPattern)
      : Array.isArray(fallback)
        ? fallback
        : [];
  return [...new Set(source
    .map((item) => String(item || "").trim().slice(0, maxLength))
    .filter(Boolean))]
    .slice(0, limit);
}

function normalizeAssistant(assistant, fallback) {
  const source = assistant && typeof assistant === "object" ? assistant : {};
  const fallbackSource = fallback && typeof fallback === "object" ? fallback : {};
  const nowStamp = now();
  return {
    id: String(source.id || fallbackSource.id || crypto.randomUUID()).trim().slice(0, 140),
    name: String(source.name || fallbackSource.name || "").trim().slice(0, 160),
    description: String(source.description || fallbackSource.description || "").trim().slice(0, 1000),
    category: String(source.category || fallbackSource.category || "通用效率").trim().slice(0, 80) || "通用效率",
    tags: normalizeAssistantTextList(source.tags, fallbackSource.tags, /[,，\r\n]+/, 12, 80),
    starterPrompts: normalizeAssistantTextList(source.starterPrompts, fallbackSource.starterPrompts, /[\r\n]+/, 8, 400),
    color: String(source.color || fallbackSource.color || "#ff2442").trim().slice(0, 32),
    systemPrompt: String(source.systemPrompt || fallbackSource.systemPrompt || "").trim().slice(0, 24000),
    enabled: typeof source.enabled === "boolean" ? source.enabled : fallbackSource.enabled !== false,
    createdAt: source.createdAt || fallbackSource.createdAt || nowStamp,
    updatedAt: source.updatedAt || fallbackSource.updatedAt || nowStamp
  };
}

function normalizeAssistants(dataAssistants, fallbackAssistants = defaultAssistants()) {
  const list = Array.isArray(dataAssistants) && dataAssistants.length ? dataAssistants : fallbackAssistants;
  const normalized = list.map((assistant, index) => {
    const matchingFallback = fallbackAssistants.find((fallback) =>
      (assistant?.id && fallback.id === assistant.id) ||
      (assistant?.name && fallback.name === assistant.name)
    );
    const positionalFallback = list === fallbackAssistants ? fallbackAssistants[index] : undefined;
    return normalizeAssistant(assistant, matchingFallback || positionalFallback || {});
  }).filter((assistant) => assistant.id && assistant.name && assistant.systemPrompt);
  return normalized.length
    ? normalized
    : fallbackAssistants.map((assistant) => normalizeAssistant(assistant, assistant));
}

function migrateAssistants(assistants, version) {
  if (Number(version || 0) >= 7) return assistants;
  const defaults = defaultAssistants();
  const existingIds = new Set(assistants.map((assistant) => assistant.id));
  const existingNames = new Set(assistants.map((assistant) => assistant.name));
  const missingDefaults = defaults.filter((assistant) =>
    !existingIds.has(assistant.id) && !existingNames.has(assistant.name)
  );
  return missingDefaults.length
    ? normalizeAssistants([...assistants, ...missingDefaults], defaults)
    : assistants;
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
  let migrated = modelCatalog;

  if (version < 5 && !migrated.some((entry) => entry.capabilities.includes("video"))) {
    const defaultVideoModel = defaultModelCatalog().find((entry) => entry.id === "compatible-video");
    if (defaultVideoModel) migrated = normalizeModelCatalog([...migrated, defaultVideoModel], migrated);
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
  const modelCatalog = migrateModelCatalog(normalizedCatalog, data.version);
  const assistants = migrateAssistants(
    normalizeAssistants(data.assistants, fallback.assistants),
    data.version
  );

  return {
    version: fallback.version,
    settings: normalizeSettings(data.settings),
    menuItems: normalizeMenuItems(data.menuItems, fallback.menuItems),
    modelCatalog,
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
  try {
    fs.accessSync(dataDir, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function buildAdminOpsPayload() {
  const backups = listBackupFiles();
  const coverage = buildModelCoverage();
  const checklist = [
    {
      id: "admin-password",
      label: "管理员密码已配置",
      ok: Boolean(adminPassword),
      detail: adminPassword ? "后台需要管理员凭据访问。" : "生产环境请设置 ADMIN_PASSWORD。"
    },
    {
      id: "session-secret",
      label: "会话密钥已独立配置",
      ok: Boolean(process.env.ADMIN_SESSION_SECRET || process.env.APP_SESSION_SECRET),
      detail: "建议通过 ADMIN_SESSION_SECRET 设置独立随机密钥。"
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
    backups: backups.slice(0, 8)
  };
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
    return initialData;
  }
}

let db = loadData();

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
app.use(express.json({ limit: "32mb" }));

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

const asyncRoute = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

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
  return crypto.createHmac("sha256", adminSessionSecret).update(value).digest("base64url");
}

function createAdminSessionCookie() {
  const payload = Buffer.from(
    JSON.stringify({
      role: "admin",
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
    return session.role === "admin" && session.expiresAt > Date.now();
  } catch {
    return false;
  }
}

function hasAdminAuth(req) {
  if (!isProduction && !adminPassword) return true;
  if (!adminPassword) return false;
  const cookies = parseCookies(req.headers.cookie || "");
  return isValidAdminSession(cookies.cw_admin_session);
}

function compareAdminPassword(input) {
  const left = crypto.createHash("sha256").update(String(input || "")).digest();
  const right = crypto.createHash("sha256").update(adminPassword).digest();
  return crypto.timingSafeEqual(left, right);
}

function requireAdmin(req, res, next) {
  if (isProduction && !adminPassword) {
    return res.status(503).json({ error: "管理员密码未配置，后台已锁定" });
  }
  if (hasAdminAuth(req)) return next();
  return res.status(401).json({ error: "需要管理员登录" });
}

function requireKnowledgeAdmin(req, _res, next) {
  if (isProduction && !adminPassword) {
    return next(
      new KnowledgeError(
        KNOWLEDGE_ERROR_CODES.ADMIN_UNAVAILABLE,
        "管理员密码未配置，知识库后台已锁定",
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

function getAssistant(id) {
  if (id) {
    const exact = db.assistants.find((assistant) => assistant.id === id && assistant.enabled !== false);
    if (!exact) throw httpError(410, "助手已停用或不存在");
    return exact;
  }
  const fallback = db.assistants.find((assistant) => assistant.enabled !== false);
  if (!fallback) throw httpError(503, "当前没有可用助手");
  return fallback;
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
  const assistant = getAssistant(assistantId);
  const conversation = {
    id: crypto.randomUUID(),
    title: String(title || "新对话").trim() || "新对话",
    assistantId: assistant.id,
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

function sanitizeRequestMessages(value) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(-40)
    .map((message) => {
      if (!message || typeof message !== "object") return null;
      const role = message.role === "assistant" ? "assistant" : message.role === "user" ? "user" : "";
      if (!role) return null;
      const content = compact(message.content || "", 24000);
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

function requestConversationFromBody(body, assistant, content) {
  const summary = body?.conversation && typeof body.conversation === "object" ? body.conversation : {};
  const createdAt = summary.createdAt || now();
  return {
    id: compact(summary.id || crypto.randomUUID(), 140),
    title: compact(summary.title || makeTitle(content), 120),
    assistantId: assistant.id,
    pinned: Boolean(summary.pinned),
    messages: sanitizeRequestMessages(body?.history),
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
    assistant.systemPrompt,
    ...skillInstructions.map((instruction, index) => `Skill ${index + 1}:\n${instruction}`)
  ].filter(Boolean).join("\n\n"), 48000);
  const systemContext = composeCloudKnowledgeSystemContext({
    trustedContext,
    knowledge: cloudKnowledge,
    trailingContext: boundedText(searchContext, 24000)
  });
  return [{ role: "system", content: systemContext }, ...history];
}

function writeSse(res, event, payload) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
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
    const result = await runIndependentWebSearch({ service, query, signal });
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
  const baseUrl = String(source.baseUrl || "").trim().replace(/\/+$/, "");
  const apiKey = String(source.apiKey || "").trim();
  if (!baseUrl) throw httpError(400, "Base URL 不能为空");
  if (!/^https?:\/\//i.test(baseUrl)) throw httpError(400, "Base URL 必须以 http:// 或 https:// 开头");
  if (!apiKey) throw httpError(400, "API Key 不能为空");
  return { baseUrl, apiKey };
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
    name: compact(source.name || `${label}.png`, 160)
  };
}

function imageInputsFrom(value, label = "图片", maxItems = 1) {
  if (!Array.isArray(value)) return [];
  if (value.length > maxItems) {
    throw httpError(400, `${label}最多支持 ${maxItems} 张`);
  }
  return value.map((item, index) => imageInputFrom(item, `${label}${index + 1}`));
}

function referenceImageUrlsFrom(value, maxItems = 4) {
  if (!Array.isArray(value)) return [];
  if (value.length > maxItems) {
    throw httpError(400, `参考图链接最多支持 ${maxItems} 条`);
  }
  const seen = new Set();
  return value
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
  if (!connection) throw httpError(400, "请先填写 API URL 和 Key");
  const entry = resolveCatalogEntry(body, capability);
  return {
    connection,
    entry,
    provider: buildRuntimeProvider(entry, connection)
  };
}

function defaultModelFor(capability, preferredVendor) {
  const enabled = publicModelCatalog(db.modelCatalog).filter((entry) => modelSupports(entry, capability));
  return (
    enabled.find((entry) => entry.vendor === preferredVendor && entry.defaultFor.includes(capability)) ||
    enabled.find((entry) => entry.vendor === preferredVendor) ||
    enabled.find((entry) => entry.defaultFor.includes(capability)) ||
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
  const attachments = value.slice(0, 6).map((attachment, index) => {
    if (!attachment || typeof attachment !== "object") return null;
    const kind = String(attachment.kind || "");
    const name = compact(attachment.name || `附件 ${index + 1}`, 140);
    const mimeType = compact(attachment.mimeType || "", 120);
    const size = Number.isFinite(Number(attachment.size)) ? Number(attachment.size) : 0;

    if (kind === "image") {
      const dataUrl = String(attachment.dataUrl || "");
      if (!/^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(dataUrl)) {
        throw httpError(400, `${name} 不是可用图片`);
      }
      if (dataUrl.length > 5_600_000 || size > 4 * 1024 * 1024) {
        throw httpError(400, `${name} 超过图片附件大小限制`);
      }
      if (!entry.capabilities.includes("vision")) {
        throw httpError(400, "当前模型未启用视觉能力，不能发送图片附件");
      }
      return { type: "image", name, mimeType, size, dataUrl };
    }

    if (kind === "text") {
      const text = compact(attachment.text || "", 12000);
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
  skillInstructions,
  signal,
  tools,
  hostedTools,
  toolContext
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
  skillInstructions,
  cloudKnowledge,
  searchContext,
  tools,
  hostedTools,
  toolContext,
  signal,
  onToken
}) {
  const adapter = createProviderAdapter(provider);
  if (tools?.length || hostedTools?.length) {
    const text = await requestChatCompletion({
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
      signal,
      tools,
      hostedTools,
      toolContext
    });
    if (text) onToken(text);
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
  const candidate = normalizeCatalogEntry(
    { ...(existing || {}), ...(body || {}), model, label, id: existing?.id || body?.id },
    existing
  );
  return {
    ...candidate,
    id: existing?.id || candidate.id
  };
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
    adminConfigured: Boolean(adminPassword),
    knowledge: publicKnowledgeRuntimeStatus(knowledgeRuntime),
    langflow: publicLangflowStatus(langflowConfig)
  });
});

app.get("/api/public/bootstrap", (req, res) => {
  res.json({
    settings: db.settings,
    menuItems: publicMenuItems(),
    modelCatalog: publicModelCatalog(db.modelCatalog),
    assistants: db.assistants.filter((assistant) => assistant.enabled !== false),
    appPresets: db.appPresets.filter((preset) => preset.enabled),
    promptPresets: db.promptPresets.filter((preset) => preset.enabled),
    langflow: publicLangflowStatus(langflowConfig),
    langflowWorkflows: publicLangflowWorkflows(db.langflowWorkflows),
    conversations: [],
    toolSettings: publicToolSettings()
  });
});

app.get("/api/bootstrap", (req, res) => {
  res.json({
    settings: db.settings,
    menuItems: publicMenuItems(),
    modelCatalog: publicModelCatalog(db.modelCatalog),
    assistants: db.assistants.filter((assistant) => assistant.enabled !== false),
    appPresets: db.appPresets.filter((preset) => preset.enabled),
    promptPresets: db.promptPresets.filter((preset) => preset.enabled),
    langflow: publicLangflowStatus(langflowConfig),
    langflowWorkflows: publicLangflowWorkflows(db.langflowWorkflows),
    conversations: [],
    toolSettings: publicToolSettings()
  });
});

app.get("/api/auth/status", (req, res) => {
  res.json({
    authRequired: false,
    authenticated: true,
    adminConfigured: Boolean(adminPassword)
  });
});

app.post("/api/auth/login", (req, res) => {
  res.json({ ok: true });
});

app.post("/api/auth/logout", (req, res) => {
  res.json({ ok: true });
});

app.get("/api/admin/status", (req, res) => {
  res.json({
    authRequired: Boolean(adminPassword) || isProduction,
    authenticated: hasAdminAuth(req),
    adminConfigured: Boolean(adminPassword)
  });
});

app.post("/api/admin/login", (req, res) => {
  if (!isProduction && !adminPassword) return res.json({ ok: true });
  if (!adminPassword) {
    return res.status(503).json({ error: "管理员密码未配置，后台已锁定" });
  }
  if (!compareAdminPassword(req.body?.password)) {
    return res.status(401).json({ error: "管理员密码不正确" });
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

adminRouter.get("/bootstrap", (req, res) => {
  res.json({
    settings: db.settings,
    menuItems: adminMenuItems(),
    modelCatalog: db.modelCatalog,
    assistants: db.assistants,
    appPresets: db.appPresets,
    promptPresets: db.promptPresets,
    langflow: publicLangflowStatus(langflowConfig),
    langflowWorkflows: db.langflowWorkflows,
    toolSettings: normalizeToolSettings(db.toolSettings)
  });
});

adminRouter.patch("/settings", (req, res) => {
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
  delete nextSettings.adminEntryEnabled;
  db.settings = nextSettings;
  saveData();
  appendAudit("settings-update", { siteName: db.settings.siteName, allowGuestChat: db.settings.allowGuestChat });
  res.json(db.settings);
});

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

adminRouter.post("/model-catalog", (req, res) => {
  const entry = sanitizeAdminModelCatalogEntry(req.body || {});
  db.modelCatalog.unshift(entry);
  saveData();
  appendAudit("model-create", { id: entry.id, vendor: entry.vendor, model: entry.model });
  res.status(201).json(entry);
});

adminRouter.patch("/model-catalog/:id", (req, res) => {
  const index = db.modelCatalog.findIndex((entry) => entry.id === req.params.id);
  if (index === -1) throw httpError(404, "模型不存在");
  db.modelCatalog[index] = sanitizeAdminModelCatalogEntry(req.body || {}, db.modelCatalog[index]);
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
    if (/^(apiKey|baseUrl|secret|token|password)$/i.test(key)) {
      matches.push(nextPath.join("."));
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

  return {
    settings: source.settings ? normalizeSettings(source.settings) : db.settings,
    menuItems: Array.isArray(source.menuItems) ? normalizeMenuItems(source.menuItems) : db.menuItems,
    modelCatalog: Array.isArray(source.modelCatalog) ? normalizeModelCatalog(source.modelCatalog, db.modelCatalog) : db.modelCatalog,
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

adminRouter.patch("/metadata-import", (req, res) => {
  const nextData = buildMetadataImport(req.body);
  const report = metadataImportReport(nextData);
  if (String(req.query.dryRun || "") === "true") return res.json(report);
  const backupFile = backupCurrentData("metadata-import");
  db.settings = nextData.settings;
  db.menuItems = nextData.menuItems;
  db.modelCatalog = nextData.modelCatalog;
  db.assistants = nextData.assistants;
  db.appPresets = nextData.appPresets;
  db.promptPresets = nextData.promptPresets;
  db.langflowWorkflows = nextData.langflowWorkflows;
  db.toolSettings = nextData.toolSettings;
  saveData();
  appendAudit("metadata-import", {
    backupFile: path.relative(dataDir, backupFile),
    counts: report.counts,
    warnings: report.warnings
  });
  res.json(adminMetadataPayload());
});

adminRouter.get("/ops", (req, res) => {
  res.json(buildAdminOpsPayload());
});

adminRouter.get("/backups", (req, res) => {
  res.json(listBackupFiles());
});

adminRouter.post("/backups/:name/restore", (req, res) => {
  const backupPath = safeBackupPath(req.params.name);
  const restored = normalizeData(JSON.parse(fs.readFileSync(backupPath, "utf8")));
  const preRestoreBackup = backupCurrentData("pre-restore");
  db = restored;
  saveData();
  appendAudit("backup-restore", {
    backupFile: path.relative(dataDir, backupPath),
    preRestoreBackup: path.relative(dataDir, preRestoreBackup)
  });
  res.json({
    ...adminMetadataPayload(),
    restored: true,
    restoredBackup: path.basename(backupPath)
  });
});

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

app.post(
  "/api/chat/stream",
  asyncRoute(async (req, res) => {
    assertChatAllowed();
    const content = String(req.body?.content || "").trim();
    if (!content) throw httpError(400, "消息不能为空");
    const displayContent = compact(req.body?.displayContent || content, 24000);

    const { connection, entry, provider } = resolveRuntimeProvider(req.body || {}, "chat");
    const assistant = getAssistant(req.body?.assistantId);
    const model = entry.model;
    const attachments = sanitizeChatAttachments(req.body?.attachments, entry);
    const skillInstructions = chatSkillInstructionsFromBody(req.body?.skillInstructions);
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
      requestedNames: requestedTools
    });
    if (resolvedTools.unavailable.length) {
      throw httpError(
        400,
        resolvedTools.unavailable.map((tool) => `${tool.name}：${tool.reason}`).join("；")
      );
    }
    const controller = new AbortController();
    req.on("aborted", () => controller.abort());
    const cloudKnowledge = await prepareCloudKnowledge(req, displayContent, controller.signal);
    let searchContext = "";
    if (resolvedTools.searchTools.length) {
      if (!isSearchServiceReady(req.body?.searchService)) {
        throw httpError(400, "请先配置独立联网搜索服务的 API URL 和 Key");
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
        if (searchError?.name === "AbortError" || controller.signal.aborted) {
          throw httpError(499, "请求已取消");
        }
        throw httpError(502, publicProviderError(searchError, connection, req.body?.searchService));
      }
    }
    const temperature = Number.isFinite(Number(req.body?.temperature)) ? Number(req.body.temperature) : 0.7;
    const topP = Number.isFinite(Number(req.body?.topP)) ? Number(req.body.topP) : undefined;
    const reasoningEffort = sanitizeReasoningEffort(req.body?.reasoningEffort);
    const maxTokens = Number.isFinite(Number(req.body?.maxTokens))
      ? Math.max(1, Math.trunc(Number(req.body.maxTokens)))
      : undefined;
    const conversation = requestConversationFromBody(req.body || {}, assistant, displayContent);

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
    writeSse(res, "meta", {
      conversation: conversationSummary(conversation),
      userMessage,
      assistantMessageId: assistantMessage.id
    });

    let finished = false;
    let clientClosed = false;
    res.on("close", () => {
      if (!finished && !res.writableEnded) {
        clientClosed = true;
        controller.abort();
      }
    });

    try {
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
        skillInstructions,
        cloudKnowledge,
        searchContext,
        tools: resolvedTools.localTools,
        hostedTools: resolvedTools.hostedTools,
        toolContext,
        signal: controller.signal,
        onToken: (token) => {
          assistantMessage.content += token;
          if (!clientClosed) writeSse(res, "token", { token });
        }
      });

      assistantMessage.status = "done";
      conversation.updatedAt = now();

      if (!clientClosed) {
        writeSse(res, "done", {
          conversation: conversationSummary(conversation),
          message: assistantMessage
        });
      }
    } catch (error) {
      const aborted = error?.name === "AbortError" || controller.signal.aborted;
      assistantMessage.status = aborted ? "stopped" : "error";
      if (!assistantMessage.content && !aborted) {
        assistantMessage.content = `请求失败：${publicProviderError(error, connection, req.body?.searchService)}`;
      }
      conversation.updatedAt = now();

      if (!clientClosed) {
        if (!aborted) writeSse(res, "error", { error: publicProviderError(error, connection, req.body?.searchService) });
        writeSse(res, "done", {
          conversation: conversationSummary(conversation),
          message: assistantMessage
        });
      }
    } finally {
      finished = true;
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
    const controller = new AbortController();
    req.on("aborted", () => controller.abort());
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
    if (searchTools.length && !isSearchServiceReady(req.body?.searchService)) {
      throw httpError(400, "请先配置独立联网搜索服务的 API URL 和 Key");
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
    const controller = new AbortController();
    req.on("aborted", () => controller.abort());
    try {
      const adapter = createProviderAdapter(provider);
      if (typeof adapter.transcribeAudio !== "function") {
        throw new Error("当前供应商未提供语音识别接口");
      }
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
    const controller = new AbortController();
    req.on("aborted", () => controller.abort());

    try {
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

    const controller = new AbortController();
    req.on("aborted", () => controller.abort());

    try {
      const adapter = createProviderAdapter(provider);
      if (typeof adapter.getVideoStatus !== "function") {
        throw new Error("当前供应商未提供视频状态查询接口");
      }
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
      if (error?.name === "AbortError" || controller.signal.aborted) {
        throw httpError(499, "请求已取消");
      }
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
    const controller = new AbortController();
    req.on("aborted", () => controller.abort());

    try {
      if (module === "image") {
        const mode = options.mode === "edit" ? "edit" : "generate";
        if (mode === "edit" && !entry.capabilities.includes("imageEdit")) {
          throw httpError(400, "所选模型未启用图片编辑能力");
        }
        const maxReferenceImages = entry.vendor === "botcf" ? 4 : 1;
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
          ? referenceImageUrlsFrom(options.referenceImageUrls, 4)
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
        if (entry.vendor === "openai" && maskImage && maskImage.mimeType !== "image/png") {
          throw httpError(400, "OpenAI 图片编辑蒙版必须为 PNG");
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
        const styledPrompt = [
          prompt,
          options.stylePreset ? `风格：${compact(options.stylePreset, 120)}` : "",
          options.quality ? `质量：${compact(options.quality, 80)}` : "",
          options.negativePrompt ? `避免出现：${compact(options.negativePrompt, 400)}` : ""
        ]
          .filter(Boolean)
          .join("\n");
        const json = await createProviderAdapter(provider).generateImage({
          model,
          prompt: styledPrompt,
          mode,
          inputImage,
          inputImages,
          referenceImageUrls,
          maskImage,
          size: options.size || "1024x1024",
          aspectRatio,
          imageSize,
          count: requestedCount,
          quality: options.quality,
          outputFormat,
          outputCompression,
          signal: controller.signal
        });
        const fallbackMimeType = outputFormat === "jpeg"
          ? "image/jpeg"
          : outputFormat === "webp"
            ? "image/webp"
            : "image/png";
        const assets = extractAssets(json, "image", fallbackMimeType).slice(0, requestedCount);
        const revisedPrompts = Array.isArray(json?.data)
          ? json.data.map((item) => item?.revised_prompt).filter(Boolean)
          : [];
        return res.json(
          resultPayload("image", "画图结果", {
            assets,
            text: json.text || json.revised_prompt || revisedPrompts.join("\n"),
            raw: {
              provider: entry.vendor,
              model,
              mode,
              requestedCount,
              assetCount: assets.length
            }
          })
        );
      }

      if (module === "audio") {
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

      if (module === "ppt" || module === "mindmap" || module === "translate") {
        const systemPrompt =
          module === "ppt"
            ? [
                "你是专业的演示文稿策划助手。",
                "根据用户主题生成可直接用于制作 PPT 的结构化内容。",
                "输出 Markdown，必须包含：标题、受众、核心观点、8-10 页幻灯片大纲、每页标题、要点、讲述备注。",
                "内容要具体、可执行，不要写成泛泛的目录。"
              ].join("\n")
            : module === "mindmap"
              ? [
                  "你是专业的信息架构和思维导图助手。",
                  "根据用户主题生成层级清晰的思维导图内容。",
                  "输出 Markdown，先给出 Mermaid mindmap 代码块，再给出简短的层级说明。",
                  "节点名称要短，层级不超过 4 层，避免无意义空话。"
                ].join("\n")
              : [
                  "你是专业翻译助手。",
                  "识别原文语言，并翻译为用户指定的目标语言；未指定目标语言时，默认翻译为简体中文。",
                  "保留原文格式、专有名词、数字和代码，只输出译文，不添加解释。"
                ].join("\n");
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
              content: systemPrompt
            },
            { role: "user", content: prompt }
          ],
          signal: controller.signal
        });
        return res.json(
          resultPayload(module, module === "ppt" ? "PPT 大纲" : module === "mindmap" ? "思维导图" : "翻译结果", {
            text: content
          })
        );
      }

      if (module === "agents") {
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
      if (error?.name === "AbortError" || controller.signal.aborted) {
        throw httpError(499, "请求已取消");
      }
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
  if (!isProduction && !adminPassword) {
    console.log("ADMIN_PASSWORD is not set; admin APIs are unlocked for local development.");
  }
  if (isProduction && !adminPassword) {
    console.log("ADMIN_PASSWORD is not set; admin APIs are locked in production.");
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
    await knowledgeRuntime.close().catch((error) => console.error(error));
    clearTimeout(forceExit);
    process.exit(0);
  });
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
