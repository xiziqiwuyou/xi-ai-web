import type {
  AgentWorkflowDefinition,
  AgentWorkflowEdge,
  AgentWorkflowNode,
  AgentWorkflowNodeConfig,
  AgentWorkflowNodeKind
} from "../../types";
import { createClientId } from "../../utils/clientId";

export type WorkflowStarterTemplate = {
  id: string;
  name: string;
  description: string;
  category: "通用" | "研究" | "内容" | "数据" | "控制";
  tags: string[];
  nodes: AgentWorkflowNode[];
  edges: AgentWorkflowEdge[];
};

type TemplateNodeOptions = {
  id: string;
  kind: AgentWorkflowNodeKind;
  componentId: string;
  name: string;
  x: number;
  y?: number;
  config?: AgentWorkflowNodeConfig;
  template?: string;
  instruction?: string;
};

function node(options: TemplateNodeOptions): AgentWorkflowNode {
  return {
    id: options.id,
    kind: options.kind,
    componentId: options.componentId,
    componentVersion: 1,
    name: options.name,
    position: { x: options.x, y: options.y ?? 148 },
    config: options.config ? { ...options.config } : undefined,
    template: options.template,
    instruction: options.instruction,
    skillIds: options.kind === "agent" ? [] : undefined,
    knowledgeDocumentIds: options.kind === "knowledge" ? [] : undefined,
    knowledgeBaseIds: options.kind === "knowledge" ? [] : undefined,
    maxKnowledgeChunks: options.kind === "knowledge" ? 4 : undefined
  };
}

function edge(source: string, target: string, sourceHandle = "output"): AgentWorkflowEdge {
  return { id: `${source}-${sourceHandle}-${target}`, source, target, sourceHandle, targetHandle: "input" };
}

const start = (id = "start", y = 148) => node({ id, kind: "start", componentId: "core.start", name: "开始", x: 44, y });
const reply = (id = "reply", x = 1188, y = 148) => node({ id, kind: "reply", componentId: "core.reply", name: "输出结果", x, y });

