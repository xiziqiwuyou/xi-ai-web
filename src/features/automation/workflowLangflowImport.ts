import type {
  AgentWorkflowDefinition,
  AgentWorkflowEdge,
  AgentWorkflowNode,
  AgentWorkflowNodeConfig,
  AgentWorkflowNodeKind
} from "../../types";
import { createClientId } from "../../utils/clientId";
import { workflowComponentIdForKind } from "./workflowComponents";

const MAX_JSON_LENGTH = 2_000_000;
const MAX_NODES = 42;
const MAX_EDGES = 80;
const MAX_FIELDS_PER_NODE = 120;
const MAX_WARNINGS = 100;

type UnknownRecord = Record<string, unknown>;
type SupportedNodeKind = Exclude<AgentWorkflowNodeKind, "unsupported">;

type ComponentMapping = {
  kind: SupportedNodeKind;
  componentId: string;
};

type UnsupportedMapping = {
  reason: string;
};

type LocatedLangflowGraph = {
  envelope: UnknownRecord;
  graph: UnknownRecord;
  metadata: UnknownRecord[];
};

type DecodedNode = {
  node: AgentWorkflowNode;
  originalId: string;
  componentType: string;
  supported: boolean;
};

export type LangflowUnsupportedComponentRecord = {
  nodeId: string;
  componentType: string;
  displayName: string;
  reason: string;
};

export type LangflowWorkflowImportResult = {
  workflow: AgentWorkflowDefinition;
  warnings: string[];
  importedCount: number;
  unsupportedComponents: LangflowUnsupportedComponentRecord[];
};

export type LangflowWorkflowImportOptions = {
  workflowId?: string;
  now?: Date | string;
};

export type LangflowImportErrorCode =
  | "invalid_json"
  | "invalid_shape"
  | "graph_too_large";

export class LangflowImportError extends Error {
  readonly code: LangflowImportErrorCode;

  constructor(code: LangflowImportErrorCode, message: string) {
    super(message);
    this.name = "LangflowImportError";
    this.code = code;
  }
}

function recordFrom(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function cleanText(value: unknown, maximum: number, trim = true) {
  if (typeof value !== "string") return "";
  const safe = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
  const text = trim ? safe.trim() : safe;
  return text.slice(0, maximum);
}

function cleanFiniteNumber(value: unknown, fallback: number, minimum: number, maximum: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : fallback;
}

function normalizedToken(value: string) {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "");
}

function parseJsonText(value: string, context: string): unknown {
  if (value.length > MAX_JSON_LENGTH) {
    throw new LangflowImportError("graph_too_large", `${context} exceeds the ${MAX_JSON_LENGTH} character import limit.`);
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new LangflowImportError("invalid_json", `${context} is not valid JSON.`);
  }
}

function parseMaybeJson(value: unknown, context: string) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return value;
  return parseJsonText(trimmed, context);
}

function singleFlow(value: unknown) {
  if (!Array.isArray(value)) return value;
  if (value.length !== 1) {
    throw new LangflowImportError("invalid_shape", "Import exactly one Langflow workflow at a time.");
  }
  return value[0];
}

function locateLangflowGraph(input: unknown): LocatedLangflowGraph {
  const parsed = singleFlow(typeof input === "string" ? parseJsonText(input, "Langflow workflow") : input);
  let envelope = recordFrom(parsed);
  if (!envelope) throw new LangflowImportError("invalid_shape", "Langflow workflow must be a JSON object.");

  const flows = envelope.flows;
  if (Array.isArray(flows)) {
    const selected = singleFlow(flows);
    const selectedRecord = recordFrom(selected);
    if (!selectedRecord) throw new LangflowImportError("invalid_shape", "Langflow flows envelope is invalid.");
    envelope = selectedRecord;
  }

  const flow = recordFrom(parseMaybeJson(envelope.flow, "Langflow flow"));
  const payload = recordFrom(parseMaybeJson(envelope.payload, "Langflow payload"));
  const result = recordFrom(parseMaybeJson(envelope.result, "Langflow result"));
  const envelopeData = recordFrom(parseMaybeJson(envelope.data, "Langflow data"));
  const flowData = recordFrom(parseMaybeJson(flow?.data, "Langflow flow data"));
  const payloadData = recordFrom(parseMaybeJson(payload?.data, "Langflow payload data"));
  const resultData = recordFrom(parseMaybeJson(result?.data, "Langflow result data"));
  const nestedEnvelopeData = recordFrom(parseMaybeJson(envelopeData?.data, "Nested Langflow data"));
  const graphCandidates = [
    envelope,
    envelopeData,
    nestedEnvelopeData,
    flow,
    flowData,
    payload,
    payloadData,
    result,
    resultData,
    recordFrom(parseMaybeJson(envelope.graph, "Langflow graph"))
  ];
  const graph = graphCandidates.find((candidate) => candidate && Array.isArray(candidate.nodes));
  if (!graph) {
    throw new LangflowImportError("invalid_shape", "No React Flow nodes array was found in the Langflow workflow.");
  }
  return {
    envelope,
    graph,
    metadata: [envelope, flow, payload, result, envelopeData].filter((value): value is UnknownRecord => Boolean(value))
  };
}

