function safeCalculatorEval(expression) {
  const source = String(expression || "").trim();
  if (!source) throw new Error("Expression is required");
  if (source.length > 160) throw new Error("Expression is too long");
  if (!/^[0-9+\-*/().%\s]+$/.test(source)) {
    throw new Error("Expression may only contain numbers and arithmetic operators");
  }
  return Function(`"use strict"; return (${source});`)();
}

const functionVendors = ["openai", "anthropic", "gemini", "kimi", "deepseek", "qwen", "openai-compatible"];

const baseTools = [
  {
    name: "datetime_now",
    label: "当前时间",
    description: "读取服务器当前时间，返回 ISO、北京时间和时区。",
    riskLevel: "low",
    execution: "local",
    requiredCapability: "toolCalling",
    supportedVendors: functionVendors,
    requiresContext: false,
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false
    },
    execute: async () => ({
      iso: new Date().toISOString(),
      locale: new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }),
      timeZone: "Asia/Shanghai"
    })
  },
  {
    name: "calculator_eval",
    label: "计算器",
    description: "计算仅包含数字、括号及 + - * / % 的算术表达式。",
    riskLevel: "low",
    execution: "local",
    requiredCapability: "toolCalling",
    supportedVendors: functionVendors,
    requiresContext: false,
    parameters: {
      type: "object",
      properties: {
        expression: {
          type: "string",
          description: "Arithmetic expression to evaluate."
        }
      },
      required: ["expression"],
      additionalProperties: false
    },
    execute: async (input) => ({
      expression: String(input?.expression || ""),
      result: safeCalculatorEval(input?.expression)
    })
  }
];

const knowledgeSearchTool = {
  name: "knowledge_search",
  label: "知识库检索",
  description: "检索当前请求携带的浏览器本地知识片段，不上传或创建厂商知识库。",
  riskLevel: "medium",
  execution: "local",
  requiredCapability: "toolCalling",
  supportedVendors: functionVendors,
  requiresContext: true,
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search query."
      },
      topK: {
        type: "number",
        description: "Maximum number of chunks to return."
      }
    },
    required: ["query"],
    additionalProperties: false
  },
  execute: async (input, context) => {
    if (!context?.searchKnowledge) throw new Error("No knowledge context is available");
    return context.searchKnowledge(String(input?.query || ""), Number(input?.topK || 4));
  }
};

const managedTools = [
  {
    name: "web_search",
    label: "联网搜索",
    description: "通过单独配置的 GLM 或 Kimi 搜索服务检索网络，不依赖当前对话模型。",
    riskLevel: "medium",
    execution: "search",
    requiredCapability: undefined,
    supportedVendors: functionVendors,
    requiresContext: false
  },
  {
    name: "url_context",
    label: "网页读取",
    description: "由模型厂商读取提示词中的公开网页或文档 URL。",
    riskLevel: "medium",
    execution: "provider",
    requiredCapability: "urlContext",
    supportedVendors: ["anthropic", "gemini"],
    requiresContext: false
  },
  {
    name: "code_execution",
    label: "代码执行",
    description: "由模型厂商在隔离沙箱中执行代码；不会在本项目服务器上运行任意代码。",
    riskLevel: "high",
    execution: "provider",
    requiredCapability: "codeExecution",
    supportedVendors: ["openai", "anthropic", "gemini", "qwen"],
    requiresContext: false
  }
];

const localToolByName = new Map([...baseTools, knowledgeSearchTool].map((tool) => [tool.name, tool]));

function catalogTools() {
  return [...baseTools, knowledgeSearchTool, ...managedTools];
}

export function toolCatalog(context = {}) {
  return catalogTools().map((tool) => ({
    name: tool.name,
    label: tool.label || tool.name,
    description: tool.description || "",
    riskLevel: tool.riskLevel || "low",
    execution: tool.execution,
    requiredCapability: tool.requiredCapability,
    supportedVendors: [...tool.supportedVendors],
    requiresContext: Boolean(tool.requiresContext),
    availableInContext: !tool.requiresContext || Boolean(context.searchKnowledge),
    enabled: true
  }));
}

export function normalizeToolSettings(settings = []) {
  const incoming = new Map(
    (Array.isArray(settings) ? settings : []).map((item) => [
      item?.name,
      {
        enabled: typeof item?.enabled === "boolean" ? item.enabled : true,
        label: typeof item?.label === "string" ? item.label : "",
        description: typeof item?.description === "string" ? item.description : "",
        riskLevel: ["low", "medium", "high"].includes(item?.riskLevel) ? item.riskLevel : undefined
      }
    ])
  );
  return toolCatalog({ searchKnowledge: true }).map((tool) => {
    const next = incoming.get(tool.name) || {};
    return {
      ...tool,
      label: next.label || tool.label,
      description: next.description || tool.description,
      riskLevel: next.riskLevel || tool.riskLevel,
      enabled: typeof next.enabled === "boolean" ? next.enabled : tool.enabled
    };
  });
}

export function availableTools(context = {}, settings = []) {
  const allowed = new Set(
    normalizeToolSettings(settings)
      .filter((tool) => tool.enabled)
      .map((tool) => tool.name)
  );
  return (context.searchKnowledge ? [...baseTools, knowledgeSearchTool] : [...baseTools]).filter((tool) =>
    allowed.has(tool.name)
  );
}

export function resolveRequestedTools({ context = {}, settings = [], entry, requestedNames = [] }) {
  const normalized = normalizeToolSettings(settings);
  const settingsByName = new Map(normalized.map((tool) => [tool.name, tool]));
  const localTools = [];
  const hostedTools = [];
  const searchTools = [];
  const unavailable = [];

  [...new Set(Array.isArray(requestedNames) ? requestedNames : [])].forEach((name) => {
    const tool = settingsByName.get(name);
    if (!tool) {
      unavailable.push({ name, reason: "工具不存在" });
      return;
    }
    if (!tool.enabled) {
      unavailable.push({ name, reason: "后台已关闭" });
      return;
    }
    if (tool.execution === "search") {
      searchTools.push(tool);
      return;
    }
    if (!tool.supportedVendors.includes(entry?.vendor)) {
      unavailable.push({ name, reason: `不支持 ${entry?.vendor || "当前"} 厂商` });
      return;
    }
    if (!entry?.capabilities?.includes(tool.requiredCapability)) {
      unavailable.push({ name, reason: `模型未启用 ${tool.requiredCapability} 能力` });
      return;
    }
    if (tool.requiresContext && !context.searchKnowledge) {
      unavailable.push({ name, reason: "当前请求没有可检索的本地知识" });
      return;
    }
    if (tool.execution === "provider") {
      hostedTools.push(tool);
      return;
    }
    const runtimeTool = localToolByName.get(name);
    if (!runtimeTool) {
      unavailable.push({ name, reason: "本地执行器不可用" });
      return;
    }
    localTools.push(runtimeTool);
  });

  return { localTools, hostedTools, searchTools, unavailable };
}

export async function runTool(toolCall, context = {}, settings = []) {
  const tools = availableTools(context, settings);
  const tool = tools.find((item) => item.name === toolCall.name);
  if (!tool) throw new Error(`Tool is not allowed: ${toolCall.name}`);
  return tool.execute(toolCall.arguments || {}, context);
}
