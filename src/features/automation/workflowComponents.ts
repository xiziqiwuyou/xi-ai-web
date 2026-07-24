import type {
  AgentWorkflowNode,
  AgentWorkflowNodeConfig,
  AgentWorkflowNodeKind,
  ModelCapability
} from "../../types";

export type WorkflowComponentDataType = "any" | "text" | "json";
export type WorkflowComponentCategory = "输入输出" | "AI" | "逻辑" | "数据" | "知识" | "控制";
export type WorkflowComponentSecurityLevel = "local" | "provider" | "network" | "approval" | "blocked";

export type WorkflowComponentPort = {
  id: string;
  label: string;
  dataType: WorkflowComponentDataType;
  required?: boolean;
  multiple?: boolean;
};

export type WorkflowComponentConfigOption = {
  value: string;
  label: string;
};

export type WorkflowComponentConfigField = {
  key: string;
  label: string;
  control: "text" | "textarea" | "number" | "select" | "toggle" | "string-list";
  placeholder?: string;
  minimum?: number;
  maximum?: number;
  step?: number;
  options?: WorkflowComponentConfigOption[];
};

export type WorkflowComponentDefinition = {
  id: string;
  version: 1;
  kind: AgentWorkflowNodeKind;
  label: string;
  description: string;
  category: WorkflowComponentCategory;
  icon: string;
  executorId: string;
  requiredCapabilities: ModelCapability[];
  securityLevel: WorkflowComponentSecurityLevel;
  addable: boolean;
  ports: {
    inputs: WorkflowComponentPort[];
    outputs: WorkflowComponentPort[];
  };
  fields: WorkflowComponentConfigField[];
  defaultConfig?: AgentWorkflowNodeConfig;
};

const inputPort: WorkflowComponentPort = { id: "input", label: "输入", dataType: "any", required: true, multiple: true };
const outputPort: WorkflowComponentPort = { id: "output", label: "输出", dataType: "any" };