function warningCollector() {
  const warnings: string[] = [];
  const seen = new Set<string>();
  return {
    warnings,
    add(message: string) {
      const warning = cleanText(message, 500);
      if (!warning || seen.has(warning) || warnings.length >= MAX_WARNINGS) return;
      seen.add(warning);
      warnings.push(warning);
    }
  };
}

function unwrapField(value: unknown) {
  const descriptor = recordFrom(value);
  if (!descriptor) return value;
  if (Object.prototype.hasOwnProperty.call(descriptor, "value")) return descriptor.value;
  if (Object.prototype.hasOwnProperty.call(descriptor, "default")) return descriptor.default;
  if (Object.prototype.hasOwnProperty.call(descriptor, "default_value")) return descriptor.default_value;
  return value;
}

function createFieldReader(rawNode: UnknownRecord) {
  const data = recordFrom(rawNode.data);
  const component = recordFrom(data?.node) || recordFrom(data?.component);
  const componentTemplate = recordFrom(component?.template);
  const dataTemplate = recordFrom(data?.template);
  const fields = new Map<string, unknown>();

  const addSource = (source: UnknownRecord | null) => {
    if (!source || fields.size >= MAX_FIELDS_PER_NODE) return;
    for (const [key, value] of Object.entries(source).slice(0, MAX_FIELDS_PER_NODE)) {
      const normalized = normalizedToken(key);
      if (!normalized || fields.has(normalized)) continue;
      fields.set(normalized, unwrapField(value));
      if (fields.size >= MAX_FIELDS_PER_NODE) break;
    }
  };

  addSource(componentTemplate);
  addSource(dataTemplate);
  addSource(component);
  addSource(data);
  addSource(rawNode);

  const get = (...aliases: string[]) => {
    for (const alias of aliases) {
      const value = fields.get(normalizedToken(alias));
      if (value !== undefined) return value;
    }
    return undefined;
  };

  return {
    data,
    component,
    keys: new Set(fields.keys()),
    get
  };
}

type FieldReader = ReturnType<typeof createFieldReader>;

function fieldString(reader: FieldReader, aliases: string[], maximum: number, trim = true) {
  return cleanText(reader.get(...aliases), maximum, trim);
}

function fieldNumber(
  reader: FieldReader,
  aliases: string[],
  fallback: number,
  minimum: number,
  maximum: number
) {
  return cleanFiniteNumber(reader.get(...aliases), fallback, minimum, maximum);
}

function fieldBoolean(reader: FieldReader, aliases: string[], fallback: boolean) {
  const value = reader.get(...aliases);
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLocaleLowerCase();
    if (normalized === "true" || normalized === "yes" || normalized === "1") return true;
    if (normalized === "false" || normalized === "no" || normalized === "0") return false;
  }
  return fallback;
}

function fieldStringList(reader: FieldReader, aliases: string[], maximumItems: number, maximumLength: number) {
  const value = reader.get(...aliases);
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  return [...new Set(values
    .slice(0, maximumItems)
    .map((item) => cleanText(item, maximumLength))
    .filter(Boolean))];
}

function firstMetadataText(metadata: UnknownRecord[], aliases: string[], maximum: number) {
  for (const source of metadata) {
    for (const alias of aliases) {
      const value = cleanText(source[alias], maximum);
      if (value) return value;
    }
  }
  return "";
}

function componentIdentity(rawNode: UnknownRecord, reader: FieldReader, index: number) {
  const candidates = [
    reader.data?.componentType,
    reader.data?.component_type,
    reader.data?.type,
    reader.component?.componentType,
    reader.component?.component_type,
    reader.component?.type,
    rawNode.componentType,
    rawNode.component_type,
    rawNode.type
  ];
  const genericTokens = new Set(["genericnode", "customnode", "defaultnode", "node"]);
  let genericFallback = "";
  for (const candidate of candidates) {
    const text = cleanText(candidate, 180);
    if (!text) continue;
    if (!genericTokens.has(normalizedToken(text))) return text;
    if (!genericFallback) genericFallback = text;
  }

  const rawId = cleanText(rawNode.id, 500);
  const idPrefix = cleanText(rawId.match(/^([a-z][a-z0-9_]*)[-_:]/i)?.[1], 180);
  const displayName = cleanText(
    reader.component?.display_name ?? reader.component?.displayName ?? reader.data?.display_name ?? reader.data?.displayName,
    180
  );
  return idPrefix || displayName || genericFallback || `UnknownComponent${index + 1}`;
}

