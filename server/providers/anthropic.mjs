import {
  assertCapability,
  consumeSseEvents,
  dataUrlPayload,
  fetchJson,
  hasImageContent,
  normalizeTools,
  parseProviderJsonText,
  providerUrl,
  stringifyToolOutput
} from "./types.mjs";

function authHeaders(provider) {
  return {
    "x-api-key": provider.apiKey || "",
    "anthropic-version": "2023-06-01"
  };
}

function normalizeContent(content) {
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (part?.type === "image" && part.dataUrl) {
          const payload = dataUrlPayload(part.dataUrl);
          if (!payload) return null;
          return {
            type: "image",
            source: {
              type: "base64",
              media_type: payload.mimeType,
              data: payload.base64
            }
          };
        }
        return { type: "text", text: String(part?.text || "") };
      })
      .filter(Boolean);
  }
  return [{ type: "text", text: String(content || "") }];
}

function mapMessages(messages = []) {
  const system = messages.find((message) => message.role === "system")?.content || "";
  const mapped = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: normalizeContent(message.content)
    }));
  return { system, messages: mapped };
}

function mapHostedTools(hostedTools = []) {
  return (Array.isArray(hostedTools) ? hostedTools : []).map((tool) => {
    if (tool.name === "web_search") {
      return { type: "web_search_20250305", name: "web_search", max_uses: 5 };
    }
    if (tool.name === "url_context") {
      return {
        type: "web_fetch_20250910",
        name: "web_fetch",
        max_uses: 5,
        citations: { enabled: true }
      };
    }
    if (tool.name === "code_execution") {
      return { type: "code_execution_20250825", name: "code_execution" };
    }
    throw new Error(`Claude hosted tool is not supported: ${tool.name}`);
  });
}

function mapTools(tools = [], hostedTools = []) {
  const clientTools = normalizeTools(tools).map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters
  }));
  return [...clientTools, ...mapHostedTools(hostedTools)];
}

function assertHostedCapabilities(provider, hostedTools = []) {
  hostedTools.forEach((tool) => {
    if (tool.name === "web_search") assertCapability(provider, "webSearch");
    else if (tool.name === "url_context") assertCapability(provider, "urlContext");
    else if (tool.name === "code_execution") assertCapability(provider, "codeExecution");
    else throw new Error(`Claude hosted tool is not supported: ${tool.name}`);
  });
}

function extractText(json) {
  return (Array.isArray(json.content) ? json.content : [])
    .map((block) => block.text || "")
    .filter(Boolean)
    .join("\n");
}

function extractToolUses(json) {
  return (Array.isArray(json.content) ? json.content : [])
    .filter((block) => block.type === "tool_use" && block.id && block.name)
    .map((block) => ({
      id: block.id,
      name: block.name,
      arguments: block.input || {},
      raw: block
    }));
}

function reasoningOptions(reasoningEffort) {
  switch (reasoningEffort) {
    case "off":
      return { thinking: { type: "disabled" } };
    case "low":
    case "medium":
    case "high":
      return { thinking: { type: "adaptive" }, output_config: { effort: reasoningEffort } };
    case "xhigh":
      return { thinking: { type: "adaptive" }, output_config: { effort: "max" } };
    default:
      return {};
  }
}

function generationOptions({ temperature, topP, reasoningEffort, maxTokens }) {
  const explicitReasoning = ["low", "medium", "high", "xhigh"].includes(reasoningEffort);
  return {
    max_tokens: Number.isFinite(Number(maxTokens)) ? Math.max(1, Math.trunc(Number(maxTokens))) : 4096,
    temperature: explicitReasoning ? undefined : Number.isFinite(Number(temperature)) ? Number(temperature) : undefined,
    top_p: explicitReasoning ? undefined : Number.isFinite(Number(topP)) ? Number(topP) : undefined,
    ...reasoningOptions(reasoningEffort)
  };
}

function normalizedUsage(usage, inputTokens = 0) {
  if (!usage || typeof usage !== "object") return null;
  const input = Number(usage.input_tokens ?? inputTokens ?? 0);
  const output = Number(usage.output_tokens || 0);
  const total = Number(usage.total_tokens || input + output);
  if (![input, output, total].some((value) => value > 0)) return null;
  return { inputTokens: input, outputTokens: output, totalTokens: total };
}

function providerStreamError(payload, fallback) {
  const source = payload?.error || payload;
  const message = typeof source === "string" ? source : source?.message;
  return String(message || fallback).slice(0, 700);
}

