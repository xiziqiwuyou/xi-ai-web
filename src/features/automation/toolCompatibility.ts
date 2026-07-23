import type {
  AgentSkillDefinition,
  ModelCapability,
  ModelCatalogEntry,
  ToolSetting
} from "../../types";

const allVendors: ModelCatalogEntry["vendor"][] = [
  "openai",
  "anthropic",
  "gemini",
  "kimi",
  "deepseek",
  "qwen",
  "openai-compatible"
];

export type ToolCompatibility = {
  compatible: boolean;
  reason: string;
};

export type ToolCompatibilityOptions = {
  hasContext?: boolean;
  searchReady?: boolean;
};

const capabilityLabels: Record<ModelCapability, string> = {
  chat: "对话",
  vision: "图片理解",
  image: "图片生成",
  imageEdit: "图片编辑",
  tts: "语音合成",
  stt: "语音识别",
  audio: "音频理解",
  video: "视频生成",
  embedding: "向量嵌入",
  fileSearch: "文件检索",
  toolCalling: "函数工具调用",
  webSearch: "联网搜索",
  urlContext: "网页读取",
  codeExecution: "代码执行",
  streaming: "流式输出"
};

export function capabilitySetCompatibility(
  requiredCapabilities: ModelCapability[],
  model: ModelCatalogEntry | undefined
): ToolCompatibility {
  if (!model) return { compatible: false, reason: "尚未选择模型" };
  const missing = [...new Set(requiredCapabilities)].find((capability) => !model.capabilities.includes(capability));
  return missing
    ? { compatible: false, reason: `模型未启用${capabilityLabels[missing]}能力` }
    : { compatible: true, reason: "" };
}

export function toolCompatibility(
  tool: ToolSetting | undefined,
  model: ModelCatalogEntry | undefined,
  options: ToolCompatibilityOptions = {}
): ToolCompatibility {
  if (!tool) return { compatible: false, reason: "工具不存在" };
  if (!tool.enabled) return { compatible: false, reason: "后台已关闭" };
  if (tool.execution === "search") {
    return options.searchReady
      ? { compatible: true, reason: "" }
      : { compatible: false, reason: "尚未配置独立联网搜索服务" };
  }
  if (!model) return { compatible: false, reason: "尚未选择模型" };
  const vendors = tool.supportedVendors?.length ? tool.supportedVendors : allVendors;
  if (!vendors.includes(model.vendor)) {
    return { compatible: false, reason: `不支持 ${model.label} 所属厂商` };
  }
  const capability = tool.requiredCapability || "toolCalling";
  if (!model.capabilities.includes(capability)) {
    return { compatible: false, reason: `模型未启用 ${capability} 能力` };
  }
  if (tool.requiresContext && !options.hasContext) {
    return { compatible: false, reason: "当前请求没有本地知识上下文" };
  }
  return { compatible: true, reason: "" };
}

export function toolSetCompatibility(
  names: string[],
  tools: ToolSetting[],
  model: ModelCatalogEntry | undefined,
  options: ToolCompatibilityOptions = {}
): ToolCompatibility {
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  for (const name of [...new Set(names)]) {
    const result = toolCompatibility(byName.get(name), model, options);
    if (!result.compatible) return { compatible: false, reason: `${byName.get(name)?.label || name}：${result.reason}` };
  }
  return { compatible: true, reason: "" };
}

export function skillCompatibility(
  skill: AgentSkillDefinition,
  tools: ToolSetting[],
  model: ModelCatalogEntry | undefined,
  options: ToolCompatibilityOptions = {}
): ToolCompatibility {
  const requiredCapabilities = skill.allowedTools.includes("web_search")
    ? skill.requiredCapabilities.filter((capability) => capability !== "webSearch")
    : skill.requiredCapabilities;
  const capabilityResult = capabilitySetCompatibility(requiredCapabilities, model);
  if (!capabilityResult.compatible) return capabilityResult;
  return toolSetCompatibility(skill.allowedTools, tools, model, options);
}

export function supportedVendorLabels(tool: ToolSetting) {
  if (tool.execution === "search") return "独立搜索服务";
  const labels: Record<ModelCatalogEntry["vendor"], string> = {
    openai: "OpenAI",
    anthropic: "Claude",
    gemini: "Gemini",
    kimi: "Kimi",
    deepseek: "DeepSeek",
    qwen: "Qwen",
    "openai-compatible": "兼容接口"
  };
  return (tool.supportedVendors?.length ? tool.supportedVendors : allVendors)
    .map((vendor) => labels[vendor])
    .join(" / ");
}

export function toolExecutionLabel(tool: ToolSetting) {
  if (tool.execution === "search") return "独立搜索";
  return tool.execution === "provider" ? "厂商托管" : "本地执行";
}