function componentDisplayName(rawNode: UnknownRecord, reader: FieldReader, componentType: string) {
  return cleanText(
    reader.component?.display_name ??
      reader.component?.displayName ??
      reader.data?.display_name ??
      reader.data?.displayName ??
      reader.data?.label ??
      rawNode.label ??
      rawNode.name,
    160
  ) || cleanText(componentType, 160) || "Unsupported Langflow component";
}

const blockedComponentPatterns = [
  "customcomponent",
  "python",
  "javascript",
  "typescript",
  "codeexecution",
  "codeinterpreter",
  "shell",
  "powershell",
  "filesystem",
  "filemanager",
  "directoryloader",
  "sqldatabase",
  "sqlagent",
  "csvagent",
  "databaseagent"
];

const modelProviderPatterns = [
  "openai",
  "anthropic",
  "claude",
  "azureopenai",
  "bedrock",
  "cohere",
  "deepseek",
  "gemini",
  "googleai",
  "googlevertex",
  "groq",
  "huggingface",
  "lmstudio",
  "mistral",
  "moonshot",
  "novita",
  "nvidia",
  "ollama",
  "openrouter",
  "perplexity",
  "qianfan",
  "qwen",
  "sambanova",
  "vertexai",
  "watsonx",
  "xai",
  "zhipu"
];

function mappingForComponent(componentType: string): ComponentMapping | UnsupportedMapping {
  const token = normalizedToken(componentType);
  const supported = (kind: SupportedNodeKind): ComponentMapping => ({ kind, componentId: workflowComponentIdForKind(kind) });

  if (blockedComponentPatterns.some((pattern) => token.includes(pattern))) {
    return { reason: "Executable, database, or filesystem Langflow components cannot run in the browser workspace." };
  }
  if (["chatinput", "chatinputcomponent", "messageinput", "messageinputcomponent"].includes(token)) return supported("start");
  if (["chatoutput", "chatoutputcomponent", "messageoutput", "messageoutputcomponent"].includes(token)) return supported("reply");
  if (
    ["conditionalrouter", "conditionalroutercomponent", "ifelse", "ifelsecomponent", "conditionrouter", "routercomponent"].includes(token) ||
    (token.includes("conditional") && token.includes("router"))
  ) return supported("conditional");
  if (
    ["structuredoutput", "structuredoutputcomponent", "structuredoutputparser", "outputparser"].includes(token) ||
    token.includes("structuredoutput")
  ) return supported("structured");
  if (
    ["humaninput", "humaninputcomponent", "humanintheloop", "askuser", "promptuser", "inputrequest"].includes(token) ||
    token.includes("humanapproval")
  ) return supported("approval");
  if (["loop", "loopcomponent", "foreach", "foreachcomponent", "iteration", "iterator"].includes(token)) return supported("loop");
  if (
    token.includes("textsplitter") ||
    ["splitcharacters", "splittext", "recursivecharactertextsplitter", "charactertextsplitter", "tokentextsplitter"].includes(token)
  ) return supported("textSplit");
  if (
    token.includes("retriever") ||
    token.includes("knowledgebase") ||
    ["knowledge", "knowledgecomponent", "knowledgebase", "vectorknowledge"].includes(token)
  ) return supported("knowledge");
  if (
    token.includes("websearch") ||
    token.includes("tavily") ||
    token.includes("duckduckgo") ||
    token.includes("serper") ||
    token.includes("searchapi") ||
    token.includes("googlesearch") ||
    token.includes("bingsearch") ||
    token.includes("exasearch")
  ) return supported("webSearch");
  if (
    ["merge", "mergecomponent", "mergedata", "mergetext", "combinetext", "combineoutputs", "combinecomponents"].includes(token) ||
    token.startsWith("merge")
  ) return supported("merge");
  if (
    ["transform", "transformcomponent", "texttransform", "datatotext", "texttodata", "parsedata", "altermetadata"].includes(token) ||
    token.startsWith("transform")
  ) return supported("transform");
  if (
    ["prompt", "promptcomponent", "prompttemplate", "chatprompttemplate", "messageprompt", "texttemplate"].includes(token) ||
    token.endsWith("prompttemplate")
  ) return supported("template");
  if (
    ["agent", "agentcomponent", "toolcallingagent", "toolcallingagentcomponent", "reactagent", "openaitoolsagent"].includes(token)
  ) return supported("agent");
  if (
    ["llm", "model", "chatmodel", "languagemodel", "languagemodelcomponent"].includes(token) ||
    modelProviderPatterns.some((provider) => token.includes(provider)) &&
      (token.includes("model") || token.includes("chat") || token === "openai" || token === "ollama")
  ) return supported("model");
  return { reason: "This Langflow component has no controlled local equivalent." };
}

