import {
  assertCapability,
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

function splitSystem(messages = []) {
  const system = messages.find((message) => message.role === "system")?.content || "";
  const input = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role,
      content: mapOpenAIContent(message.content)
    }));
  return { system, input };
}

function mapOpenAIContent(content) {
  if (!Array.isArray(content)) return content || "";
  return content
    .map((part) => {
      if (part?.type === "image" && part.dataUrl) {
        return { type: "input_image", image_url: part.dataUrl };
      }
      return { type: "input_text", text: String(part?.text || "") };
    })
    .filter((part) => part.type === "input_image" || part.text);
}

function mapTools(tools = []) {
  return normalizeTools(tools).map((tool) => ({
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters
  }));
}

function extractResponseText(json) {
  if (json.output_text) return json.output_text;
  const output = Array.isArray(json.output) ? json.output : [];
  return output
    .flatMap((item) => (Array.isArray(item.content) ? item.content : []))
    .map((content) => content.text || "")
    .filter(Boolean)
    .join("\n");
}

function extractToolCalls(json) {
  const output = Array.isArray(json.output) ? json.output : [];
  return output
    .filter((item) => item.type === "function_call")
    .map((item) => ({
      id: item.call_id || item.id,
      name: item.name,
      arguments: parseToolArguments(item.arguments),
      raw: item
    }))
    .filter((call) => call.id && call.name);
}

function extractEmbeddings(json) {
  const data = Array.isArray(json?.data) ? [...json.data] : [];
  return data
    .sort((left, right) => Number(left.index || 0) - Number(right.index || 0))
    .map((item) => item.embedding)
    .filter((embedding) => Array.isArray(embedding));
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
  const { system, input: firstInput } = splitSystem(messages);
  const mappedTools = mapTools(tools);
  let previousResponseId = "";
  let input = firstInput;

  for (let round = 0; round <= maxToolRounds; round += 1) {
    const json = await fetchJson(providerUrl(provider, "/responses"), {
      headers: authHeaders(provider),
      body: {
        model,
        input,
        previous_response_id: previousResponseId || undefined,
        instructions: previousResponseId ? undefined : system || undefined,
        temperature,
        tools: mappedTools.length ? mappedTools : undefined
      },
      signal
    });
    const toolCalls = extractToolCalls(json);
    if (!toolCalls.length) return extractResponseText(json) || JSON.stringify(json);

    previousResponseId = json.id || previousResponseId;
    input = [];
    for (const toolCall of toolCalls) {
      const result = await runTool(toolCall);
      input.push({
        type: "function_call_output",
        call_id: toolCall.id,
        output: stringifyToolOutput(result)
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
  const { system, input } = splitSystem(messages);
  const json = await fetchJson(providerUrl(provider, "/responses"), {
    headers: authHeaders(provider),
    body: {
      model,
      input,
      instructions: system || undefined,
      temperature
    },
    signal
  });
  return extractResponseText(json) || JSON.stringify(json);
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

async function transcribeAudio({ provider, model, fileBuffer, fileName, mimeType, signal }) {
  assertCapability(provider, "stt");
  return fetchMultipartJson(providerUrl(provider, "/audio/transcriptions"), {
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

export function createOpenAIAdapter(provider) {
  return {
    kind: "openai",
    streamChat: async (params) => {
      const text = await completeText({ provider, ...params });
      if (text) params.onToken(text);
    },
    completeText: (params) => completeText({ provider, ...params }),
    generateImage: (params) => generateImage({ provider, ...params }),
    synthesizeSpeech: (params) => synthesizeSpeech({ provider, ...params }),
    transcribeAudio: (params) => transcribeAudio({ provider, ...params }),
    generateVideo: () => {
      throw new Error("OpenAI native video generation is not enabled for this adapter");
    },
    embedText: (params) => embedText({ provider, ...params })
  };
}
