import type { AgentWorkflowNodeConfig, KnowledgeDocument } from "../../types";

const maxTemplateLength = 12000;
const maxKnowledgeOutputLength = 12000;

export function renderWorkflowTemplate(
  template: string,
  task: string,
  input: string,
  variables: Record<string, string | number> = {}
) {
  let rendered = template
    .slice(0, maxTemplateLength)
    .replaceAll("{{task}}", task)
    .replaceAll("{{input}}", input)
    .slice(0, maxTemplateLength);
  for (const [key, value] of Object.entries(variables).slice(0, 20)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(key)) continue;
    rendered = rendered.replaceAll(`{{${key}}}`, String(value).slice(0, 2000));
  }
  return rendered.trim().slice(0, maxTemplateLength);
}

function configString(config: AgentWorkflowNodeConfig | undefined, key: string, fallback = "") {
  const value = config?.[key];
  return typeof value === "string" ? value : fallback;
}

function configNumber(
  config: AgentWorkflowNodeConfig | undefined,
  key: string,
  fallback: number,
  minimum: number,
  maximum: number
) {
  const value = config?.[key];
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : fallback;
}

function configBoolean(config: AgentWorkflowNodeConfig | undefined, key: string, fallback = false) {
  const value = config?.[key];
  return typeof value === "boolean" ? value : fallback;
}

export type WorkflowUpstreamOutput = {
  nodeId: string;
  name: string;
  text: string;
};

export function mergeWorkflowOutputs(outputs: WorkflowUpstreamOutput[], config?: AgentWorkflowNodeConfig) {
  const separator = configString(config, "separator", "\n\n").slice(0, 80);
  const includeLabels = configBoolean(config, "includeLabels", true);
  return outputs
    .filter((output) => output.text)
    .map((output) => includeLabels ? `${output.name}：\n${output.text}` : output.text)
    .join(separator)
    .slice(0, maxTemplateLength);
}

export function evaluateWorkflowCondition(input: string, config?: AgentWorkflowNodeConfig) {
  const operator = configString(config, "operator", "contains");
  const expected = configString(config, "value").slice(0, 2000);
  const caseSensitive = configBoolean(config, "caseSensitive", false);
  const left = caseSensitive ? input : input.toLocaleLowerCase();
  const right = caseSensitive ? expected : expected.toLocaleLowerCase();
  if (operator === "equals") return left.trim() === right.trim();
  if (operator === "notEquals") return left.trim() !== right.trim();
  if (operator === "notContains") return !left.includes(right);
  if (operator === "startsWith") return left.startsWith(right);
  if (operator === "endsWith") return left.endsWith(right);
  if (operator === "isEmpty") return !input.trim();
  if (operator === "isNotEmpty") return Boolean(input.trim());
  return left.includes(right);
}

function stripJsonFence(value: string) {
  const trimmed = value.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match?.[1]?.trim() || trimmed;
}

export function parseWorkflowStructuredOutput(input: string, config?: AgentWorkflowNodeConfig) {
  const candidate = stripJsonFence(input).slice(0, maxTemplateLength);
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    throw new Error("结构化输出节点没有收到有效 JSON。");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("结构化输出节点要求顶层结果为 JSON 对象。");
  }
  const requiredValue = config?.requiredFields;
  const requiredFields = Array.isArray(requiredValue)
    ? requiredValue
    : configString(config, "requiredFields").split(",").map((item) => item.trim()).filter(Boolean);
  const record = parsed as Record<string, unknown>;
  const missing = requiredFields.slice(0, 24).filter((field) => !(field in record));
  if (missing.length) throw new Error(`结构化输出缺少字段：${missing.join("、")}`);
  return JSON.stringify(parsed, null, 2).slice(0, maxTemplateLength);
}

export function splitWorkflowText(input: string, config?: AgentWorkflowNodeConfig) {
  const chunkSize = Math.round(configNumber(config, "chunkSize", 1200, 100, 4000));
  const overlap = Math.round(configNumber(config, "overlap", 120, 0, Math.max(0, chunkSize - 1)));
  const chunks: string[] = [];
  let offset = 0;
  while (offset < input.length && chunks.length < 40) {
    const upper = Math.min(input.length, offset + chunkSize);
    let end = upper;
    if (upper < input.length) {
      const boundary = Math.max(
        input.lastIndexOf("\n", upper),
        input.lastIndexOf("。", upper),
        input.lastIndexOf(". ", upper)
      );
      if (boundary > offset + Math.floor(chunkSize * 0.55)) end = boundary + 1;
    }
    chunks.push(input.slice(offset, end).trim());
    if (end >= input.length) break;
    offset = Math.max(offset + 1, end - overlap);
  }
  return chunks
    .filter(Boolean)
    .map((chunk, index) => `[片段 ${index + 1}/${chunks.length}]\n${chunk}`)
    .join("\n\n")
    .slice(0, maxTemplateLength);
}