const sensitiveFieldTokens = [
  "apikey",
  "apitoken",
  "accesstoken",
  "password",
  "secret",
  "credential",
  "baseurl",
  "apiurl",
  "endpointurl",
  "filepath",
  "directorypath",
  "sourcecode",
  "pythoncode",
  "javascriptcode",
  "sqlquery"
];

function containsSensitiveFields(reader: FieldReader) {
  return [...reader.keys].some((key) => sensitiveFieldTokens.some((token) => key.includes(token)));
}

function compactConfig(config: AgentWorkflowNodeConfig) {
  return Object.keys(config).length ? config : undefined;
}

function normalizeConditionOperator(value: string) {
  const token = normalizedToken(value);
  if (["equal", "equals", "eq", "is"].includes(token)) return "equals";
  if (["notequal", "notequals", "neq", "isnot"].includes(token)) return "notEquals";
  if (["notcontains", "doesnotcontain"].includes(token)) return "notContains";
  if (["startswith", "beginswith"].includes(token)) return "startsWith";
  if (["endswith"].includes(token)) return "endsWith";
  if (["isempty", "empty"].includes(token)) return "isEmpty";
  if (["isnotempty", "notempty"].includes(token)) return "isNotEmpty";
  return "contains";
}

function normalizeTransformOperation(value: string) {
  const token = normalizedToken(value);
  if (["uppercase", "upper"].includes(token)) return "uppercase";
  if (["lowercase", "lower"].includes(token)) return "lowercase";
  if (["replace", "replaceall"].includes(token)) return "replace";
  if (["before", "substringbefore"].includes(token)) return "before";
  if (["after", "substringafter"].includes(token)) return "after";
  return "trim";
}

function schemaFieldNames(reader: FieldReader) {
  const direct = fieldStringList(reader, ["required_fields", "requiredFields", "fields"], 24, 80);
  if (direct.length) return direct;
  const schema = recordFrom(reader.get("output_schema", "schema", "json_schema"));
  const properties = recordFrom(schema?.properties) || schema;
  if (!properties) return [];
  return Object.keys(properties)
    .slice(0, 24)
    .map((key) => cleanText(key, 80))
    .filter(Boolean);
}

function modelProvider(componentType: string) {
  const token = normalizedToken(componentType);
  return modelProviderPatterns.find((provider) => token.includes(provider)) || "langflow";
}

