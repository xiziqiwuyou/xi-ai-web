import {
  assertCapability,
  consumeSseEvents,
  extractOpenAICompatibleText,
  fetchAsset,
  fetchMultipartJson,
  fetchJson,
  hasImageContent,
  normalizeTools,
  parseProviderJsonText,
  parseStrictToolArguments,
  providerUrl,
  stringifyToolOutput
} from "./types.mjs";

const IMAGE_RESPONSE_LIMIT_BYTES = 64 * 1024 * 1024;

function authHeaders(provider) {
  return provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {};
}

function mapTools(tools = []) {
  return normalizeTools(tools).map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }
  }));
}

function normalizeMessages(messages = []) {
  return messages.map((message) => ({
    ...message,
    role: message.role,
    content: mapOpenAICompatibleContent(message.content)
  }));
}

function mapOpenAICompatibleContent(content) {
  if (!Array.isArray(content)) return content ?? "";
  return content
    .map((part) => {
      if (part?.type === "image" && part.dataUrl) {
        return { type: "image_url", image_url: { url: part.dataUrl } };
      }
      return { type: "text", text: String(part?.text || "") };
    })
    .filter((part) => part.type === "image_url" || part.text);
}

function extractEmbeddings(json) {
  const data = Array.isArray(json?.data) ? [...json.data] : [];
  return data
    .sort((left, right) => Number(left.index || 0) - Number(right.index || 0))
    .map((item) => item.embedding)
    .filter((embedding) => Array.isArray(embedding));
}

function reasoningOptions(reasoningEffort) {
  switch (reasoningEffort) {
    case "off":
      return { reasoning_effort: "none" };
    case "low":
    case "medium":
    case "high":
    case "xhigh":
      return { reasoning_effort: reasoningEffort };
    default:
      return {};
  }
}

function chatRequestBody(
  { model, messages, temperature, topP, reasoningEffort, maxTokens, stream, tools },
  normalizeChatBody
) {
  const body = {
    model,
    messages: normalizeMessages(messages),
    temperature: Number.isFinite(Number(temperature)) ? Number(temperature) : undefined,
    top_p: Number.isFinite(Number(topP)) ? Number(topP) : undefined,
    max_tokens: Number.isFinite(Number(maxTokens)) ? Math.max(1, Math.trunc(Number(maxTokens))) : undefined,
    stream,
    tools,
    ...reasoningOptions(reasoningEffort)
  };
  return normalizeChatBody ? normalizeChatBody(body, { model, reasoningEffort }) : body;
}

async function streamChat({ provider, model, messages, temperature, topP, reasoningEffort, maxTokens, signal, onToken, normalizeChatBody }) {
  assertCapability(provider, "chat");
  if (hasImageContent(messages)) assertCapability(provider, "vision");
  const endpoint = providerUrl(provider, "/chat/completions");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(provider) },
    body: JSON.stringify(chatRequestBody({ model, messages, temperature, topP, reasoningEffort, maxTokens, stream: true }, normalizeChatBody)),
    redirect: "error",
    signal
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Model service returned ${response.status}: ${errorText.slice(0, 700)}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/event-stream")) {
    const text = await response.text();
    const parsed = parseProviderJsonText(text, { contentType, url: endpoint });
    const content = extractOpenAICompatibleText(parsed);
    if (content) await onToken(content);
    return;
  }

  await consumeSseEvents(response, async ({ data }) => {
    const payload = data.trim();
    if (!payload || payload === "[DONE]") return;
    const json = JSON.parse(payload);
    const token = json.choices?.[0]?.delta?.content || json.choices?.[0]?.message?.content || "";
    if (token) await onToken(token);
  });
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
  runTool,
  maxToolRounds = 4,
  signal,
  normalizeChatBody
}) {
  assertCapability(provider, "chat");
  if (hasImageContent(messages)) assertCapability(provider, "vision");
  assertCapability(provider, "toolCalling");
  const mappedTools = mapTools(tools);
  const nextMessages = normalizeMessages(messages);

  for (let round = 0; round <= maxToolRounds; round += 1) {
    const json = await fetchJson(providerUrl(provider, "/chat/completions"), {
      headers: authHeaders(provider),
      body: chatRequestBody({
        model,
        messages: nextMessages,
        temperature,
        topP,
        reasoningEffort,
        maxTokens,
        stream: false,
        tools: mappedTools.length ? mappedTools : undefined
      }, normalizeChatBody),
      signal
    });
    const message = json.choices?.[0]?.message;
    const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
    if (!toolCalls.length) return extractOpenAICompatibleText(json);

    nextMessages.push({
      ...message,
      role: "assistant",
      content: message.content ?? null,
      tool_calls: toolCalls
    });

    for (const toolCall of toolCalls) {
      const name = toolCall.function?.name || toolCall.name;
      const argumentsJson = toolCall.function?.arguments || toolCall.arguments;
      const result = await runTool({
        name,
        arguments: parseStrictToolArguments(argumentsJson),
        raw: toolCall
      });
      nextMessages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        name,
        content: stringifyToolOutput(result)
      });
    }
  }

  throw new Error("Tool call limit reached before the model produced a final answer");
}

