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

function mapTools(tools = []) {
  const declarations = normalizeTools(tools).map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters
  }));
  return declarations.length ? [{ functionDeclarations: declarations }] : undefined;
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
  const contents = [...mapped.contents];
  const mappedTools = mapTools(tools);

  for (let round = 0; round <= maxToolRounds; round += 1) {
    const json = await fetchJson(providerUrl(provider, `/models/${encodeURIComponent(model)}:generateContent`), {
      headers: authHeaders(provider),
      body: {
        contents,
        systemInstruction: mapped.system ? { parts: [{ text: mapped.system }] } : undefined,
        generationConfig: { temperature },
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
            response: toFunctionResponse(await runTool(toolCall))
          }
        }))
      )
    });
  }

  throw new Error("Tool call limit reached before the model produced a final answer");
}

async function completeText(params) {
  const { provider, model, messages, temperature, signal, tools, runTool } = params;
  if (tools?.length && runTool) return completeWithTools(params);
  assertCapability(provider, "chat");
  if (hasImageContent(messages)) assertCapability(provider, "vision");
  const mapped = mapMessages(messages);
  const json = await fetchJson(providerUrl(provider, `/models/${encodeURIComponent(model)}:generateContent`), {
    headers: authHeaders(provider),
    body: {
      contents: mapped.contents,
      systemInstruction: mapped.system ? { parts: [{ text: mapped.system }] } : undefined,
      generationConfig: { temperature }
    },
    signal
  });
  return extractText(json) || JSON.stringify(json);
}

async function generateImage({ provider, model, prompt, size, signal }) {
  assertCapability(provider, "image");
  return fetchJson(providerUrl(provider, `/models/${encodeURIComponent(model)}:generateContent`), {
    headers: authHeaders(provider),
    body: {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig: aspectRatioForSize(size) ? { aspectRatio: aspectRatioForSize(size) } : undefined
      }
    },
    signal
  });
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