function configureSupportedNode(
  node: AgentWorkflowNode,
  reader: FieldReader,
  componentType: string,
  addWarning: (message: string) => void
) {
  const config: AgentWorkflowNodeConfig = {};
  if (node.kind === "template") {
    node.template = fieldString(
      reader,
      ["template", "prompt", "prompt_template", "system_prompt", "system_message"],
      12_000,
      false
    ) || "{{input}}";
    if (node.template === "{{input}}") addWarning(`Prompt node "${node.name}" had no readable template; a pass-through template was used.`);
  } else if (node.kind === "agent") {
    node.instruction = fieldString(
      reader,
      ["agent_instructions", "instructions", "system_prompt", "system_message", "prompt", "description"],
      12_000,
      false
    ) || "Complete the requested task using the upstream workflow input.";
    node.skillIds = [];
    addWarning(`Agent node "${node.name}" must be bound to a local agent before it can run.`);
  } else if (node.kind === "model") {
    config.provider = fieldString(reader, ["provider", "model_provider"], 80) || modelProvider(componentType);
    const model = fieldString(reader, ["model_name", "model", "model_id"], 240);
    if (model) config.model = model;
    config.temperature = fieldNumber(reader, ["temperature"], 0.2, 0, 2);
    config.maxTokens = Math.round(fieldNumber(reader, ["max_tokens", "max_output_tokens"], 4096, 1, 100_000));
    const systemPrompt = fieldString(reader, ["system_prompt", "system_message"], 4_000, false);
    if (systemPrompt) config.systemPrompt = systemPrompt;
    addWarning(`Language model node "${node.name}" uses the local model selected at run time; imported credentials were not retained.`);
  } else if (node.kind === "conditional") {
    config.operator = normalizeConditionOperator(fieldString(reader, ["operator", "comparison_operator"], 80));
    config.value = fieldString(reader, ["match_text", "compare_value", "value", "expected"], 2_000, false);
    config.caseSensitive = fieldBoolean(reader, ["case_sensitive", "caseSensitive"], false);
  } else if (node.kind === "structured") {
    const requiredFields = schemaFieldNames(reader);
    if (requiredFields.length) config.requiredFields = requiredFields;
  } else if (node.kind === "webSearch") {
    config.maxResults = Math.round(fieldNumber(reader, ["max_results", "num_results", "result_count", "k"], 5, 1, 10));
    addWarning(`Web search node "${node.name}" requires the workspace's session-only search configuration.`);
  } else if (node.kind === "knowledge") {
    node.knowledgeDocumentIds = [];
    node.knowledgeBaseIds = [];
    node.maxKnowledgeChunks = Math.round(fieldNumber(reader, ["top_k", "k", "max_chunks"], 4, 1, 12));
    addWarning(`Knowledge node "${node.name}" must be linked to local documents or cloud knowledge bases.`);
  } else if (node.kind === "textSplit") {
    config.chunkSize = Math.round(fieldNumber(reader, ["chunk_size", "chunkSize"], 1_200, 100, 4_000));
    config.overlap = Math.round(fieldNumber(reader, ["chunk_overlap", "overlap"], 120, 0, Math.max(0, Number(config.chunkSize) - 1)));
  } else if (node.kind === "merge") {
    config.separator = fieldString(reader, ["separator", "delimiter"], 80, false) || "\n\n";
    config.includeLabels = fieldBoolean(reader, ["include_labels", "includeLabels"], true);
  } else if (node.kind === "transform") {
    config.operation = normalizeTransformOperation(fieldString(reader, ["operation", "mode", "transform"], 80));
    const search = fieldString(reader, ["search", "search_text"], 500, false);
    const replacement = fieldString(reader, ["replacement", "replace_with"], 2_000, false);
    const delimiter = fieldString(reader, ["delimiter", "separator"], 500, false);
    if (search) config.search = search;
    if (replacement) config.replacement = replacement;
    if (delimiter) config.delimiter = delimiter;
  } else if (node.kind === "approval") {
    config.prompt = fieldString(reader, ["prompt", "message", "question", "description"], 2_000, false) || "Approve this workflow step?";
    config.allowReject = fieldBoolean(reader, ["allow_reject", "allowReject"], true);
  } else if (node.kind === "loop") {
    config.iterations = Math.round(fieldNumber(reader, ["iterations", "max_iterations", "max_loops"], 3, 1, 12));
    config.template = fieldString(reader, ["template", "loop_template", "prompt"], 12_000, false) || "Iteration {{iteration}}:\n{{input}}";
  }
  node.config = compactConfig(config);
}

function uniqueId(baseValue: string, used: Set<string>, maximum: number) {
  const fallback = "langflow-item";
  const base = cleanText(baseValue, maximum) || fallback;
  let candidate = base;
  let sequence = 2;
  while (used.has(candidate)) {
    const suffix = `-${sequence}`;
    candidate = `${base.slice(0, Math.max(1, maximum - suffix.length))}${suffix}`;
    sequence += 1;
  }
  used.add(candidate);
  return candidate;
}

function decodePosition(rawNode: UnknownRecord, index: number) {
  const position = recordFrom(rawNode.position) || recordFrom(recordFrom(rawNode.data)?.position);
  return {
    x: cleanFiniteNumber(position?.x, 44 + (index % 6) * 286, -100_000, 100_000),
    y: cleanFiniteNumber(position?.y, 148 + Math.floor(index / 6) * 180, -100_000, 100_000)
  };
}

function handleRecord(value: unknown) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length <= 4_000 && trimmed.startsWith("{") && trimmed.endsWith("}")) {
      try {
        return recordFrom(JSON.parse(trimmed) as unknown);
      } catch {
        return null;
      }
    }
  }
  return recordFrom(value);
}

function handleHint(value: unknown) {
  const source = handleRecord(value);
  if (source) {
    const candidates = [
      source.name,
      source.fieldName,
      source.field_name,
      source.outputName,
      source.output_name,
      source.port,
      source.handle,
      source.key
    ];
    for (const candidate of candidates) {
      const text = cleanText(candidate, 120);
      if (text) return text;
    }
    return "";
  }
  return cleanText(value, 120);
}