export const workflowComponentCatalog: readonly WorkflowComponentDefinition[] = [
  {
    id: "core.start",
    version: 1,
    kind: "start",
    label: "开始",
    description: "接收本次运行的初始任务",
    category: "输入输出",
    icon: "circle-play",
    executorId: "boundary.start",
    requiredCapabilities: [],
    securityLevel: "local",
    addable: false,
    ports: { inputs: [], outputs: [{ ...outputPort, dataType: "text" }] },
    fields: []
  },
  {
    id: "core.reply",
    version: 1,
    kind: "reply",
    label: "输出",
    description: "汇总并返回工作流结果",
    category: "输入输出",
    icon: "send",
    executorId: "boundary.reply",
    requiredCapabilities: [],
    securityLevel: "local",
    addable: false,
    ports: { inputs: [{ ...inputPort }], outputs: [] },
    fields: []
  },
  {
    id: "core.agent",
    version: 1,
    kind: "agent",
    label: "智能体",
    description: "调用已保存的智能体、Skill 与工具",
    category: "AI",
    icon: "bot",
    executorId: "provider.agent",
    requiredCapabilities: ["chat"],
    securityLevel: "provider",
    addable: true,
    ports: { inputs: [{ ...inputPort }], outputs: [{ ...outputPort, dataType: "text" }] },
    fields: []
  },
  {
    id: "local.language-model",
    version: 1,
    kind: "model",
    label: "语言模型",
    description: "使用当前或指定模型完成一次推理",
    category: "AI",
    icon: "brain-circuit",
    executorId: "provider.language-model",
    requiredCapabilities: ["chat"],
    securityLevel: "provider",
    addable: true,
    ports: { inputs: [{ ...inputPort }], outputs: [{ ...outputPort, dataType: "text" }] },
    fields: [
      { key: "systemPrompt", label: "系统提示词", control: "textarea", placeholder: "定义模型角色和输出要求" },
      { key: "temperature", label: "温度", control: "number", minimum: 0, maximum: 2, step: 0.1 }
    ],
    defaultConfig: { systemPrompt: "你是可靠的工作流执行助手。", temperature: 0.3 }
  },
  {
    id: "core.text-template",
    version: 1,
    kind: "template",
    label: "提示词",
    description: "使用任务和上游变量组织文本",
    category: "数据",
    icon: "file-text",
    executorId: "local.template",
    requiredCapabilities: [],
    securityLevel: "local",
    addable: true,
    ports: { inputs: [{ ...inputPort }], outputs: [{ ...outputPort, dataType: "text" }] },
    fields: []
  },
  {
    id: "local.conditional-router",
    version: 1,
    kind: "conditional",
    label: "条件分支",
    description: "按文本条件启用真或假分支",
    category: "逻辑",
    icon: "git-branch",
    executorId: "local.conditional",
    requiredCapabilities: [],
    securityLevel: "local",
    addable: true,
    ports: {
      inputs: [{ ...inputPort }],
      outputs: [
        { id: "true", label: "满足", dataType: "any" },
        { id: "false", label: "不满足", dataType: "any" }
      ]
    },
    fields: [
      {
        key: "operator",
        label: "判断方式",
        control: "select",
        options: [
          { value: "contains", label: "包含" },
          { value: "notContains", label: "不包含" },
          { value: "equals", label: "等于" },
          { value: "notEquals", label: "不等于" },
          { value: "startsWith", label: "开头是" },
          { value: "endsWith", label: "结尾是" },
          { value: "isEmpty", label: "为空" },
          { value: "isNotEmpty", label: "不为空" }
        ]
      },
      { key: "value", label: "比较值", control: "text" },
      { key: "caseSensitive", label: "区分大小写", control: "toggle" }
    ],
    defaultConfig: { operator: "contains", value: "", caseSensitive: false }
  },
  {
    id: "local.structured-output",
    version: 1,
    kind: "structured",
    label: "结构化输出",
    description: "解析 JSON 并校验必需字段",
    category: "数据",
    icon: "braces",
    executorId: "local.structured-output",
    requiredCapabilities: [],
    securityLevel: "local",
    addable: true,
    ports: { inputs: [{ ...inputPort, dataType: "text" }], outputs: [{ ...outputPort, dataType: "json" }] },
    fields: [{ key: "requiredFields", label: "必需字段", control: "string-list", placeholder: "title, summary" }],
    defaultConfig: { requiredFields: [] }
  },
  {
    id: "local.web-search",
    version: 1,
    kind: "webSearch",
    label: "联网搜索",
    description: "通过独立 GLM/Kimi 搜索配置检索资料",
    category: "知识",
    icon: "globe-2",
    executorId: "search.independent",
    requiredCapabilities: [],
    securityLevel: "network",
    addable: true,
    ports: { inputs: [{ ...inputPort }], outputs: [{ ...outputPort, dataType: "text" }] },
    fields: [
      { key: "instruction", label: "检索要求", control: "textarea", placeholder: "说明希望检索和整理的内容" },
      { key: "maxResults", label: "结果数量", control: "number", minimum: 1, maximum: 10, step: 1 }
    ],
    defaultConfig: { instruction: "检索与问题最相关的最新资料，并保留来源。", maxResults: 5 }
  },
  {
    id: "core.knowledge-retrieval",
    version: 1,
    kind: "knowledge",
    label: "知识检索",
    description: "检索本地文档或已登录的云知识库",
    category: "知识",
    icon: "book-open-text",
    executorId: "knowledge.retrieve",
    requiredCapabilities: [],
    securityLevel: "network",
    addable: true,
    ports: { inputs: [{ ...inputPort }], outputs: [{ ...outputPort, dataType: "text" }] },
    fields: []
  },
  {
    id: "local.text-splitter",
    version: 1,
    kind: "textSplit",
    label: "文本切分",
    description: "按长度和重叠区间切分长文本",
    category: "数据",
    icon: "scissors",
    executorId: "local.text-split",
    requiredCapabilities: [],
    securityLevel: "local",
    addable: true,
    ports: { inputs: [{ ...inputPort, dataType: "text" }], outputs: [{ ...outputPort, dataType: "text" }] },
    fields: [
      { key: "chunkSize", label: "片段长度", control: "number", minimum: 100, maximum: 4000, step: 100 },
      { key: "overlap", label: "重叠长度", control: "number", minimum: 0, maximum: 1000, step: 20 }
    ],
    defaultConfig: { chunkSize: 1200, overlap: 120 }
  },
  {
    id: "local.merge",
    version: 1,
    kind: "merge",
    label: "合并",
    description: "合并多个上游节点的输出",
    category: "数据",
    icon: "combine",
    executorId: "local.merge",
    requiredCapabilities: [],
    securityLevel: "local",
    addable: true,
    ports: { inputs: [{ ...inputPort }], outputs: [{ ...outputPort }] },
    fields: [
      { key: "separator", label: "分隔符", control: "text" },
      { key: "includeLabels", label: "包含节点名称", control: "toggle" }
    ],
    defaultConfig: { separator: "\n\n", includeLabels: true }
  },
  {
    id: "local.transform",
    version: 1,
    kind: "transform",
    label: "文本转换",
    description: "清理、替换或截取文本",
    category: "数据",
    icon: "wand-sparkles",
    executorId: "local.transform",
    requiredCapabilities: [],
    securityLevel: "local",
    addable: true,
    ports: { inputs: [{ ...inputPort, dataType: "text" }], outputs: [{ ...outputPort, dataType: "text" }] },
    fields: [
      {
        key: "operation",
        label: "转换方式",
        control: "select",
        options: [
          { value: "trim", label: "清理首尾空白" },
          { value: "uppercase", label: "转为大写" },
          { value: "lowercase", label: "转为小写" },
          { value: "replace", label: "文本替换" },
          { value: "before", label: "截取分隔符之前" },
          { value: "after", label: "截取分隔符之后" }
        ]
      },
      { key: "search", label: "查找内容", control: "text" },
      { key: "replacement", label: "替换为", control: "text" },
      { key: "delimiter", label: "分隔符", control: "text" }
    ],
    defaultConfig: { operation: "trim", search: "", replacement: "", delimiter: "" }
  },
  {
    id: "local.human-approval",
    version: 1,
    kind: "approval",
    label: "人工确认",
    description: "暂停执行并等待当前用户确认",
    category: "控制",
    icon: "circle-check-big",
    executorId: "interaction.approval",
    requiredCapabilities: [],
    securityLevel: "approval",
    addable: true,
    ports: { inputs: [{ ...inputPort }], outputs: [{ ...outputPort }] },
    fields: [{ key: "prompt", label: "确认说明", control: "textarea" }],
    defaultConfig: { prompt: "确认继续执行这个工作流吗？" }
  },
  {
    id: "local.bounded-loop",
    version: 1,
    kind: "loop",
    label: "有界循环",
    description: "在浏览器内按固定次数重复模板",
    category: "逻辑",
    icon: "repeat-2",
    executorId: "local.bounded-loop",
    requiredCapabilities: [],
    securityLevel: "local",
    addable: true,
    ports: { inputs: [{ ...inputPort }], outputs: [{ ...outputPort, dataType: "text" }] },
    fields: [
      { key: "iterations", label: "循环次数", control: "number", minimum: 1, maximum: 12, step: 1 },
      { key: "template", label: "循环模板", control: "textarea", placeholder: "第 {{iteration}} 轮：{{input}}" }
    ],
    defaultConfig: { iterations: 3, template: "第 {{iteration}} 轮：\n{{input}}" }
  },
  {
    id: "langflow.unsupported",
    version: 1,
    kind: "unsupported",
    label: "不支持的组件",
    description: "保留导入拓扑，但禁止执行",
    category: "控制",
    icon: "shield-alert",
    executorId: "blocked.unsupported",
    requiredCapabilities: [],
    securityLevel: "blocked",
    addable: false,
    ports: { inputs: [{ ...inputPort }], outputs: [{ ...outputPort }] },
    fields: []
  }
];