async function streamChat({
  provider,
  model,
  messages,
  temperature,
  topP,
  reasoningEffort,
  maxTokens,
  signal,
  tools,
  hostedTools,
  runTool,
  maxToolRounds,
  onToken,
  onUsage
}) {
  if (tools?.length || hostedTools?.length) {
    const text = await completeText({
      provider,
      model,
      messages,
      temperature,
      topP,
      reasoningEffort,
      maxTokens,
      signal,
      tools,
      hostedTools,
      runTool,
      maxToolRounds,
      onUsage
    });
    if (text) await onToken(text);
    return;
  }

  assertCapability(provider, "chat");
  if (hasImageContent(messages)) assertCapability(provider, "vision");
  const mapped = mapMessages(messages);
  const endpoint = providerUrl(provider, "/messages");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream", ...authHeaders(provider) },
    body: JSON.stringify({
      model,
      ...generationOptions({ temperature, topP, reasoningEffort, maxTokens }),
      system: mapped.system || undefined,
      messages: mapped.messages,
      stream: true
    }),
    redirect: "error",
    signal
  });

  if (!response.ok) {
    throw new Error(`Model service returned ${response.status}: ${(await response.text()).slice(0, 700)}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/event-stream")) {
    const json = parseProviderJsonText(await response.text(), { contentType, url: endpoint });
    const usage = normalizedUsage(json.usage);
    if (usage) onUsage?.(usage);
    const text = extractText(json);
    if (text) await onToken(text);
    return;
  }

  let inputTokens = 0;
  let finalUsage = null;
  await consumeSseEvents(response, async ({ event, data }) => {
    const payload = data.trim();
    if (!payload || payload === "[DONE]") return;
    const json = JSON.parse(payload);
    const type = event === "message" ? json.type : event;
    if (type === "message_start") {
      inputTokens = Number(json.message?.usage?.input_tokens || 0);
      return;
    }
    if (type === "content_block_delta" && json.delta?.type === "text_delta") {
      const token = String(json.delta.text || "");
      if (token) await onToken(token);
      return;
    }
    if (type === "message_delta") {
      finalUsage = normalizedUsage(json.usage, inputTokens);
      return;
    }
    if (type === "error") {
      throw new Error(providerStreamError(json, "Model service ended the streaming response with an error"));
    }
  });
  if (finalUsage) onUsage?.(finalUsage);
}

async function completeWithTools({
  provider,
  model,
  messages,
  temperature,
  topP,
  reasoningEffort,
  maxTokens,
  tools,
  hostedTools,
  runTool,
  maxToolRounds = 4,
  signal
}) {
  assertCapability(provider, "chat");
  if (hasImageContent(messages)) assertCapability(provider, "vision");
  if (tools?.length) assertCapability(provider, "toolCalling");
  assertHostedCapabilities(provider, hostedTools);
  const mapped = mapMessages(messages);
  const nextMessages = [...mapped.messages];
  const mappedTools = mapTools(tools, hostedTools);

  for (let round = 0; round <= maxToolRounds; round += 1) {
    const json = await fetchJson(providerUrl(provider, "/messages"), {
      headers: authHeaders(provider),
      body: {
        model,
        ...generationOptions({ temperature, topP, reasoningEffort, maxTokens }),
        system: mapped.system || undefined,
        messages: nextMessages,
        tools: mappedTools.length ? mappedTools : undefined
      },
      signal
    });
    const toolUses = extractToolUses(json);
    if (!toolUses.length && json.stop_reason === "pause_turn") {
      nextMessages.push({ role: "assistant", content: json.content || [] });
      continue;
    }
    if (!toolUses.length) return extractText(json) || JSON.stringify(json);

    nextMessages.push({ role: "assistant", content: json.content || [] });
    const toolResults = [];
    for (const toolUse of toolUses) {
      if (!runTool) throw new Error(`No local executor is available for tool: ${toolUse.name}`);
      const result = await runTool(toolUse);
      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: stringifyToolOutput(result)
      });
    }
    nextMessages.push({ role: "user", content: toolResults });
  }

  throw new Error("Tool call limit reached before the model produced a final answer");
}

async function completeText(params) {
  const { provider, model, messages, temperature, topP, reasoningEffort, maxTokens, signal, tools, hostedTools } = params;
  if (tools?.length || hostedTools?.length) return completeWithTools(params);
  assertCapability(provider, "chat");
  if (hasImageContent(messages)) assertCapability(provider, "vision");
  const mapped = mapMessages(messages);
  const json = await fetchJson(providerUrl(provider, "/messages"), {
    headers: authHeaders(provider),
    body: {
      model,
      ...generationOptions({ temperature, topP, reasoningEffort, maxTokens }),
      system: mapped.system || undefined,
      messages: mapped.messages
    },
    signal
  });
  return extractText(json) || JSON.stringify(json);
}

function unsupported(capability) {
  throw new Error(`Claude does not expose native ${capability} in this adapter`);
}

export function createAnthropicAdapter(provider) {
  return {
    kind: "anthropic",
    streamChat: (params) => streamChat({ provider, ...params }),
    completeText: (params) => completeText({ provider, ...params }),
    generateImage: () => unsupported("image generation"),
    synthesizeSpeech: () => unsupported("speech synthesis"),
    transcribeAudio: () => unsupported("speech transcription"),
    generateVideo: () => unsupported("video generation"),
    embedText: () => unsupported("embeddings")
  };
}