export const workflowStarterTemplates: readonly WorkflowStarterTemplate[] = [
  {
    id: "starter-general-chat",
    name: "通用模型对话",
    description: "使用当前选择的模型完成一次完整回答。",
    category: "通用",
    tags: ["模型", "对话"],
    nodes: [
      start(),
      node({ id: "model", kind: "model", componentId: "local.language-model", name: "生成回答", x: 330, config: { systemPrompt: "准确理解问题，直接给出清晰、可验证的回答。", temperature: 0.3 } }),
      reply("reply", 616)
    ],
    edges: [edge("start", "model"), edge("model", "reply")]
  },
  {
    id: "starter-prompt-chain",
    name: "提示词加工链",
    description: "先整理用户任务，再交给模型生成结构化成果。",
    category: "内容",
    tags: ["提示词", "写作"],
    nodes: [
      start(),
      node({ id: "prompt", kind: "template", componentId: "core.text-template", name: "整理任务", x: 330, template: "原始任务：\n{{task}}\n\n请围绕以下输入给出目标、受众和输出格式：\n{{input}}" }),
      node({ id: "model", kind: "model", componentId: "local.language-model", name: "生成成果", x: 616, config: { systemPrompt: "严格遵循上游定义的目标和格式。", temperature: 0.4 } }),
      reply("reply", 902)
    ],
    edges: [edge("start", "prompt"), edge("prompt", "model"), edge("model", "reply")]
  },
  {
    id: "starter-knowledge-qa",
    name: "知识库问答",
    description: "检索本地或云知识库，并让模型基于证据回答。",
    category: "研究",
    tags: ["知识库", "RAG"],
    nodes: [
      start(),
      node({ id: "knowledge", kind: "knowledge", componentId: "core.knowledge-retrieval", name: "检索知识", x: 330 }),
      node({ id: "prompt", kind: "template", componentId: "core.text-template", name: "组织证据", x: 616, template: "用户问题：\n{{task}}\n\n检索证据：\n{{input}}\n\n仅依据证据回答，并指出信息缺口。" }),
      node({ id: "model", kind: "model", componentId: "local.language-model", name: "证据回答", x: 902, config: { systemPrompt: "不得编造知识库中不存在的事实。", temperature: 0.2 } }),
      reply("reply", 1188)
    ],
    edges: [edge("start", "knowledge"), edge("knowledge", "prompt"), edge("prompt", "model"), edge("model", "reply")]
  },
  {
    id: "starter-web-research",
    name: "联网研究简报",
    description: "通过独立联网搜索收集资料，再生成研究简报。",
    category: "研究",
    tags: ["联网", "研究"],
    nodes: [
      start(),
      node({ id: "search", kind: "webSearch", componentId: "local.web-search", name: "联网检索", x: 330, config: { instruction: "检索可信且尽量近期的资料，保留来源。", maxResults: 5 } }),
      node({ id: "model", kind: "model", componentId: "local.language-model", name: "整理简报", x: 616, config: { systemPrompt: "区分事实、推断与建议，并保留来源线索。", temperature: 0.2 } }),
      reply("reply", 902)
    ],
    edges: [edge("start", "search"), edge("search", "model"), edge("model", "reply")]
  },
  {
    id: "starter-structured-extraction",
    name: "结构化信息提取",
    description: "让模型输出 JSON，并在本地校验关键字段。",
    category: "数据",
    tags: ["JSON", "提取"],
    nodes: [
      start(),
      node({ id: "prompt", kind: "template", componentId: "core.text-template", name: "定义 JSON", x: 330, template: "从以下输入提取 title、summary、keywords，且只输出 JSON：\n{{input}}" }),
      node({ id: "model", kind: "model", componentId: "local.language-model", name: "提取字段", x: 616, config: { systemPrompt: "只输出有效 JSON，不添加 Markdown。", temperature: 0 } }),
      node({ id: "structured", kind: "structured", componentId: "local.structured-output", name: "校验字段", x: 902, config: { requiredFields: ["title", "summary", "keywords"] } }),
      reply("reply", 1188)
    ],
    edges: [edge("start", "prompt"), edge("prompt", "model"), edge("model", "structured"), edge("structured", "reply")]
  },
  {
    id: "starter-conditional-routing",
    name: "条件内容分流",
    description: "根据输入是否包含指定文本进入不同处理分支。",
    category: "控制",
    tags: ["条件", "分支"],
    nodes: [
      start("start", 220),
      node({ id: "condition", kind: "conditional", componentId: "local.conditional-router", name: "判断紧急程度", x: 330, y: 220, config: { operator: "contains", value: "紧急", caseSensitive: false } }),
      node({ id: "urgent", kind: "model", componentId: "local.language-model", name: "紧急响应", x: 616, y: 90, config: { systemPrompt: "优先给出立即行动和风险控制措施。", temperature: 0.2 } }),
      node({ id: "normal", kind: "model", componentId: "local.language-model", name: "常规处理", x: 616, y: 350, config: { systemPrompt: "给出稳妥、分步骤的常规建议。", temperature: 0.3 } }),
      node({ id: "merge", kind: "merge", componentId: "local.merge", name: "汇总分支", x: 902, y: 220, config: { separator: "\n\n", includeLabels: false } }),
      reply("reply", 1188, 220)
    ],
    edges: [edge("start", "condition"), edge("condition", "urgent", "true"), edge("condition", "normal", "false"), edge("urgent", "merge"), edge("normal", "merge"), edge("merge", "reply")]
  },
  {
    id: "starter-long-document",
    name: "长文切分总结",
    description: "切分长文本后交给模型生成分层摘要。",
    category: "内容",
    tags: ["长文", "摘要"],
    nodes: [
      start(),
      node({ id: "split", kind: "textSplit", componentId: "local.text-splitter", name: "切分长文", x: 330, config: { chunkSize: 1400, overlap: 140 } }),
      node({ id: "model", kind: "model", componentId: "local.language-model", name: "分层总结", x: 616, config: { systemPrompt: "先按片段总结，再合并重复信息形成总览。", temperature: 0.2 } }),
      reply("reply", 902)
    ],
    edges: [edge("start", "split"), edge("split", "model"), edge("model", "reply")]
  },
  {
    id: "starter-dual-review",
    name: "双阶段生成与复核",
    description: "一个模型生成方案，另一个模型复核并修订。",
    category: "通用",
    tags: ["复核", "质量"],
    nodes: [
      start(),
      node({ id: "draft", kind: "model", componentId: "local.language-model", name: "生成初稿", x: 330, config: { systemPrompt: "先完成一份可执行初稿。", temperature: 0.5 } }),
      node({ id: "review", kind: "model", componentId: "local.language-model", name: "复核修订", x: 616, config: { systemPrompt: "检查事实、假设、风险和遗漏，直接输出修订后的最终版本。", temperature: 0.2 } }),
      reply("reply", 902)
    ],
    edges: [edge("start", "draft"), edge("draft", "review"), edge("review", "reply")]
  },
  {
    id: "starter-human-approval",
    name: "人工确认发布",
    description: "生成内容后暂停，确认通过才输出结果。",
    category: "控制",
    tags: ["确认", "发布"],
    nodes: [
      start(),
      node({ id: "model", kind: "model", componentId: "local.language-model", name: "生成待发布内容", x: 330, config: { systemPrompt: "生成可以直接审阅的完整内容。", temperature: 0.4 } }),
      node({ id: "approval", kind: "approval", componentId: "local.human-approval", name: "人工确认", x: 616, config: { prompt: "内容已生成，确认继续输出吗？" } }),
      reply("reply", 902)
    ],
    edges: [edge("start", "model"), edge("model", "approval"), edge("approval", "reply")]
  },
  {
    id: "starter-bounded-iteration",
    name: "有界迭代改写",
    description: "先执行固定次数的本地模板迭代，再由模型完成改写。",
    category: "内容",
    tags: ["循环", "改写"],
    nodes: [
      start(),
      node({ id: "loop", kind: "loop", componentId: "local.bounded-loop", name: "三轮整理", x: 330, config: { iterations: 3, template: "第 {{iteration}} 轮整理：\n{{input}}" } }),
      node({ id: "model", kind: "model", componentId: "local.language-model", name: "最终改写", x: 616, config: { systemPrompt: "综合迭代内容，删除重复并输出最终版本。", temperature: 0.3 } }),
      reply("reply", 902)
    ],
    edges: [edge("start", "loop"), edge("loop", "model"), edge("model", "reply")]
  }
];

