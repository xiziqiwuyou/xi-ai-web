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
  return provider.apiKey ? { "x-goog-api-key": provider.apiKey } : {};
}

function mapMessages(messages = []) {
  const system = messages.find((message) => message.role === "system")?.content || "";
  const contents = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: mapGeminiParts(message.content)
    }));
  return { system, contents };
}

function mapGeminiParts(content) {
  if (!Array.isArray(content)) return [{ text: content || "" }];
  return content
    .map((part) => {
      if (part?.type === "image" && part.dataUrl) {
        const payload = dataUrlPayload(part.dataUrl);
        if (!payload) return null;
        return { inlineData: { mimeType: payload.mimeType, data: payload.base64 } };
      }
      return { text: String(part?.text || "") };
    })
    .filter(Boolean);
}

function mapHostedTools(hostedTools = []) {
  return (Array.isArray(hostedTools) ? hostedTools : []).map((tool) => {
    if (tool.name === "web_search") return { googleSearch: {} };
    if (tool.name === "url_context") return { urlContext: {} };
    if (tool.name === "code_execution") return { codeExecution: {} };
    throw new Error(`Gemini hosted tool is not supported: ${tool.name}`);
  });
}

function mapTools(tools = [], hostedTools = []) {
  const declarations = normalizeTools(tools).map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters
  }));
  const functionTools = declarations.length ? [{ functionDeclarations: declarations }] : [];
  const mapped = [...functionTools, ...mapHostedTools(hostedTools)];
  return mapped.length ? mapped : undefined;
}

function assertHostedCapabilities(provider, hostedTools = []) {
  hostedTools.forEach((tool) => {
    if (tool.name === "web_search") assertCapability(provider, "webSearch");
    else if (tool.name === "url_context") assertCapability(provider, "urlContext");
    else if (tool.name === "code_execution") assertCapability(provider, "codeExecution");
    else throw new Error(`Gemini hosted tool is not supported: ${tool.name}`);
  });
}

function extractText(json) {
  const parts = json.candidates?.[0]?.content?.parts || [];
  return parts.map((part) => part.text || "").filter(Boolean).join("\n");
}

function extractToolCalls(json) {
  const parts = json.candidates?.[0]?.content?.parts || [];
  return parts
    .filter((part) => part.functionCall?.name)
    .map((part, index) => ({
      id: `${part.functionCall.name}-${index}`,
      name: part.functionCall.name,
      arguments: part.functionCall.args || {},
      raw: part.functionCall
    }));
}

function toFunctionResponse(result) {
  if (result && typeof result === "object" && !Array.isArray(result)) return result;
  return { result: stringifyToolOutput(result) };
}

function aspectRatioForSize(size) {
  const [width, height] = String(size || "").split("x").map((part) => Number(part));
  if (!width || !height) return undefined;
  const ratio = width / height;
  if (ratio > 1.4) return "16:9";
  if (ratio < 0.8) return "9:16";
  return "1:1";
}

function thinkingConfig(model, reasoningEffort) {
  const usesThinkingLevel = /^gemini-3(?:[.-]|$)/i.test(String(model || ""));
  if (usesThinkingLevel) {
    const thinkingLevel = {
      off: "MINIMAL",
      low: "LOW",
      medium: "MEDIUM",
      high: "HIGH",
      xhigh: "HIGH"
    }[reasoningEffort];
    return thinkingLevel ? { thinkingLevel } : undefined;
  }

  const thinkingBudget = {
    off: 0,
    low: 1024,
    medium: 4096,
    high: 8192,
    xhigh: 16384
  }[reasoningEffort];
  return thinkingBudget === undefined ? undefined : { thinkingBudget };
}

function generationConfig({ model, temperature, topP, reasoningEffort, maxTokens }) {
  const explicitReasoning = ["low", "medium", "high", "xhigh"].includes(reasoningEffort);
  return {
    temperature: explicitReasoning ? undefined : Number.isFinite(Number(temperature)) ? Number(temperature) : undefined,
    topP: explicitReasoning ? undefined : Number.isFinite(Number(topP)) ? Number(topP) : undefined,
    maxOutputTokens: Number.isFinite(Number(maxTokens))
      ? Math.max(1, Math.trunc(Number(maxTokens)))
      : undefined,
    thinkingConfig: thinkingConfig(model, reasoningEffort)
  };
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
  if (tools?.length && hostedTools?.length && !/^gemini-3(?:\.|-)/i.test(model)) {
    throw new Error("Gemini 2.5 does not support combining provider-hosted tools with custom functions");
  }
  const mapped = mapMessages(messages);
  const contents = [...mapped.contents];
  const mappedTools = mapTools(tools, hostedTools);

  for (let round = 0; round <= maxToolRounds; round += 1) {
    const json = await fetchJson(providerUrl(provider, `/models/${encodeURIComponent(model)}:generateContent`), {
      headers: authHeaders(provider),
      body: {
        contents,
        systemInstruction: mapped.system ? { parts: [{ text: mapped.system }] } : undefined,
        generationConfig: generationConfig({ model, temperature, topP, reasoningEffort, maxTokens }),
        tools: mappedTools
      },
      signal
    });
    const toolCalls = extractToolCalls(json);
    if (!toolCalls.length) return extractText(json) || JSON.stringify(json);

    contents.push({
      role: "model",
      parts: toolCalls.map((toolCall) => ({ functionCall: toolCall.raw }))
    });
    contents.push({
      role: "user",
      parts: await Promise.all(
        toolCalls.map(async (toolCall) => ({
          functionResponse: {
            name: toolCall.name,
            response: toFunctionResponse(await (() => {
              if (!runTool) throw new Error(`No local executor is available for tool: ${toolCall.name}`);
              return runTool(toolCall);
            })())
          }
        }))
      )
    });
  }

  throw new Error("Tool call limit reached before the model produced a final answer");
}

