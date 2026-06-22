import { createAnthropicAdapter } from "../server/providers/anthropic.mjs";
import { createGeminiAdapter } from "../server/providers/gemini.mjs";
import { createOpenAIAdapter } from "../server/providers/openai.mjs";
import { createOpenAICompatibleAdapter } from "../server/providers/openai-compatible.mjs";
import { defaultCapabilities } from "../server/providers/types.mjs";

const originalFetch = globalThis.fetch;
const imageDataUrl = "data:image/png;base64,aW1hZ2U=";
const audioDataUrl = "data:audio/webm;base64,YXVkaW8=";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}

function assertIncludes(value, expected, message) {
  assert(String(value).includes(expected), `${message}. Missing ${expected} in ${value}`);
}

function assertThrows(fn, pattern, message) {
  try {
    fn();
  } catch (error) {
    assert(pattern.test(error.message), `${message}. Received ${error.message}`);
    return;
  }
  throw new Error(`${message}. Expected throw.`);
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function assetResponse(value = "audio-bytes", contentType = "audio/mpeg") {
  return new Response(Buffer.from(value), {
    headers: { "content-type": contentType }
  });
}

function sseResponse(events) {
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(events.join("")));
      controller.close();
    }
  });
  return new Response(body, {
    headers: { "content-type": "text/event-stream" }
  });
}

function chunkedSseResponse(chunks) {
  const body = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(new TextEncoder().encode(chunk));
      }
      controller.close();
    }
  });
  return new Response(body, {
    headers: { "content-type": "text/event-stream" }
  });
}

function parseJsonBody(request) {
  assert(typeof request.init.body === "string", `${request.label} body should be JSON string`);
  return JSON.parse(request.init.body);
}

function headerValue(headers, key) {
  if (!headers) return "";
  if (typeof headers.get === "function") return headers.get(key) || "";
  const found = Object.entries(headers).find(([name]) => name.toLowerCase() === key.toLowerCase());
  return found ? String(found[1]) : "";
}

function installMockFetch(label, handlers) {
  const calls = [];
  let index = 0;
  globalThis.fetch = async (url, init = {}) => {
    if (index >= handlers.length) {
      throw new Error(`${label}: unexpected fetch ${String(url)}`);
    }
    const request = {
      label,
      index,
      url: String(url),
      init
    };
    calls.push(request);
    const handler = handlers[index];
    index += 1;
    return handler(request);
  };
  return {
    calls,
    assertDone() {
      assertEqual(index, handlers.length, `${label}: not all mocked fetch handlers were used`);
    }
  };
}

