function safeCalculatorEval(expression) {
  const source = String(expression || "").trim();
  if (!source) throw new Error("Expression is required");
  if (source.length > 160) throw new Error("Expression is too long");
  if (!/^[0-9+\-*/().%\s]+$/.test(source)) {
    throw new Error("Expression may only contain numbers and arithmetic operators");
  }
  return Function(`"use strict"; return (${source});`)();
}

const baseTools = [
  {
    name: "datetime_now",
    label: "当前时间",
    description: "Return the current server time as ISO and localized strings.",
    riskLevel: "low",
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
    description: "Evaluate a simple arithmetic expression. Only numbers and + - * / % parentheses are allowed.",
    riskLevel: "low",
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
  description: "Search the current request knowledge context and return relevant text chunks.",
  riskLevel: "medium",
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

export function toolCatalog(context = {}) {
  const tools = context.searchKnowledge ? [...baseTools, knowledgeSearchTool] : [...baseTools];
  return tools.map((tool) => ({
    name: tool.name,
    label: tool.label || tool.name,
    description: tool.description || "",
    riskLevel: tool.riskLevel || "low",
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

export async function runTool(toolCall, context = {}, settings = []) {
  const tools = availableTools(context, settings);
  const tool = tools.find((item) => item.name === toolCall.name);
  if (!tool) throw new Error(`Tool is not allowed: ${toolCall.name}`);
  return tool.execute(toolCall.arguments || {}, context);
}
