import type { MenuItem, ModelCapability, ModelCatalogEntry } from "../../types";

type RequiredCapability = {
  capability: ModelCapability;
  label: string;
};

const moduleRequirements: Partial<Record<MenuItem["id"], RequiredCapability[]>> = {
  chat: [{ capability: "chat", label: "对话" }],
  image: [{ capability: "image", label: "绘画" }],
  ppt: [{ capability: "chat", label: "PPT 生成" }],
  mindmap: [{ capability: "chat", label: "思维导图" }],
  assistants: [{ capability: "chat", label: "助手对话" }],
  translate: [{ capability: "chat", label: "翻译" }],
  agents: [
    { capability: "chat", label: "智能体对话" },
    { capability: "toolCalling", label: "工具调用" }
  ],
  workflows: [{ capability: "chat", label: "工作流执行" }],
  skills: [],
  apps: [{ capability: "chat", label: "应用执行" }],
  gallery: []
};

const vendorCapabilityHints: Record<ModelCatalogEntry["vendor"], ModelCapability[]> = {
  openai: [
    "chat",
    "vision",
    "image",
    "imageEdit",
    "tts",
    "stt",
    "audio",
    "embedding",
    "fileSearch",
    "toolCalling",
    "webSearch",
    "codeExecution",
    "streaming"
  ],
  anthropic: ["chat", "vision", "toolCalling", "webSearch", "urlContext", "codeExecution", "streaming"],
  gemini: [
    "chat",
    "vision",
    "image",
    "imageEdit",
    "tts",
    "stt",
    "audio",
    "embedding",
    "fileSearch",
    "toolCalling",
    "webSearch",
    "urlContext",
    "codeExecution",
    "streaming"
  ],
  kimi: ["chat", "vision", "toolCalling", "streaming"],
  deepseek: ["chat", "toolCalling", "streaming"],
  qwen: ["chat", "vision", "audio", "embedding", "toolCalling", "webSearch", "codeExecution", "streaming"],
  "openai-compatible": [
    "chat",
    "vision",
    "image",
    "tts",
    "stt",
    "audio",
    "embedding",
    "video",
    "toolCalling",
    "streaming"
  ]
};

function supportsCapability(entry: ModelCatalogEntry, capability: ModelCapability) {
  if (capability === "tts") return entry.capabilities.includes("tts") || entry.capabilities.includes("audio");
  return entry.capabilities.includes(capability);
}

export function validateModelCatalog(entries: ModelCatalogEntry[], menuItems: MenuItem[] = []) {
  const issues: string[] = [];
  const seenIds = new Set<string>();
  const enabledEntries = entries.filter((entry) => entry.enabled);

  entries.forEach((entry) => {
    if (seenIds.has(entry.id)) issues.push(`重复模型 ID：${entry.id}`);
    seenIds.add(entry.id);
    if (!entry.model.trim()) issues.push(`${entry.label || entry.id} 缺少实际请求模型名`);
    if (!entry.label.trim()) issues.push(`${entry.model || entry.id} 缺少前台显示名称`);

    entry.defaultFor.forEach((capability) => {
      if (!supportsCapability(entry, capability)) {
        issues.push(`${entry.label} 的默认用途 ${capability} 未包含在能力标签中`);
      }
    });

    const vendorCapabilities = vendorCapabilityHints[entry.vendor];
    const unsupportedCapabilities = entry.capabilities.filter((capability) => !vendorCapabilities.includes(capability));
    if (unsupportedCapabilities.length) {
      issues.push(`${entry.label} 标记了 ${entry.vendor} 适配器未声明支持的能力：${unsupportedCapabilities.join("、")}`);
    }
  });

  if (!enabledEntries.some((entry) => supportsCapability(entry, "chat"))) {
    issues.push("至少需要启用一个对话模型");
  }

  menuItems
    .filter((item) => item.visible && item.enabled)
    .forEach((item) => {
      const requirements = moduleRequirements[item.id] || [];
      requirements.forEach(({ capability, label }) => {
        if (!enabledEntries.some((entry) => supportsCapability(entry, capability))) {
          issues.push(`菜单「${item.label}」已开启，但缺少支持「${label}」的启用模型`);
        }
      });
    });

  return issues;
}