function normalizeSourceHandle(node: AgentWorkflowNode, value: unknown) {
  if (node.kind !== "conditional") return "output";
  const token = normalizedToken(handleHint(value));
  if (token.includes("false") || token.includes("else") || token.includes("negative") || token === "no") return "false";
  if (token.includes("true") || token.includes("positive") || token === "yes") return "true";
  return "true";
}

function edgeEndpoint(edge: UnknownRecord, side: "source" | "target") {
  const data = recordFrom(edge.data);
  const aliases = side === "source"
    ? [edge.source, edge.sourceId, edge.source_id, edge.sourceNode, data?.source, data?.sourceId]
    : [edge.target, edge.targetId, edge.target_id, edge.targetNode, data?.target, data?.targetId];
  for (const value of aliases) {
    const nested = recordFrom(value);
    const text = cleanText(nested?.id ?? value, 500);
    if (text) return text;
  }
  return "";
}

function edgeHandle(edge: UnknownRecord, side: "source" | "target") {
  const data = recordFrom(edge.data);
  return side === "source"
    ? edge.sourceHandle ?? edge.source_handle ?? data?.sourceHandle ?? data?.source_handle
    : edge.targetHandle ?? edge.target_handle ?? data?.targetHandle ?? data?.target_handle;
}

function resolveNow(value: Date | string | undefined) {
  const date = value instanceof Date ? value : value ? new Date(value) : new Date();
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

function workflowIdFor(sourceId: string, name: string, requestedId: string | undefined) {
  const exact = cleanText(requestedId, 140);
  if (exact) return exact;
  const slug = (sourceId || name)
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "workflow";
  const suffix = createClientId().slice(0, 8);
  return cleanText(`langflow-${slug}-${suffix}`, 140);
}

function decodeViewport(graph: UnknownRecord) {
  const viewport = recordFrom(graph.viewport);
  if (!viewport) return undefined;
  const x = Number(viewport.x);
  const y = Number(viewport.y);
  const zoom = Number(viewport.zoom);
  if (![x, y, zoom].every(Number.isFinite)) return undefined;
  return {
    x: Math.max(-100_000, Math.min(100_000, x)),
    y: Math.max(-100_000, Math.min(100_000, y)),
    zoom: Math.max(0.2, Math.min(2, zoom))
  };
}

export function decodeLangflowWorkflow(
  input: unknown,
  options: LangflowWorkflowImportOptions = {}
): LangflowWorkflowImportResult {
  const located = locateLangflowGraph(input);
  const rawNodes = located.graph.nodes as unknown[];
  const rawEdges = located.graph.edges === undefined ? [] : located.graph.edges;
  if (!Array.isArray(rawEdges)) {
    throw new LangflowImportError("invalid_shape", "Langflow graph edges must be an array when present.");
  }
  if (rawNodes.length > MAX_NODES || rawEdges.length > MAX_EDGES) {
    throw new LangflowImportError(
      "graph_too_large",
      `Langflow graph exceeds the ${MAX_NODES} node or ${MAX_EDGES} edge import limit.`
    );
  }

  const { warnings, add: addWarning } = warningCollector();
  if (located.graph.edges === undefined) addWarning("The Langflow graph had no edges array; it was imported as an unconnected graph.");
  const unsupportedComponents: LangflowUnsupportedComponentRecord[] = [];
  const usedNodeIds = new Set<string>();
  const rawIdToNodeId = new Map<string, string>();
  const decodedNodes: DecodedNode[] = [];
  let seenStart = false;
  let seenReply = false;
  let importedCount = 0;

  for (const [index, rawValue] of rawNodes.entries()) {
    const rawNode = recordFrom(rawValue);
    const source = rawNode || {};
    const reader = createFieldReader(source);
    const componentType = componentIdentity(source, reader, index);
    const displayName = componentDisplayName(source, reader, componentType);
    const originalId = cleanText(source.id, 500);
    const fallbackId = `langflow-node-${index + 1}`;
    const nodeId = uniqueId(originalId || fallbackId, usedNodeIds, 140);
    if (!rawNode) addWarning(`Langflow node ${index + 1} was not an object and was preserved as unsupported.`);
    if (!originalId) addWarning(`Langflow node ${index + 1} had no ID; generated "${nodeId}".`);
    if (originalId) {
      if (rawIdToNodeId.has(originalId)) {
        addWarning(`Duplicate Langflow node ID "${cleanText(originalId, 140)}" was renamed to "${nodeId}"; edges remain attached to the first node.`);
      } else {
        rawIdToNodeId.set(originalId, nodeId);
      }
    }

    const mapping = mappingForComponent(componentType);
    let unsupportedReason = "reason" in mapping ? mapping.reason : "";
    if (!("reason" in mapping) && mapping.kind === "start") {
      if (seenStart) unsupportedReason = "Native workflows support one Chat Input boundary; this additional input was preserved as unsupported.";
      seenStart = true;
    }
    if (!("reason" in mapping) && mapping.kind === "reply") {
      if (seenReply) unsupportedReason = "Native workflows support one Chat Output boundary; this additional output was preserved as unsupported.";
      seenReply = true;
    }

    const supported = !("reason" in mapping) && !unsupportedReason;
    const node: AgentWorkflowNode = supported
      ? {
          id: nodeId,
          kind: mapping.kind,
          componentId: mapping.componentId,
          componentVersion: 1,
          name: displayName,
          position: decodePosition(source, index)
        }
      : {
          id: nodeId,
          kind: "unsupported",
          componentId: workflowComponentIdForKind("unsupported"),
          componentVersion: 1,
          name: displayName,
          position: decodePosition(source, index),
          config: {
            originalType: cleanText(componentType, 180),
            reason: cleanText(unsupportedReason || "This Langflow node is malformed.", 500)
          }
        };

    if (supported) {
      importedCount += 1;
      configureSupportedNode(node, reader, componentType, addWarning);
      if (containsSensitiveFields(reader)) {
        addWarning(`Sensitive connection, credential, path, or code fields on "${node.name}" were intentionally not imported.`);
      }
    } else {
      const reason = unsupportedReason || "This Langflow node is malformed.";
      unsupportedComponents.push({ nodeId, componentType, displayName, reason });
      addWarning(`Unsupported Langflow component "${displayName}" (${componentType}) was preserved as a blocked node.`);
    }
    decodedNodes.push({ node, originalId, componentType, supported });
  }

  const missingBoundaries = Number(!decodedNodes.some(({ node }) => node.kind === "start")) +
    Number(!decodedNodes.some(({ node }) => node.kind === "reply"));
  if (decodedNodes.length + missingBoundaries > MAX_NODES) {
    throw new LangflowImportError(
      "graph_too_large",
      `Langflow graph leaves no room for the required native Start and Reply boundaries within the ${MAX_NODES} node limit.`
    );
  }

  const nodes = decodedNodes.map(({ node }) => node);
  const minX = nodes.length ? Math.min(...nodes.map((node) => node.position.x)) : 330;
  const maxX = nodes.length ? Math.max(...nodes.map((node) => node.position.x)) : 44;
  let start = nodes.find((node) => node.kind === "start");
  if (!start) {
    const id = uniqueId("langflow-start", usedNodeIds, 140);
    start = {
      id,
      kind: "start",
      componentId: workflowComponentIdForKind("start"),
      componentVersion: 1,
      name: "Chat Input",
      position: { x: minX - 286, y: 148 }
    };
    nodes.unshift(start);
    addWarning("No Chat Input component was found; a native Start node was added.");
  }
  let reply = nodes.find((node) => node.kind === "reply");
  if (!reply) {
    const id = uniqueId("langflow-reply", usedNodeIds, 140);
    reply = {
      id,
      kind: "reply",
      componentId: workflowComponentIdForKind("reply"),
      componentVersion: 1,
      name: "Chat Output",
      position: { x: maxX + 286, y: 148 }
    };
    nodes.push(reply);
    addWarning("No Chat Output component was found; a native Reply node was added.");
  }

  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const usedEdgeIds = new Set<string>();
  const edgePairs = new Set<string>();
  const edges: AgentWorkflowEdge[] = [];
  for (const [index, rawValue] of rawEdges.entries()) {
    const rawEdge = recordFrom(rawValue);
    if (!rawEdge) {
      addWarning(`Langflow edge ${index + 1} was not an object and was skipped.`);
      continue;
    }
    const originalSource = edgeEndpoint(rawEdge, "source");
    const originalTarget = edgeEndpoint(rawEdge, "target");
    const sourceId = rawIdToNodeId.get(originalSource) || (nodeMap.has(cleanText(originalSource, 140)) ? cleanText(originalSource, 140) : "");
    const targetId = rawIdToNodeId.get(originalTarget) || (nodeMap.has(cleanText(originalTarget, 140)) ? cleanText(originalTarget, 140) : "");
    const sourceNode = nodeMap.get(sourceId);
    const targetNode = nodeMap.get(targetId);
    if (!sourceNode || !targetNode) {
      addWarning(`Langflow edge ${index + 1} referenced a missing node and was skipped.`);
      continue;
    }
    if (sourceNode.id === targetNode.id) {
      addWarning(`Self-referencing edge on "${sourceNode.name}" was skipped.`);
      continue;
    }
    if (sourceNode.kind === "reply" || targetNode.kind === "start") {
      addWarning(`Boundary-invalid edge ${index + 1} was skipped to keep Start and Reply directional.`);
      continue;
    }
    const sourceHandle = normalizeSourceHandle(sourceNode, edgeHandle(rawEdge, "source"));
    const targetHandle = "input";
    const pair = `${sourceNode.id}->${targetNode.id}`;
    if (edgePairs.has(pair)) {
      addWarning(`Duplicate connection "${pair}" was imported once.`);
      continue;
    }
    edgePairs.add(pair);
    const rawEdgeId = cleanText(rawEdge.id, 220);
    edges.push({
      id: uniqueId(rawEdgeId || `${pair}:${sourceHandle}->${targetHandle}`, usedEdgeIds, 220),
      source: sourceNode.id,
      target: targetNode.id,
      sourceHandle,
      targetHandle
    });
  }

  const appendBoundaryEdge = (sourceNode: AgentWorkflowNode, targetNode: AgentWorkflowNode) => {
    const pair = `${sourceNode.id}->${targetNode.id}`;
    if (edgePairs.has(pair)) return;
    if (edges.length >= MAX_EDGES) {
      throw new LangflowImportError(
        "graph_too_large",
        `Langflow graph leaves no room for required boundary connections within the ${MAX_EDGES} edge limit.`
      );
    }
    edgePairs.add(pair);
    edges.push({
      id: uniqueId(`${pair}:output->input`, usedEdgeIds, 220),
      source: sourceNode.id,
      target: targetNode.id,
      sourceHandle: "output",
      targetHandle: "input"
    });
  };

  const processingNodes = nodes.filter((node) => node.id !== start.id && node.id !== reply.id);
  if (!processingNodes.length) {
    appendBoundaryEdge(start, reply);
  } else {
    const roots = processingNodes.filter((node) => !edges.some((edge) => edge.target === node.id));
    const rootCandidates = roots.length
      ? roots
      : edges.some((edge) => edge.source === start.id)
        ? []
        : [...processingNodes].sort((left, right) => left.position.x - right.position.x || left.position.y - right.position.y).slice(0, 1);
    for (const root of rootCandidates) appendBoundaryEdge(start, root);
    if (rootCandidates.length) addWarning(`Connected ${rootCandidates.length} unbound graph root${rootCandidates.length === 1 ? "" : "s"} to Start.`);

    const leaves = processingNodes.filter((node) => !edges.some((edge) => edge.source === node.id));
    const leafCandidates = leaves.length
      ? leaves
      : edges.some((edge) => edge.target === reply.id)
        ? []
        : [...processingNodes].sort((left, right) => right.position.x - left.position.x || right.position.y - left.position.y).slice(0, 1);
    for (const leaf of leafCandidates) appendBoundaryEdge(leaf, reply);
    if (leafCandidates.length) addWarning(`Connected ${leafCandidates.length} unbound graph leaf${leafCandidates.length === 1 ? "" : "s"} to Reply.`);
  }

  const name = firstMetadataText(located.metadata, ["name", "flow_name", "title"], 160) || "Imported Langflow workflow";
  const description = firstMetadataText(located.metadata, ["description", "flow_description"], 1_000);
  const sourceId = firstMetadataText(located.metadata, ["id", "flow_id", "flowId"], 180);
  const timestamp = resolveNow(options.now);
  const unsupportedTypes = [...new Set(unsupportedComponents.map((item) => item.componentType))].slice(0, 80);
  const workflowId = workflowIdFor(sourceId, name, options.workflowId);
  const workflow: AgentWorkflowDefinition = {
    id: workflowId,
    name,
    description: description || undefined,
    steps: nodes
      .filter((node) => node.kind === "agent")
      .map((node) => ({
        id: node.id,
        name: node.name,
        instruction: node.instruction || "Complete the requested task using the upstream workflow input.",
        agentId: node.agentId,
        skillIds: [...(node.skillIds || [])],
        usePreviousOutput: edges.some((edge) => edge.target === node.id && edge.source !== start.id)
      })),
    graph: {
      version: 1,
      nodes,
      edges,
      viewport: decodeViewport(located.graph)
    },
    provenance: {
      kind: "langflow",
      sourceId: sourceId || undefined,
      sourceName: name,
      importedAt: timestamp,
      license: "MIT",
      unsupportedComponents: unsupportedTypes
    },
    createdAt: timestamp,
    updatedAt: timestamp
  };

  return { workflow, warnings, importedCount, unsupportedComponents };
}

export const importLangflowWorkflow = decodeLangflowWorkflow;