function cloneConfig(config: AgentWorkflowNodeConfig | undefined) {
  return config ? Object.fromEntries(Object.entries(config).map(([key, value]) => [key, Array.isArray(value) ? [...value] : value])) : undefined;
}

export function createWorkflowFromTemplate(template: WorkflowStarterTemplate): AgentWorkflowDefinition {
  const suffix = createClientId();
  const workflowId = `workflow-${suffix}`;
  const nodeIds = new Map(template.nodes.map((item) => [item.id, `${workflowId}-${item.id}`]));
  const nodes = template.nodes.map((item): AgentWorkflowNode => ({
    ...item,
    id: nodeIds.get(item.id)!,
    position: { ...item.position },
    config: cloneConfig(item.config),
    skillIds: item.skillIds ? [...item.skillIds] : undefined,
    knowledgeDocumentIds: item.knowledgeDocumentIds ? [...item.knowledgeDocumentIds] : undefined,
    knowledgeBaseIds: item.knowledgeBaseIds ? [...item.knowledgeBaseIds] : undefined
  }));
  const edges = template.edges.map((item): AgentWorkflowEdge => ({
    ...item,
    id: `${workflowId}-${item.id}`,
    source: nodeIds.get(item.source)!,
    target: nodeIds.get(item.target)!
  }));
  const now = new Date().toISOString();
  return {
    id: workflowId,
    name: template.name,
    description: template.description,
    steps: [],
    graph: { version: 1, nodes, edges },
    provenance: {
      kind: "starter-template",
      sourceId: template.id,
      sourceName: template.name,
      importedAt: now
    },
    createdAt: now,
    updatedAt: now
  };
}