async function completeText(params) {
  const { provider, model, messages, temperature, topP, reasoningEffort, maxTokens, signal, tools, runTool, normalizeChatBody } = params;
  if (tools?.length && runTool) return completeWithTools(params);
  assertCapability(provider, "chat");
  if (hasImageContent(messages)) assertCapability(provider, "vision");
  const json = await fetchJson(providerUrl(provider, "/chat/completions"), {
    headers: authHeaders(provider),
    body: chatRequestBody({ model, messages, temperature, topP, reasoningEffort, maxTokens, stream: false }, normalizeChatBody),
    signal
  });
  return extractOpenAICompatibleText(json);
}

async function generateImage({
  provider,
  model,
  prompt,
  mode,
  size,
  count,
  quality,
  outputFormat,
  outputCompression,
  signal
}) {
  assertCapability(provider, "image");
  if (mode === "edit") {
    throw new Error("通用 OpenAI Compatible 适配器未声明图片编辑协议，请选择 OpenAI 或 Gemini 厂商模型");
  }
  return fetchJson(providerUrl(provider, "/images/generations"), {
    headers: authHeaders(provider),
    body: {
      model,
      prompt,
      n: Number.isFinite(Number(count)) ? Math.max(1, Math.min(10, Math.trunc(Number(count)))) : 1,
      size,
      quality,
      output_format: outputFormat,
      output_compression: outputFormat === "jpeg" || outputFormat === "webp" ? outputCompression : undefined
    },
    signal,
    maxResponseBytes: IMAGE_RESPONSE_LIMIT_BYTES
  });
}

async function synthesizeSpeech({ provider, model, input, voice, format, signal }) {
  assertCapability(provider, "tts");
  return fetchAsset(providerUrl(provider, "/audio/speech"), {
    headers: authHeaders(provider),
    body: { model, input, voice, format },
    signal
  });
}

async function generateVideo({ provider, model, prompt, size, endpointPath, signal }) {
  assertCapability(provider, "video");
  return fetchJson(providerUrl(provider, endpointPath || "/video/generations"), {
    headers: authHeaders(provider),
    body: { model, prompt, size },
    signal
  });
}

async function getVideoStatus({ provider, endpointPath, providerJobId, signal }) {
  assertCapability(provider, "video");
  if (!providerJobId) throw new Error("Video provider job id is required");
  return fetchJson(providerUrl(provider, endpointPath || "/video/generations/status"), {
    headers: authHeaders(provider),
    body: { id: providerJobId },
    signal
  });
}

async function embedText({ provider, model, input, signal }) {
  assertCapability(provider, "embedding");
  const json = await fetchJson(providerUrl(provider, "/embeddings"), {
    headers: authHeaders(provider),
    body: { model, input },
    signal
  });
  return {
    embeddings: extractEmbeddings(json),
    usage: json.usage,
    raw: json
  };
}

async function transcribeAudio({ provider, model, fileBuffer, fileName, mimeType, endpointPath, signal }) {
  assertCapability(provider, "stt");
  return fetchMultipartJson(providerUrl(provider, endpointPath || "/audio/transcriptions"), {
    headers: authHeaders(provider),
    fields: { model, response_format: "json" },
    file: {
      fieldName: "file",
      buffer: fileBuffer,
      fileName: fileName || "audio.webm",
      mimeType: mimeType || "audio/webm"
    },
    signal
  });
}

export function createOpenAICompatibleAdapter(
  provider,
  { kind = "openai-compatible", normalizeChatBody } = {}
) {
  const rejectHostedTools = (params = {}) => {
    if (Array.isArray(params.hostedTools) && params.hostedTools.length) {
      throw new Error(`${kind} adapter does not support provider-hosted tools`);
    }
  };
  return {
    kind,
    streamChat: (params) => {
      rejectHostedTools(params);
      return streamChat({ provider, normalizeChatBody, ...params });
    },
    completeText: (params) => {
      rejectHostedTools(params);
      return completeText({ provider, normalizeChatBody, ...params });
    },
    generateImage: (params) => generateImage({ provider, ...params }),
    synthesizeSpeech: (params) => synthesizeSpeech({ provider, ...params }),
    transcribeAudio: (params) => transcribeAudio({ provider, ...params }),
    generateVideo: (params) => generateVideo({ provider, ...params }),
    getVideoStatus: (params) => getVideoStatus({ provider, ...params }),
    embedText: (params) => embedText({ provider, ...params })
  };
}