async function withMockFetch(label, handlers, run) {
  const mock = installMockFetch(label, handlers);
  try {
    await run(mock);
    mock.assertDone();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function provider(kind, capabilities, baseUrl = `https://${kind}.contract.test/v1`) {
  return {
    id: `${kind}-contract`,
    name: `${kind} contract`,
    kind,
    baseUrl,
    apiKey: `dummy-${kind}-key`,
    capabilities
  };
}

function sampleMessages() {
  return [
    { role: "system", content: "System prompt" },
    { role: "user", content: "Hello" }
  ];
}

function toolDefinition() {
  return {
    name: "lookup",
    description: "Lookup test data",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"]
    }
  };
}

function assertNoPendingFetch(label) {
  globalThis.fetch = async (url) => {
    throw new Error(`${label}: real or unmocked network call attempted: ${String(url)}`);
  };
}

async function testOpenAIAdapter() {
  const openai = provider("openai", ["chat", "vision", "toolCalling", "image", "tts", "stt", "embedding"]);
  const adapter = createOpenAIAdapter(openai);

  await withMockFetch("openai chat", [
    (request) => {
      assertIncludes(request.url, "/responses", "OpenAI chat should use Responses API");
      assertEqual(headerValue(request.init.headers, "Authorization"), `Bearer ${openai.apiKey}`, "OpenAI auth header");
      const body = parseJsonBody(request);
      assertEqual(body.model, "gpt-contract", "OpenAI chat model");
      assertEqual(body.instructions, "System prompt", "OpenAI system prompt maps to instructions");
      assertEqual(body.input[0].role, "user", "OpenAI input role");
      return jsonResponse({ output_text: "openai text" });
    }
  ], async () => {
    const text = await adapter.completeText({
      model: "gpt-contract",
      messages: sampleMessages(),
      temperature: 0.2
    });
    assertEqual(text, "openai text", "OpenAI response text extraction");
  });

  await withMockFetch("openai vision", [
    (request) => {
      const body = parseJsonBody(request);
      assertEqual(body.input[0].content[1].type, "input_image", "OpenAI image maps to input_image");
      assertEqual(body.input[0].content[1].image_url, imageDataUrl, "OpenAI image URL carries data URL");
      return jsonResponse({ output_text: "vision ok" });
    }
  ], async () => {
    await adapter.completeText({
      model: "gpt-vision-contract",
      messages: [
        { role: "system", content: "System prompt" },
        { role: "user", content: [{ type: "text", text: "Look" }, { type: "image", dataUrl: imageDataUrl }] }
      ],
      temperature: 0.1
    });
  });

  await withMockFetch("openai tools", [
    (request) => {
      const body = parseJsonBody(request);
      assertEqual(body.tools[0].type, "function", "OpenAI tool type");
      return jsonResponse({
        id: "resp-1",
        output: [{ type: "function_call", call_id: "call-1", name: "lookup", arguments: "{\"query\":\"x\"}" }]
      });
    },
    (request) => {
      const body = parseJsonBody(request);
      assertEqual(body.previous_response_id, "resp-1", "OpenAI tool loop previous response id");
      assertEqual(body.input[0].type, "function_call_output", "OpenAI tool output type");
      assertEqual(body.input[0].call_id, "call-1", "OpenAI tool output call id");
      return jsonResponse({ output_text: "tool final" });
    }
  ], async () => {
    const result = await adapter.completeText({
      model: "gpt-tool-contract",
      messages: sampleMessages(),
      temperature: 0.1,
      tools: [toolDefinition()],
      runTool: async (call) => ({ ok: call.arguments.query === "x" })
    });
    assertEqual(result, "tool final", "OpenAI tool final text");
  });

  await withMockFetch("openai media and embeddings", [
    (request) => {
      assertIncludes(request.url, "/images/generations", "OpenAI image endpoint");
      const body = parseJsonBody(request);
      assertEqual(body.size, "1024x1024", "OpenAI image size");
      return jsonResponse({ data: [{ url: "https://asset.test/image.png" }] });
    },
    (request) => {
      assertIncludes(request.url, "/audio/speech", "OpenAI speech endpoint");
      return assetResponse("speech");
    },
    (request) => {
      assertIncludes(request.url, "/audio/transcriptions", "OpenAI transcription endpoint");
      assert(request.init.body instanceof FormData, "OpenAI transcription should use FormData");
      assertEqual(request.init.body.get("model"), "gpt-transcribe", "OpenAI transcription model");
      assert(request.init.body.get("file"), "OpenAI transcription should include file");
      return jsonResponse({ text: "transcript" });
    },
    (request) => {
      assertIncludes(request.url, "/embeddings", "OpenAI embedding endpoint");
      const body = parseJsonBody(request);
      assertEqual(body.model, "text-embedding-contract", "OpenAI embedding model");
      return jsonResponse({ data: [{ index: 0, embedding: [1, 2, 3] }], usage: { total_tokens: 3 } });
    }
  ], async () => {
    const image = await adapter.generateImage({ model: "gpt-image", prompt: "image", size: "1024x1024" });
    assertEqual(image.data[0].url, "https://asset.test/image.png", "OpenAI image response URL");
    const speech = await adapter.synthesizeSpeech({ model: "gpt-tts", input: "hello", voice: "alloy", format: "mp3" });
    assert(speech.dataUrl.startsWith("data:audio/mpeg;base64,"), "OpenAI speech returns data URL");
    const transcript = await adapter.transcribeAudio({
      model: "gpt-transcribe",
      fileBuffer: Buffer.from("audio"),
      fileName: "voice.webm",
      mimeType: "audio/webm"
    });
    assertEqual(transcript.text, "transcript", "OpenAI transcription response");
    const embeddings = await adapter.embedText({ model: "text-embedding-contract", input: "embed me" });
    assertEqual(embeddings.embeddings[0][2], 3, "OpenAI embeddings parse");
  });
}

async function testAnthropicAdapter() {
  const claude = provider("anthropic", ["chat", "vision", "toolCalling"], "https://claude.contract.test/v1");
  const adapter = createAnthropicAdapter(claude);

  await withMockFetch("claude chat vision", [
    (request) => {
      assertIncludes(request.url, "/messages", "Claude messages endpoint");
      assertEqual(headerValue(request.init.headers, "x-api-key"), claude.apiKey, "Claude API key header");
      assertEqual(headerValue(request.init.headers, "anthropic-version"), "2023-06-01", "Claude version header");
      const body = parseJsonBody(request);
      assertEqual(body.system, "System prompt", "Claude system prompt");
      assertEqual(body.messages[0].content[1].source.type, "base64", "Claude image source");
      assertEqual(body.messages[0].content[1].source.media_type, "image/png", "Claude image media type");
      return jsonResponse({ content: [{ type: "text", text: "claude text" }] });
    }
  ], async () => {
    const text = await adapter.completeText({
      model: "claude-contract",
      messages: [
        { role: "system", content: "System prompt" },
        { role: "user", content: [{ type: "text", text: "Look" }, { type: "image", dataUrl: imageDataUrl }] }
      ],
      temperature: 0.2
    });
    assertEqual(text, "claude text", "Claude response extraction");
  });

  await withMockFetch("claude tools", [
    (request) => {
      const body = parseJsonBody(request);
      assertEqual(body.tools[0].input_schema.type, "object", "Claude tool schema");
      return jsonResponse({ content: [{ type: "tool_use", id: "tool-1", name: "lookup", input: { query: "x" } }] });
    },
    (request) => {
      const body = parseJsonBody(request);
      const last = body.messages[body.messages.length - 1];
      assertEqual(last.role, "user", "Claude tool result role");
      assertEqual(last.content[0].type, "tool_result", "Claude tool result type");
      assertEqual(last.content[0].tool_use_id, "tool-1", "Claude tool result id");
      return jsonResponse({ content: [{ type: "text", text: "claude final" }] });
    }
  ], async () => {
    const result = await adapter.completeText({
      model: "claude-tool-contract",
      messages: sampleMessages(),
      temperature: 0.1,
      tools: [toolDefinition()],
      runTool: async () => ({ ok: true })
    });
    assertEqual(result, "claude final", "Claude tool final text");
  });

  assertNoPendingFetch("claude unsupported");
  assertThrows(() => adapter.generateImage(), /image generation/, "Claude image generation should be unsupported");
  assertThrows(() => adapter.embedText(), /embeddings/, "Claude embeddings should be unsupported");
}

async function testGeminiAdapter() {
  const gemini = provider("gemini", ["chat", "vision", "toolCalling", "image", "tts", "stt", "embedding"], "https://gemini.contract.test/v1beta");
  const adapter = createGeminiAdapter(gemini);

  await withMockFetch("gemini chat vision", [
    (request) => {
      assertIncludes(request.url, "/models/gemini-contract%2Fmodel:generateContent", "Gemini generateContent endpoint encodes model");
      assertEqual(headerValue(request.init.headers, "x-goog-api-key"), gemini.apiKey, "Gemini API key header");
      const body = parseJsonBody(request);
      assertEqual(body.systemInstruction.parts[0].text, "System prompt", "Gemini system instruction");
      assertEqual(body.contents[0].parts[1].inlineData.mimeType, "image/png", "Gemini image inline data");
      return jsonResponse({ candidates: [{ content: { parts: [{ text: "gemini text" }] } }] });
    }
  ], async () => {
    const text = await adapter.completeText({
      model: "gemini-contract/model",
      messages: [
        { role: "system", content: "System prompt" },
        { role: "user", content: [{ type: "text", text: "Look" }, { type: "image", dataUrl: imageDataUrl }] }
      ],
      temperature: 0.2
    });
    assertEqual(text, "gemini text", "Gemini response extraction");
  });

  await withMockFetch("gemini tools", [
    (request) => {
      const body = parseJsonBody(request);
      assertEqual(body.tools[0].functionDeclarations[0].name, "lookup", "Gemini tool declaration");
      return jsonResponse({ candidates: [{ content: { parts: [{ functionCall: { name: "lookup", args: { query: "x" } } }] } }] });
    },
    (request) => {
      const body = parseJsonBody(request);
      const last = body.contents[body.contents.length - 1];
      assertEqual(last.parts[0].functionResponse.name, "lookup", "Gemini function response name");
      assertEqual(last.parts[0].functionResponse.response.ok, true, "Gemini function response object");
      return jsonResponse({ candidates: [{ content: { parts: [{ text: "gemini final" }] } }] });
    }
  ], async () => {
    const result = await adapter.completeText({
      model: "gemini-tool",
      messages: sampleMessages(),
      temperature: 0.1,
      tools: [toolDefinition()],
      runTool: async () => ({ ok: true })
    });
    assertEqual(result, "gemini final", "Gemini tool final text");
  });

  await withMockFetch("gemini media embedding stt", [
    (request) => {
      const body = parseJsonBody(request);
      assertEqual(body.generationConfig.responseModalities[1], "IMAGE", "Gemini image modality");
      assertEqual(body.generationConfig.imageConfig.aspectRatio, "16:9", "Gemini image aspect ratio");
      return jsonResponse({ candidates: [{ content: { parts: [{ text: "image ok" }] } }] });
    },
    (request) => {
      const body = parseJsonBody(request);
      assertEqual(body.generationConfig.responseModalities[0], "AUDIO", "Gemini audio modality");
      assertEqual(body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, "Kore", "Gemini voice fallback");
      return jsonResponse({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/wav", data: "YXVkaW8=" } }] } }] });
    },
    (request) => {
      const body = parseJsonBody(request);
      assertEqual(body.contents[0].parts[1].inlineData.mimeType, "audio/webm", "Gemini STT audio inline data");
      return jsonResponse({ candidates: [{ content: { parts: [{ text: "gemini transcript" }] } }] });
    },
    (request) => {
      assertIncludes(request.url, ":embedContent", "Gemini embedding endpoint");
      const body = parseJsonBody(request);
      assertEqual(body.taskType, "RETRIEVAL_DOCUMENT", "Gemini embedding task type");
      return jsonResponse({ embedding: { values: [4, 5, 6] } });
    }
  ], async () => {
    const image = await adapter.generateImage({ model: "gemini-image", prompt: "image", size: "1280x720" });
    assertEqual(image.candidates[0].content.parts[0].text, "image ok", "Gemini image response parse");
    const audio = await adapter.synthesizeSpeech({ model: "gemini-tts", input: "speak", voice: "alloy" });
    assertEqual(audio.candidates[0].content.parts[0].inlineData.mimeType, "audio/wav", "Gemini audio inline response");
    const transcript = await adapter.transcribeAudio({ model: "gemini-stt", dataUrl: audioDataUrl, mimeType: "audio/webm" });
    assertEqual(transcript.text, "gemini transcript", "Gemini STT response");
    const embeddings = await adapter.embedText({ model: "gemini-embed", input: "embed" });
    assertEqual(embeddings.embeddings[0][1], 5, "Gemini embedding parse");
  });
}

async function testOpenAICompatibleAdapter() {
  const compatible = provider(
    "openai-compatible",
    [...defaultCapabilities("openai-compatible"), "vision"],
    "https://compatible.contract.test/v1"
  );
  const adapter = createOpenAICompatibleAdapter(compatible);

  await withMockFetch("compatible chat", [
    (request) => {
      assertIncludes(request.url, "/chat/completions", "Compatible chat endpoint");
      const body = parseJsonBody(request);
      assertEqual(body.stream, false, "Compatible completeText disables stream");
      assertEqual(body.messages[1].content[1].type, "image_url", "Compatible image content");
      return jsonResponse({ choices: [{ message: { content: "compatible text" } }] });
    }
  ], async () => {
    const text = await adapter.completeText({
      model: "compatible-chat",
      messages: [
        { role: "system", content: "System prompt" },
        { role: "user", content: [{ type: "text", text: "Look" }, { type: "image", dataUrl: imageDataUrl }] }
      ],
      temperature: 0.2
    });
    assertEqual(text, "compatible text", "Compatible response text");
  });

  await withMockFetch("compatible stream", [
    (request) => {
      const body = parseJsonBody(request);
      assertEqual(body.stream, true, "Compatible streamChat enables stream");
      return sseResponse([
        'data: {"choices":[{"delta":{"content":"one"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":" two"}}]}\n\n',
        "data: [DONE]\n\n"
      ]);
    }
  ], async () => {
    let text = "";
    await adapter.streamChat({
      model: "compatible-chat",
      messages: sampleMessages(),
      temperature: 0.2,
      onToken: (token) => {
        text += token;
      }
    });
    assertEqual(text, "one two", "Compatible SSE parser");
  });

  await withMockFetch("compatible stream chunk boundary", [
    (request) => {
      const body = parseJsonBody(request);
      assertEqual(body.stream, true, "Compatible chunked stream enables stream");
      return chunkedSseResponse([
        'data: {"choices":[{"delta":{"content":"chu',
        'nk"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"ed"}}]}\n\n',
        "data: [DONE]\n\n"
      ]);
    }
  ], async () => {
    let text = "";
    await adapter.streamChat({
      model: "compatible-chat",
      messages: sampleMessages(),
      temperature: 0.2,
      onToken: (token) => {
        text += token;
      }
    });
    assertEqual(text, "chunked", "Compatible SSE parser handles chunk boundaries");
  });

  await withMockFetch("compatible tools", [
    (request) => {
      const body = parseJsonBody(request);
      assertEqual(body.tools[0].function.name, "lookup", "Compatible tool schema");
      return jsonResponse({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                { id: "tool-call-1", type: "function", function: { name: "lookup", arguments: "{\"query\":\"x\"}" } }
              ]
            }
          }
        ]
      });
    },
    (request) => {
      const body = parseJsonBody(request);
      const last = body.messages[body.messages.length - 1];
      assertEqual(last.role, "tool", "Compatible tool response role");
      assertEqual(last.tool_call_id, "tool-call-1", "Compatible tool response id");
      return jsonResponse({ choices: [{ message: { content: "compatible final" } }] });
    }
  ], async () => {
    const result = await adapter.completeText({
      model: "compatible-tool",
      messages: sampleMessages(),
      temperature: 0.1,
      tools: [toolDefinition()],
      runTool: async () => ({ ok: true })
    });
    assertEqual(result, "compatible final", "Compatible tool final text");
  });

  await withMockFetch("compatible media embedding video", [
    (request) => {
      assertIncludes(request.url, "/images/generations", "Compatible image endpoint");
      return jsonResponse({ data: [{ url: "https://asset.test/image.png" }] });
    },
    (request) => {
      assertIncludes(request.url, "/audio/speech", "Compatible speech endpoint");
      return assetResponse("speech");
    },
    (request) => {
      assertIncludes(request.url, "/audio/transcriptions", "Compatible STT endpoint");
      assert(request.init.body instanceof FormData, "Compatible STT should use FormData");
      assert(request.init.body.get("file"), "Compatible STT includes file");
      return jsonResponse({ text: "compatible transcript" });
    },
    (request) => {
      assertIncludes(request.url, "/embeddings", "Compatible embedding endpoint");
      return jsonResponse({ data: [{ index: 0, embedding: [7, 8, 9] }] });
    },
    (request) => {
      assertIncludes(request.url, "/vendor/video/create", "Compatible video generate configured path");
      const body = parseJsonBody(request);
      assertEqual(body.size, "1280x720", "Compatible video size");
      return jsonResponse({ id: "job-1", status: "submitted" });
    },
    (request) => {
      assertIncludes(request.url, "/vendor/video/status", "Compatible video status configured path");
      const body = parseJsonBody(request);
      assertEqual(body.id, "job-1", "Compatible video status job id");
      return jsonResponse({ id: "job-1", status: "completed", url: "https://asset.test/video.mp4" });
    }
  ], async () => {
    const image = await adapter.generateImage({ model: "compatible-image", prompt: "image", size: "1024x1024" });
    assertEqual(image.data[0].url, "https://asset.test/image.png", "Compatible image response URL");
    const speech = await adapter.synthesizeSpeech({ model: "compatible-tts", input: "hello", voice: "alloy", format: "mp3" });
    assert(speech.dataUrl.startsWith("data:audio/mpeg;base64,"), "Compatible speech returns data URL");
    const transcript = await adapter.transcribeAudio({
      model: "compatible-stt",
      fileBuffer: Buffer.from("audio"),
      fileName: "voice.webm",
      mimeType: "audio/webm"
    });
    assertEqual(transcript.text, "compatible transcript", "Compatible STT response");
    const embeddings = await adapter.embedText({ model: "compatible-embed", input: "embed" });
    assertEqual(embeddings.embeddings[0][2], 9, "Compatible embedding parse");
    const video = await adapter.generateVideo({
      model: "compatible-video",
      prompt: "video",
      size: "1280x720",
      endpointPath: "/vendor/video/create"
    });
    assertEqual(video.id, "job-1", "Compatible video generation job id");
    assertEqual(video.status, "submitted", "Compatible video generation status");
    const videoStatus = await adapter.getVideoStatus({
      model: "compatible-video",
      endpointPath: "/vendor/video/status",
      providerJobId: "job-1"
    });
    assertEqual(videoStatus.status, "completed", "Compatible video status response");
    assertEqual(videoStatus.url, "https://asset.test/video.mp4", "Compatible video status asset URL");
  });
}