async function completeText(params) {
  const { provider, model, messages, temperature, topP, reasoningEffort, maxTokens, signal, tools, hostedTools } = params;
  if (tools?.length || hostedTools?.length) return completeWithTools(params);
  assertCapability(provider, "chat");
  if (hasImageContent(messages)) assertCapability(provider, "vision");
  const mapped = mapMessages(messages);
  const json = await fetchJson(providerUrl(provider, `/models/${encodeURIComponent(model)}:generateContent`), {
    headers: authHeaders(provider),
    body: {
      contents: mapped.contents,
      systemInstruction: mapped.system ? { parts: [{ text: mapped.system }] } : undefined,
      generationConfig: generationConfig({ model, temperature, topP, reasoningEffort, maxTokens })
    },
    signal
  });
  return extractText(json) || JSON.stringify(json);
}

function imagePart(input) {
  const payload = dataUrlPayload(input?.dataUrl);
  if (!payload) throw new Error("Invalid image input");
  return { inlineData: { mimeType: input?.mimeType || payload.mimeType, data: payload.base64 } };
}

function normalizedImageCount(count) {
  return Number.isFinite(Number(count)) ? Math.max(1, Math.min(4, Math.trunc(Number(count)))) : 1;
}

function normalizedImageSize(model, imageSize) {
  if (!/^gemini-3(?:\.|-)/i.test(model)) return undefined;
  return ["512px", "1K", "2K", "4K"].includes(imageSize) ? imageSize : "1K";
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
  imageSize,
  count,
  signal
}) {
  assertCapability(provider, "image");
  if (mode === "edit") assertCapability(provider, "imageEdit");
  const parts = [{ text: prompt }];
  if (mode === "edit") {
    if (!inputImage?.dataUrl) throw new Error("Image editing requires an input image");
    parts.push(imagePart(inputImage));
    if (maskImage?.dataUrl) {
      parts[0] = {
        text: `${prompt}\nThe final attached image is a semantic mask. Apply the requested edit only to the masked region.`
      };
      parts.push(imagePart(maskImage));
    }
  }

  const request = () => fetchJson(providerUrl(provider, `/models/${encodeURIComponent(model)}:generateContent`), {
    headers: authHeaders(provider),
    body: {
      contents: [{ role: "user", parts }],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig: {
          aspectRatio: aspectRatio || aspectRatioForSize(size),
          imageSize: normalizedImageSize(model, imageSize)
        }
      }
    },
    signal
  });

  const responses = await Promise.all(Array.from({ length: normalizedImageCount(count) }, request));
  return {
    candidates: responses.flatMap((response) => Array.isArray(response?.candidates) ? response.candidates : []),
    text: responses.map(extractText).filter(Boolean).join("\n"),
    responses
  };
}

async function synthesizeSpeech({ provider, model, input, voice, signal }) {
  assertCapability(provider, "tts");
  const voiceName = voice && !["alloy", "ash", "coral", "echo", "sage"].includes(voice) ? voice : "Kore";
  return fetchJson(providerUrl(provider, `/models/${encodeURIComponent(model)}:generateContent`), {
    headers: authHeaders(provider),
    body: {
      contents: [{ role: "user", parts: [{ text: input }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName }
          }
        }
      }
    },
    signal
  });
}

async function embedText({ provider, model, input, signal }) {
  assertCapability(provider, "embedding");
  const values = Array.isArray(input) ? input : [input];
  const responses = await Promise.all(
    values.map((text) =>
      fetchJson(providerUrl(provider, `/models/${encodeURIComponent(model)}:embedContent`), {
        headers: authHeaders(provider),
        body: {
          content: { parts: [{ text: String(text || "") }] },
          taskType: "RETRIEVAL_DOCUMENT"
        },
        signal
      })
    )
  );
  return {
    embeddings: responses
      .map((json) => json.embedding?.values || json.embeddings?.[0]?.values)
      .filter((embedding) => Array.isArray(embedding)),
    raw: responses
  };
}

async function transcribeAudio({ provider, model, dataUrl, mimeType, signal }) {
  assertCapability(provider, "stt");
  const payload = dataUrlPayload(dataUrl);
  if (!payload) throw new Error("Invalid audio data");
  const json = await fetchJson(providerUrl(provider, `/models/${encodeURIComponent(model)}:generateContent`), {
    headers: authHeaders(provider),
    body: {
      contents: [
        {
          role: "user",
          parts: [
            { text: "请把这段音频完整转写成文本，只输出转写内容。" },
            { inlineData: { mimeType: mimeType || payload.mimeType, data: payload.base64 } }
          ]
        }
      ]
    },
    signal
  });
  return { text: extractText(json), raw: json };
}

function unsupported(capability) {
  throw new Error(`Gemini ${capability} is not enabled in this adapter`);
}

export function createGeminiAdapter(provider) {
  return {
    kind: "gemini",
    streamChat: async (params) => {
      const text = await completeText({ provider, ...params });
      if (text) params.onToken(text);
    },
    completeText: (params) => completeText({ provider, ...params }),
    generateImage: (params) => generateImage({ provider, ...params }),
    synthesizeSpeech: (params) => synthesizeSpeech({ provider, ...params }),
    transcribeAudio: (params) => transcribeAudio({ provider, ...params }),
    generateVideo: () => unsupported("video generation"),
    embedText: (params) => embedText({ provider, ...params })
  };
}
