import {
  assertCapability,
  dataUrlPayload,
  fetchJson,
  hasImageContent,
  normalizeTools,
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

function mapTools(tools = []) {
  return normalizeTools(tools).map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters
  }));
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

async function completeWithTools({
  provider,
  model,
  messages,
  temperature,
  tools,
  runTool,
  maxToolRounds = 4,
  signal
}) {
  assertCapability(provider, "chat");
  if (hasImageContent(messages)) assertCapability(provider, "vision");
  assertCapability(provider, "toolCalling");
  const mapped = mapMessages(messages);
  const nextMessages = [...mapped.messages];
  const mappedTools = mapTools(tools);

  for (let round = 0; round <= maxToolRounds; round += 1) {
    const json = await fetchJson(providerUrl(provider, "/messages"), {
      headers: authHeaders(provider),
      body: {
        model,
        max_tokens: 4096,
        system: mapped.system || undefined,
        messages: nextMessages,
        temperature,
        tools: mappedTools.length ? mappedTools : undefined
      },
      signal
    });
    const toolUses = extractToolUses(json);
    if (!toolUses.length) return extractText(json) || JSON.stringify(json);

    nextMessages.push({ role: "assistant", content: json.content || [] });
    const toolResults = [];
    for (const toolUse of toolUses) {
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
  const { provider, model, messages, temperature, signal, tools, runTool } = params;
  if (tools?.length && runTool) return completeWithTools(params);
  assertCapability(provider, "chat");
  if (hasImageContent(messages)) assertCapability(provider, "vision");
  const mapped = mapMessages(messages);
  const json = await fetchJson(providerUrl(provider, "/messages"), {
    headers: authHeaders(provider),
    body: {
      model,
      max_tokens: 4096,
      system: mapped.system || undefined,
      messages: mapped.messages,
      temperature
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
    streamChat: async (params) => {
      const text = await completeText({ provider, ...params });
      if (text) params.onToken(text);
    },
    completeText: (params) => completeText({ provider, ...params }),
    generateImage: () => unsupported("image generation"),
    synthesizeSpeech: () => unsupported("speech synthesis"),
    transcribeAudio: () => unsupported("speech transcription"),
    generateVideo: () => unsupported("video generation"),
    embedText: () => unsupported("embeddings")
  };
}