async function testFetchHelpers() {
  const helperProvider = provider("openai-compatible", ["chat"], "https://helper.contract.test/v1");
  const adapter = createOpenAICompatibleAdapter(helperProvider);
  await withMockFetch("fetch error compact", [
    () => new Response("x".repeat(1200), { status: 502, headers: { "content-type": "text/plain" } })
  ], async () => {
    try {
      await adapter.completeText({
        model: "helper-chat",
        messages: sampleMessages(),
        temperature: 0
      });
    } catch (error) {
      assertIncludes(error.message, "502", "fetchJson error status");
      assertIncludes(error.message, "xxx", "fetchJson error snippet");
      assert(error.message.length < 780, "fetchJson error should be compacted");
      return;
    }
    throw new Error("fetchJson error path should throw");
  });
}

const tests = [
  ["OpenAI adapter contracts", testOpenAIAdapter],
  ["Claude adapter contracts", testAnthropicAdapter],
  ["Gemini adapter contracts", testGeminiAdapter],
  ["OpenAI-compatible adapter contracts", testOpenAICompatibleAdapter],
  ["Fetch helper error contracts", testFetchHelpers]
];

for (const [name, run] of tests) {
  try {
    await run();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error);
    process.exitCode = 1;
    break;
  } finally {
    globalThis.fetch = originalFetch;
  }
}

if (!process.exitCode) {
  console.log("Provider contract checks passed");
}
