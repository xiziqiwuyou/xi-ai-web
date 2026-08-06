import {
  DEFAULT_UPSTREAM_BASE_URL,
  managedUpstreamPolicy,
  normalizeUpstreamBaseUrl
} from "../upstream-security.mjs";

export { defaultAssistants } from "./assistant-catalog.mjs";

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.trunc(parsed)));
}

export function defaultMenuItems() {
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

export function defaultSettings({
  env = process.env,
  production = env.NODE_ENV === "production" || process.argv.includes("--production")
} = {}) {
  const upstreamPolicy = managedUpstreamPolicy({ env, production });
  const progressSyncEnabled = String(
    env.PROGRESS_SYNC_ENABLED ?? (production ? "false" : "true")
  ).toLowerCase() === "true";
  return {
    siteName: "xi-ai-web",
    theme: "rednote",
    allowGuestChat: true,
    defaultModule: "chat",
    oneapiSettingsHandoffEnabled: false,
    upstreamBaseUrl: upstreamPolicy.configuredBaseUrl || normalizeUpstreamBaseUrl(
      env.UPSTREAM_BASE_URL || DEFAULT_UPSTREAM_BASE_URL,
      { production, allowLocal: String(env.ALLOW_LOCAL_UPSTREAM || "").toLowerCase() === "true" }
    ),
    progressSync: {
      enabled: progressSyncEnabled,
      ttlSeconds: boundedInteger(env.PROGRESS_SYNC_TTL_SECONDS, 600, 180, 1800),
      maxPayloadMb: boundedInteger(env.PROGRESS_SYNC_MAX_PAYLOAD_MB, 32, 5, 64),
      maxIpJoinAttempts: boundedInteger(env.PROGRESS_SYNC_MAX_IP_ATTEMPTS, 5, 1, 20),
      maxSessionJoinAttempts: boundedInteger(env.PROGRESS_SYNC_MAX_SESSION_ATTEMPTS, 5, 1, 10)
    }
  };
}

export function defaultAppPresets() {
  return [
    {
      id: "rednote-note",
      name: "小红书笔记",
      description: "把主题改写成适合种草、经验分享或产品推荐的笔记。",
      category: "内容创作",
      prompt: "你是小红书内容策划。请根据用户输入生成一篇自然、有记忆点的小红书笔记，包含标题、正文、分段亮点和标签。避免夸张承诺。",
      enabled: true
    },
    {
      id: "copy-polish",
      name: "文案改写",
      description: "把粗糙文案改得更清晰、更有转化力。",
      category: "内容创作",
      prompt: "你是资深文案编辑。请保留用户原意，输出 3 个不同风格版本，并说明每个版本适合的使用场景。",
      enabled: true
    },
    {
      id: "competitor-analysis",
      name: "竞品分析",
      description: "整理竞品差异、优势短板和可执行机会点。",
      category: "商业分析",
      prompt: "你是产品和商业分析师。请根据用户输入输出竞品分析，包含对比维度、差异、风险、机会点和下一步验证清单。",
      enabled: true
    },
    {
      id: "weekly-report",
      name: "周报生成",
      description: "把零散工作记录整理成结构化周报。",
      category: "办公效率",
      prompt: "你是工作汇报助手。请根据用户输入生成周报，包含本周完成、关键进展、问题风险、下周计划和需要协同的事项。",
      enabled: true
    },
    {
      id: "requirement-breakdown",
      name: "需求拆解",
      description: "把想法拆成范围、任务、边界和验收标准。",
      category: "产品研发",
      prompt: "你是资深产品经理和工程负责人。请把用户需求拆成目标、用户故事、功能范围、技术任务、风险和验收标准。",
      enabled: true
    },
    {
      id: "code-explainer",
      name: "代码解释",
      description: "解释代码、SQL 或报错，给出修复建议。",
      category: "产品研发",
      prompt: "你是资深工程师。请解释用户提供的代码、SQL 或错误信息，指出问题原因、风险和可执行修复步骤。",
      enabled: true
    }
  ];
}

export function defaultPromptPresets() {
  return [
    { id: "image-product-poster", moduleId: "image", title: "产品海报", prompt: "产品海报，干净高级，红白配色，留白充足", enabled: true },
    { id: "image-rednote-cover", moduleId: "image", title: "小红书封面", prompt: "小红书封面图，明亮质感，主体清晰，圆润卡片排版", enabled: true },
    { id: "agents-launch-plan", moduleId: "agents", title: "上线计划", prompt: "拆解一个上线计划，包含目标、里程碑、风险和验收标准", enabled: true },
    { id: "mindmap-meeting", moduleId: "mindmap", title: "会议导图", prompt: "把会议纪要整理成行动导图，分为结论、任务、负责人和时间点", enabled: true }
  ];
}
