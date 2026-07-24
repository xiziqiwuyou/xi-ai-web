import {
  assertCapability,
  bufferFromDataUrl,
  fetchAsset,
  fetchMultipartForm,
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

function mapHostedTools(hostedTools = []) {
  return (Array.isArray(hostedTools) ? hostedTools : []).map((tool) => {
    if (tool.name === "web_search") return { type: "web_search" };
    if (tool.name === "code_execution") {
      return { type: "code_interpreter", container: { type: "auto" } };
    }
    throw new Error(`OpenAI hosted tool is not supported: ${tool.name}`);
  });
}

function mapTools(tools = [], hostedTools = []) {
  const functionTools = normalizeTools(tools).map((tool) => ({
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters
  }));
  return [...functionTools, ...mapHostedTools(hostedTools)];
}

function assertHostedCapabilities(provider, hostedTools = []) {
  hostedTools.forEach((tool) => {
    if (tool.name === "web_search") assertCapability(provider, "webSearch");
    else if (tool.name === "code_execution") assertCapability(provider, "codeExecution");
    else throw new Error(`OpenAI hosted tool is not supported: ${tool.name}`);
  });
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

function reasoningOptions(reasoningEffort) {
  switch (reasoningEffort) {
    case "off":
      return { reasoning: { effort: "none" } };
    case "low":
    case "medium":
    case "high":
    case "xhigh":
      return { reasoning: { effort: reasoningEffort } };
    default:
      return {};
  }
}

function textOptions({ temperature, topP, maxTokens, reasoningEffort }) {
  const explicitReasoning = ["low", "medium", "high", "xhigh"].includes(reasoningEffort);
  return {
    temperature: explicitReasoning ? undefined : Number.isFinite(Number(temperature)) ? Number(temperature) : undefined,
    top_p: explicitReasoning ? undefined : Number.isFinite(Number(topP)) ? Number(topP) : undefined,
    max_output_tokens: Number.isFinite(Number(maxTokens))
      ? Math.max(1, Math.trunc(Number(maxTokens)))
      : undefined,
    ...reasoningOptions(reasoningEffort)
  };
}

function responseRequestBody({
  model,
  input,
  previousResponseId,
  instructions,
  temperature,
  topP,
  reasoningEffort,
  maxTokens,
  tools
}, normalizeResponseBody) {
  const body = {
    model,
    input,
    previous_response_id: previousResponseId || undefined,
    instructions: instructions || undefined,
    ...textOptions({ temperature, topP, reasoningEffort, maxTokens }),
    tools: tools?.length ? tools : undefined
  };
  return normalizeResponseBody ? normalizeResponseBody(body, { model, reasoningEffort }) : body;
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
  signal,
  normalizeResponseBody
}) {
  assertCapability(provider, "chat");
  if (hasImageContent(messages)) assertCapability(provider, "vision");
  if (tools?.length) assertCapability(provider, "toolCalling");
  assertHostedCapabilities(provider, hostedTools);
  const { system, input: firstInput } = splitSystem(messages);
  const mappedTools = mapTools(tools, hostedTools);
  let previousResponseId = "";
  let input = firstInput;

  for (let round = 0; round <= maxToolRounds; round += 1) {
    const json = await fetchJson(providerUrl(provider, "/responses"), {
      headers: authHeaders(provider),
      body: responseRequestBody({
        model,
        input,
        previousResponseId,
        instructions: previousResponseId ? "" : system,
        temperature,
        topP,
        reasoningEffort,
        maxTokens,
        tools: mappedTools
      }, normalizeResponseBody),
      signal
    });
    const toolCalls = extractToolCalls(json);
    if (!toolCalls.length) return extractResponseText(json) || JSON.stringify(json);

    previousResponseId = json.id || previousResponseId;
    input = [];
    for (const toolCall of toolCalls) {
      if (!runTool) throw new Error(`No local executor is available for tool: ${toolCall.name}`);
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
  const {
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
    normalizeResponseBody
  } = params;
  if (tools?.length || hostedTools?.length) return completeWithTools(params);
  assertCapability(provider, "chat");
  if (hasImageContent(messages)) assertCapability(provider, "vision");
  const { system, input } = splitSystem(messages);
  const json = await fetchJson(providerUrl(provider, "/responses"), {
    headers: authHeaders(provider),
    body: responseRequestBody({
      model,
      input,
      instructions: system,
      temperature,
      topP,
      reasoningEffort,
      maxTokens
    }, normalizeResponseBody),
    signal
  });
  return extractResponseText(json) || JSON.stringify(json);
}

function normalizedImageCount(count) {
  return Number.isFinite(Number(count)) ? Math.max(1, Math.min(10, Math.trunc(Number(count)))) : 1;
}

function normalizedImageSize(model, size, aspectRatio) {
  const requested = String(size || "").trim();
  if (/^gpt-image-2(?:$|-)/i.test(model)) return requested || "auto";
  if (["1024x1024", "1536x1024", "1024x1536", "auto"].includes(requested)) return requested;
  if (aspectRatio === "3:2" || aspectRatio === "16:9") return "1536x1024";
  if (aspectRatio === "2:3" || aspectRatio === "9:16") return "1024x1536";
  return "1024x1024";
}

function outputFields({ quality, outputFormat, outputCompression }) {
  const format = ["png", "jpeg", "webp"].includes(outputFormat) ? outputFormat : undefined;
  const compression = Number.isFinite(Number(outputCompression))
    ? Math.max(0, Math.min(100, Math.trunc(Number(outputCompression))))
    : undefined;
  return {
    quality: ["auto", "low", "medium", "high"].includes(quality) ? quality : undefined,
    output_format: format,
    output_compression: format === "jpeg" || format === "webp" ? compression : undefined
  };
}

function imageFile(input, fieldName, fallbackName) {
  const payload = bufferFromDataUrl(input?.dataUrl);
  if (!payload) throw new Error(`${fieldName === "mask" ? "Mask" : "Input image"} is invalid`);
  return {
    fieldName,
    buffer: payload.buffer,
    fileName: input?.name || fallbackName,
    mimeType: input?.mimeType || payload.mimeType
  };
}

async function generateImage({
  provider,
  model,
  prompt,
  mode,
  inputImage,
  maskImage,
  size,
  aspectRatio,
  count,
  quality,
  outputFormat,
  outputCompression,
  signal
}) {
  assertCapability(provider, "image");
  const fields = {
    model,
    prompt,
    n: normalizedImageCount(count),
    size: normalizedImageSize(model, size, aspectRatio),
    ...outputFields({ quality, outputFormat, outputCompression })
  };

  if (mode === "edit") {
    assertCapability(provider, "imageEdit");
    const files = [imageFile(inputImage, "image", "input.png")];
    if (maskImage?.dataUrl) files.push(imageFile(maskImage, "mask", "mask.png"));
    return fetchMultipartForm(providerUrl(provider, "/images/edits"), {
      headers: authHeaders(provider),
      fields,
      files,
      signal
    });
  }

  return fetchJson(providerUrl(provider, "/images/generations"), {
    headers: authHeaders(provider),
    body: fields,
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

export function createOpenAIAdapter(provider, { normalizeResponseBody } = {}) {
  return {
    kind: "openai",
    streamChat: async (params) => {
      const text = await completeText({ ...params, provider, normalizeResponseBody });
      if (text) params.onToken(text);
    },
    completeText: (params) => completeText({ ...params, provider, normalizeResponseBody }),
    generateImage: (params) => generateImage({ provider, ...params }),
    synthesizeSpeech: (params) => synthesizeSpeech({ provider, ...params }),
    transcribeAudio: (params) => transcribeAudio({ provider, ...params }),
    generateVideo: () => {
      throw new Error("OpenAI native video generation is not enabled for this adapter");
    },
    embedText: (params) => embedText({ provider, ...params })
  };
}
