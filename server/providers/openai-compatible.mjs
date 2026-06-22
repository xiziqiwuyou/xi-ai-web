import {
  assertCapability,
  extractOpenAICompatibleText,
  fetchAsset,
  fetchMultipartJson,
  fetchJson,
  hasImageContent,
  normalizeTools,
  parseToolArguments,
  providerUrl,
  stringifyToolOutput
} from "./types.mjs";

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
    role: message.role,
    content: mapOpenAICompatibleContent(message.content)
  }));
}

function mapOpenAICompatibleContent(content) {
  if (!Array.isArray(content)) return content || "";
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

async function streamChat({ provider, model, messages, temperature, signal, onToken }) {
  assertCapability(provider, "chat");
  if (hasImageContent(messages)) assertCapability(provider, "vision");
  const response = await fetch(providerUrl(provider, "/chat/completions"), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(provider) },
    body: JSON.stringify({ model, messages: normalizeMessages(messages), temperature, stream: true }),
    signal
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Model service returned ${response.status}: ${errorText.slice(0, 700)}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/event-stream")) {
    const text = await response.text();
    const parsed = JSON.parse(text);
    const content = extractOpenAICompatibleText(parsed);
    if (content) onToken(content);
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("Model service did not return a readable stream");
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") return;
      const json = JSON.parse(data);
      const token = json.choices?.[0]?.delta?.content || json.choices?.[0]?.message?.content || "";
      if (token) onToken(token);
    }
  }
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
  const mappedTools = mapTools(tools);
  const nextMessages = normalizeMessages(messages);

  for (let round = 0; round <= maxToolRounds; round += 1) {
    const json = await fetchJson(providerUrl(provider, "/chat/completions"), {
      headers: authHeaders(provider),
      body: {
        model,
        messages: nextMessages,
        temperature,
        stream: false,
        tools: mappedTools.length ? mappedTools : undefined
      },
      signal
    });
    const message = json.choices?.[0]?.message;
    const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
    if (!toolCalls.length) return extractOpenAICompatibleText(json);

    nextMessages.push({
      role: "assistant",
      content: message.content || null,
      tool_calls: toolCalls
    });

    for (const toolCall of toolCalls) {
      const name = toolCall.function?.name || toolCall.name;
      const argumentsJson = toolCall.function?.arguments || toolCall.arguments;
      const result = await runTool({
        name,
        arguments: parseToolArguments(argumentsJson),
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
  const { provider, model, messages, temperature, signal, tools, runTool } = params;
  if (tools?.length && runTool) return completeWithTools(params);
  assertCapability(provider, "chat");
  if (hasImageContent(messages)) assertCapability(provider, "vision");
  const json = await fetchJson(providerUrl(provider, "/chat/completions"), {
    headers: authHeaders(provider),
    body: { model, messages: normalizeMessages(messages), temperature, stream: false },
    signal
  });
  return extractOpenAICompatibleText(json);
}

async function generateImage({ provider, model, prompt, size, signal }) {
  assertCapability(provider, "image");
  return fetchJson(providerUrl(provider, "/images/generations"), {
    headers: authHeaders(provider),
    body: { model, prompt, n: 1, size },
    signal
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

export function createOpenAICompatibleAdapter(provider) {
  return {
    kind: "openai-compatible",
    streamChat: (params) => streamChat({ provider, ...params }),
    completeText: (params) => completeText({ provider, ...params }),
    generateImage: (params) => generateImage({ provider, ...params }),
    synthesizeSpeech: (params) => synthesizeSpeech({ provider, ...params }),
    transcribeAudio: (params) => transcribeAudio({ provider, ...params }),
    generateVideo: (params) => generateVideo({ provider, ...params }),
    getVideoStatus: (params) => getVideoStatus({ provider, ...params }),
    embedText: (params) => embedText({ provider, ...params })
  };
}