export function transformWorkflowText(input: string, config?: AgentWorkflowNodeConfig) {
  const operation = configString(config, "operation", "trim");
  if (operation === "uppercase") return input.toLocaleUpperCase().slice(0, maxTemplateLength);
  if (operation === "lowercase") return input.toLocaleLowerCase().slice(0, maxTemplateLength);
  if (operation === "replace") {
    const search = configString(config, "search").slice(0, 500);
    const replacement = configString(config, "replacement").slice(0, 2000);
    return (search ? input.replaceAll(search, replacement) : input).slice(0, maxTemplateLength);
  }
  if (operation === "before") {
    const delimiter = configString(config, "delimiter").slice(0, 500);
    const index = delimiter ? input.indexOf(delimiter) : -1;
    return (index >= 0 ? input.slice(0, index) : input).trim().slice(0, maxTemplateLength);
  }
  if (operation === "after") {
    const delimiter = configString(config, "delimiter").slice(0, 500);
    const index = delimiter ? input.indexOf(delimiter) : -1;
    return (index >= 0 ? input.slice(index + delimiter.length) : input).trim().slice(0, maxTemplateLength);
  }
  return input.trim().slice(0, maxTemplateLength);
}

export function runBoundedWorkflowLoop(input: string, task: string, config?: AgentWorkflowNodeConfig) {
  const iterations = Math.round(configNumber(config, "iterations", 3, 1, 12));
  const template = configString(config, "template", "第 {{iteration}} 轮：\n{{input}}");
  const results: string[] = [];
  let current = input;
  for (let index = 0; index < iterations; index += 1) {
    current = renderWorkflowTemplate(template, task, current, {
      index,
      iteration: index + 1
    });
    results.push(current);
  }
  return results.map((result, index) => `[循环 ${index + 1}/${iterations}]\n${result}`).join("\n\n").slice(0, maxTemplateLength);
}

function queryTerms(value: string) {
  const normalized = value.toLocaleLowerCase().slice(0, 4000);
  const words = normalized.match(/[\p{L}\p{N}]+/gu) || [];
  const terms = new Set(words.filter((word) => word.length > 1));
  for (const word of words) {
    if (!/[\p{Script=Han}]/u.test(word) || word.length < 3) continue;
    for (let index = 0; index < word.length - 1; index += 1) {
      terms.add(word.slice(index, index + 2));
    }
  }
  return [...terms].slice(0, 80);
}

function occurrenceCount(value: string, term: string) {
  let count = 0;
  let offset = 0;
  while (count < 12) {
    const index = value.indexOf(term, offset);
    if (index < 0) return count;
    count += 1;
    offset = index + term.length;
  }
  return count;
}

export type WorkflowKnowledgeMatch = {
  documentId: string;
  documentName: string;
  chunkId: string;
  index: number;
  score: number;
  text: string;
};

export function retrieveWorkflowKnowledge(
  documents: KnowledgeDocument[],
  documentIds: string[],
  query: string,
  topK = 4
) {
  const selectedIds = new Set(documentIds);
  const terms = queryTerms(query);
  const normalizedQuery = query.trim().toLocaleLowerCase().slice(0, 800);
  const limit = Math.max(1, Math.min(12, Math.round(topK) || 4));
  const matches = documents
    .filter((document) => selectedIds.has(document.id))
    .flatMap((document) => document.chunks.map((chunk): WorkflowKnowledgeMatch => {
      const text = chunk.text.slice(0, 2400);
      const searchable = `${document.name}\n${text}`.toLocaleLowerCase();
      const exactBoost = normalizedQuery.length > 2 && searchable.includes(normalizedQuery) ? 24 : 0;
      const termScore = terms.reduce((score, term) => score + occurrenceCount(searchable, term), 0);
      const titleScore = terms.reduce((score, term) => score + (document.name.toLocaleLowerCase().includes(term) ? 3 : 0), 0);
      return {
        documentId: document.id,
        documentName: document.name,
        chunkId: chunk.id,
        index: chunk.index,
        score: exactBoost + termScore + titleScore,
        text
      };
    }))
    .sort((left, right) => right.score - left.score || left.documentName.localeCompare(right.documentName) || left.index - right.index);

  const ranked = matches.some((match) => match.score > 0)
    ? matches.filter((match) => match.score > 0).slice(0, limit)
    : matches.slice(0, limit);
  const text = ranked.map((match) => (
    `[${match.documentName} · 片段 ${match.index + 1}]\n${match.text.slice(0, 1200)}`
  )).join("\n\n").slice(0, maxKnowledgeOutputLength);

  return { text, matches: ranked };
}
