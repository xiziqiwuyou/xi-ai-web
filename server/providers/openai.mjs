import {
  assertCapability,
  bufferFromDataUrl,
  consumeSseEvents,
  fetchAsset,
  fetchMultipartForm,
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

function responseInput(provider, system, input) {
  if (provider?.kind === "openai" || !system) return input;
  return [{ role: "developer", content: system }, ...input];
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
    parameters: tool.parameters,
    strict: true
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
       arguments: parseStrictToolArguments(item.arguments),
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

function normalizedUsage(json) {
  const usage = json?.usage;
  if (!usage || typeof usage !== "object") return null;
  const inputTokens = Number(usage.input_tokens || 0);
  const outputTokens = Number(usage.output_tokens || 0);
  const totalTokens = Number(usage.total_tokens || inputTokens + outputTokens);
  if (![inputTokens, outputTokens, totalTokens].some((value) => value > 0)) return null;
  return { inputTokens, outputTokens, totalTokens };
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
  tools,
  responseVerbosity,
  stream
}, normalizeResponseBody) {
  const body = {
    model,
    input,
    previous_response_id: previousResponseId || undefined,
    instructions: instructions || undefined,
    ...textOptions({ temperature, topP, reasoningEffort, maxTokens }),
    text: ["low", "medium", "high"].includes(responseVerbosity)
      ? { verbosity: responseVerbosity }
      : undefined,
    tools: tools?.length ? tools : undefined,
    stream: stream === true ? true : undefined
  };
  return normalizeResponseBody ? normalizeResponseBody(body, { model, reasoningEffort }) : body;
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
  responseVerbosity,
  signal,
  tools,
  hostedTools,
  runTool,
  maxToolRounds,
  onToken,
  onUsage,
  normalizeResponseBody,
  statelessResponses = false
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
      responseVerbosity,
      signal,
      tools,
      hostedTools,
      runTool,
      maxToolRounds,
      onUsage,
      normalizeResponseBody,
      statelessResponses
    });
    if (text) await onToken(text);
    return;
  }

  assertCapability(provider, "chat");
  if (hasImageContent(messages)) assertCapability(provider, "vision");
  const { system, input } = splitSystem(messages);
  const endpoint = providerUrl(provider, "/responses");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream", ...authHeaders(provider) },
    body: JSON.stringify(responseRequestBody({
      model,
      input: responseInput(provider, system, input),
      instructions: system,
      temperature,
      topP,
      reasoningEffort,
      maxTokens,
      responseVerbosity,
      stream: true
    }, normalizeResponseBody)),
    redirect: "error",
    signal
  });

  if (!response.ok) {
    throw new Error(`Model service returned ${response.status}: ${(await response.text()).slice(0, 700)}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/event-stream")) {
    const json = parseProviderJsonText(await response.text(), { contentType, url: endpoint });
    const usage = normalizedUsage(json);
    if (usage) onUsage?.(usage);
    const text = extractResponseText(json);
    if (text) await onToken(text);
    return;
  }

  let emittedText = false;
  let completedResponse = null;
  await consumeSseEvents(response, async ({ event, data }) => {
    const payload = data.trim();
    if (!payload || payload === "[DONE]") return;
    const json = JSON.parse(payload);
    const type = event === "message" ? json.type : event;
    if (type === "response.output_text.delta") {
      const token = String(json.delta || "");
      if (token) {
        emittedText = true;
        await onToken(token);
      }
      return;
    }
    if (type === "response.completed") {
      completedResponse = json.response || json;
      const usage = normalizedUsage(completedResponse);
      if (usage) onUsage?.(usage);
      return;
    }
    if (type === "response.failed" || type === "error") {
      throw new Error(providerStreamError(json, "Model service ended the streaming response with an error"));
    }
  });

  if (!emittedText && completedResponse) {
    const text = extractResponseText(completedResponse);
    if (text) await onToken(text);
  }
}

async function completeWithTools({
  provider,
  model,
  messages,
  temperature,
  topP,
  reasoningEffort,
  maxTokens,
  responseVerbosity,
  tools,
  hostedTools,
  runTool,
  onUsage,
  maxToolRounds = 4,
  signal,
  normalizeResponseBody,
  statelessResponses = false
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
        input: responseInput(provider, system, input),
        previousResponseId,
        instructions: system,
        temperature,
        topP,
        reasoningEffort,
        maxTokens,
        responseVerbosity,
        tools: mappedTools
      }, normalizeResponseBody),
      signal
    });
    const usage = normalizedUsage(json);
    if (usage) onUsage?.(usage);
    const toolCalls = extractToolCalls(json);
    if (!toolCalls.length) return extractResponseText(json) || JSON.stringify(json);

    const toolOutputs = [];
    for (const toolCall of toolCalls) {
      if (!runTool) throw new Error(`No local executor is available for tool: ${toolCall.name}`);
      const result = await runTool(toolCall);
      toolOutputs.push({
        type: "function_call_output",
        call_id: toolCall.id,
        output: stringifyToolOutput(result)
      });
    }
    if (statelessResponses) {
      input = [
        ...input,
        ...(Array.isArray(json.output) ? json.output : []),
        ...toolOutputs
      ];
      previousResponseId = "";
    } else {
      previousResponseId = json.id || previousResponseId;
      input = toolOutputs;
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
    responseVerbosity,
    signal,
    tools,
    hostedTools,
    onUsage,
    normalizeResponseBody,
    statelessResponses
  } = params;
  if (tools?.length || hostedTools?.length) return completeWithTools({ ...params, statelessResponses });
  assertCapability(provider, "chat");
  if (hasImageContent(messages)) assertCapability(provider, "vision");
  const { system, input } = splitSystem(messages);
  const json = await fetchJson(providerUrl(provider, "/responses"), {
    headers: authHeaders(provider),
    body: responseRequestBody({
      model,
      input: responseInput(provider, system, input),
      instructions: system,
      temperature,
      topP,
      reasoningEffort,
      maxTokens,
      responseVerbosity
    }, normalizeResponseBody),
    signal
  });
  const usage = normalizedUsage(json);
  if (usage) onUsage?.(usage);
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

function outputFields({ quality, outputFormat, outputCompression, background }) {
  const format = ["png", "jpeg", "webp"].includes(outputFormat) ? outputFormat : undefined;
  const compression = Number.isFinite(Number(outputCompression))
    ? Math.max(0, Math.min(100, Math.trunc(Number(outputCompression))))
    : undefined;
  return {
    quality: ["auto", "low", "medium", "high"].includes(quality) ? quality : undefined,
    output_format: format,
    output_compression: format === "jpeg" || format === "webp" ? compression : undefined,
    background: ["auto", "opaque", "transparent"].includes(background) ? background : undefined
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
  inputImages,
  maskImage,
  size,
  aspectRatio,
  count,
  quality,
  outputFormat,
  outputCompression,
  background,
  signal
}) {
  assertCapability(provider, "image");
  const fields = {
    model,
    prompt,
    n: normalizedImageCount(count),
    size: normalizedImageSize(model, size, aspectRatio),
    ...outputFields({ quality, outputFormat, outputCompression, background })
  };

  if (mode === "edit") {
    assertCapability(provider, "imageEdit");
    const uniqueInputs = [...new Map(
      [...(Array.isArray(inputImages) ? inputImages : []), inputImage]
        .filter((item) => item?.dataUrl)
        .map((item) => [item.dataUrl, item])
    ).values()];
    if (!uniqueInputs.length) throw new Error("Image editing requires at least one input image");
    const files = uniqueInputs.map((item, index) => imageFile(
      item,
      index === 0 ? "image" : "image[]",
      `input-${index + 1}.png`
    ));
    if (maskImage?.dataUrl) files.push(imageFile(maskImage, "mask", "mask.png"));
    return fetchMultipartForm(providerUrl(provider, "/images/edits"), {
      headers: authHeaders(provider),
      fields,
      files,
      signal,
      maxResponseBytes: IMAGE_RESPONSE_LIMIT_BYTES
    });
  }

  return fetchJson(providerUrl(provider, "/images/generations"), {
    headers: authHeaders(provider),
    body: fields,
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

export function createOpenAIAdapter(provider, { normalizeResponseBody, statelessResponses = false } = {}) {
  return {
    kind: "openai",
    streamChat: (params) => streamChat({ ...params, provider, normalizeResponseBody, statelessResponses }),
    completeText: (params) => completeText({ ...params, provider, normalizeResponseBody, statelessResponses }),
    generateImage: (params) => generateImage({ provider, ...params }),
    synthesizeSpeech: (params) => synthesizeSpeech({ provider, ...params }),
    transcribeAudio: (params) => transcribeAudio({ provider, ...params }),
    generateVideo: () => {
      throw new Error("OpenAI native video generation is not enabled for this adapter");
    },
    embedText: (params) => embedText({ provider, ...params })
  };
}