const componentById = new Map(workflowComponentCatalog.map((component) => [component.id, component]));
const componentByKind = new Map(workflowComponentCatalog.map((component) => [component.kind, component]));

export const workflowPaletteComponents = workflowComponentCatalog.filter((component) => component.addable);

export function workflowComponentById(id: string | undefined) {
  return id ? componentById.get(id) : undefined;
}

export function workflowComponentForNode(node: Pick<AgentWorkflowNode, "componentId" | "kind">) {
  return workflowComponentById(node.componentId) || componentByKind.get(node.kind) || componentById.get("langflow.unsupported")!;
}

export function workflowComponentIdForKind(kind: AgentWorkflowNodeKind) {
  return componentByKind.get(kind)?.id || "langflow.unsupported";
}

export function workflowPortCompatible(source: WorkflowComponentPort, target: WorkflowComponentPort) {
  return source.dataType === "any" || target.dataType === "any" || source.dataType === target.dataType || target.dataType === "text";
}

type CreateWorkflowNodeOptions = {
  id: string;
  position: { x: number; y: number };
  sequence?: number;
  defaultAgentId?: string;
  knowledgeDocumentIds?: string[];
  knowledgeBaseIds?: string[];
};

export function createWorkflowComponentNode(componentId: string, options: CreateWorkflowNodeOptions): AgentWorkflowNode {
  const component = workflowComponentById(componentId);
  if (!component || !component.addable) throw new Error("该工作流组件不能手动添加。");
  const sequence = Math.max(1, Math.round(options.sequence || 1));
  const node: AgentWorkflowNode = {
    id: options.id,
    kind: component.kind,
    componentId: component.id,
    componentVersion: component.version,
    name: `${component.label} ${sequence}`,
    position: { ...options.position },
    config: component.defaultConfig ? { ...component.defaultConfig } : undefined
  };
  if (component.kind === "agent") {
    node.instruction = "说明这个节点需要完成的任务和输出要求。";
    node.agentId = options.defaultAgentId;
    node.skillIds = [];
  }
  if (component.kind === "template") node.template = "任务：{{task}}\n\n上游内容：\n{{input}}";
  if (component.kind === "knowledge") {
    node.knowledgeDocumentIds = [...(options.knowledgeDocumentIds || [])].slice(0, 1);
    node.knowledgeBaseIds = [...(options.knowledgeBaseIds || [])].slice(0, 1);
    node.maxKnowledgeChunks = 4;
  }
  return node;
}
