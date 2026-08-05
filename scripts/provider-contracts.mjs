import { createAnthropicAdapter } from "../server/providers/anthropic.mjs";
import { createBotcfAdapter } from "../server/providers/botcf.mjs";
import { createDeepSeekAdapter } from "../server/providers/deepseek.mjs";
import { createGeminiAdapter } from "../server/providers/gemini.mjs";
import { createKimiAdapter } from "../server/providers/kimi.mjs";
import { createOpenAIAdapter } from "../server/providers/openai.mjs";
import { createOpenAICompatibleAdapter } from "../server/providers/openai-compatible.mjs";
import { createQwenAdapter } from "../server/providers/qwen.mjs";
import { createProviderAdapter } from "../server/providers/registry.mjs";
import { defaultCapabilities, fetchJson, providerUrl } from "../server/providers/types.mjs";
import {
  buildRuntimeProvider,
  defaultModelCatalog,
  findModelEntry,
  normalizeCatalogEntry
} from "../server/registry/model-registry.mjs";

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

function assertAbsent(value, key, message) {
  assert(!Object.prototype.hasOwnProperty.call(value, key), `${message}. Unexpected ${key}`);
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

async function assertRejects(fn, pattern, message) {
  try {
    await fn();
  } catch (error) {
    assert(pattern.test(error.message), `${message}. Received ${error.message}`);
    return;
  }
  throw new Error(`${message}. Expected rejection.`);
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

const reasoningEfforts = ["default", "off", "low", "medium", "high", "xhigh"];

async function assertReasoningMappings(label, adapter, { model, expected }) {
  await withMockFetch(
    label,
    reasoningEfforts.map((reasoningEffort) => (request) => {
      expected(parseJsonBody(request), reasoningEffort);
      return jsonResponse({});
    }),
    async () => {
      for (const reasoningEffort of reasoningEfforts) {
        await adapter.completeText({
          model,
          messages: sampleMessages(),
          temperature: 0.2,
          topP: 0.8,
          reasoningEffort
        });
      }
    }
  );
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

async function testCatalogModelMapping() {
  const stableModelId = "catalog-short-label";
  const shortDisplayLabel = "Quick Chat";
  const actualRequestModel = "gpt-5.6-provider-production-chat-long-context-2026-07-21";
  const catalog = [{
    id: stableModelId,
    vendor: "openai",
    model: actualRequestModel,
    label: shortDisplayLabel,
    capabilities: ["chat"],
    defaultFor: ["chat"],
    enabled: true
  }];
  const requestPayload = { modelId: stableModelId };
  const entry = findModelEntry(catalog, requestPayload.modelId);

  assert(entry, "Stable model ID should resolve to a catalog entry");
  assertEqual(entry.id, stableModelId, "Catalog resolution preserves the stable request ID");
  assertEqual(entry.label, shortDisplayLabel, "Catalog resolution preserves the frontend display label");
  assertEqual(entry.model, actualRequestModel, "Catalog resolution selects the actual provider model name");
  assertEqual(entry.endpointProtocol, "openai-responses", "Legacy OpenAI catalog records default to Responses");
  assertEqual(findModelEntry(catalog, shortDisplayLabel), undefined, "Display labels must not resolve as request IDs");
  assertEqual(
    defaultModelCatalog().find((model) => model.id === "compatible-chat")?.contextWindowTokens,
    1_047_576,
    "Known default models expose their inferred context window"
  );
  assertEqual(
    defaultModelCatalog().find((model) => model.id === "compatible-chat")?.maxInputCharacters,
    100_000,
    "Default models expose an independent maximum input character count"
  );
  assertEqual(
    normalizeCatalogEntry({
      id: "legacy-claude",
      vendor: "anthropic",
      model: "claude-legacy",
      label: "Legacy Claude",
      capabilities: ["chat"],
      defaultFor: [],
      enabled: true
    }).contextWindowTokens,
    200_000,
    "Legacy catalog records receive a conservative vendor context window"
  );
  assertEqual(
    normalizeCatalogEntry({
      id: "legacy-input-limit",
      vendor: "openai-compatible",
      model: "legacy-input-limit",
      label: "Legacy Input Limit",
      capabilities: ["chat"],
      defaultFor: [],
      enabled: true
    }).maxInputCharacters,
    100_000,
    "Legacy catalog records receive an independent input character limit"
  );

  const runtimeProvider = buildRuntimeProvider(entry, {
    baseUrl: "https://catalog.contract.test/v1",
    apiKey: "dummy-catalog-key"
  });
  assertEqual(runtimeProvider.name, shortDisplayLabel, "Runtime provider keeps the frontend display label");
  assertEqual(runtimeProvider.defaultModel, actualRequestModel, "Runtime provider defaults to the actual model name");
  assertEqual(runtimeProvider.endpointProtocol, "openai-responses", "Runtime provider preserves the model endpoint protocol");

  const adapter = createOpenAIAdapter(runtimeProvider);
  await withMockFetch("catalog model mapping", [
    (request) => {
      const body = parseJsonBody(request);
      assertEqual(body.model, actualRequestModel, "Provider request uses the mapped actual model name");
      assert(body.model !== shortDisplayLabel, "Provider request must not use the frontend display label");
      return jsonResponse({ output_text: "mapped model response" });
    }
  ], async () => {
    const text = await adapter.completeText({
      model: entry.model,
      messages: sampleMessages()
    });
    assertEqual(text, "mapped model response", "Mapped model provider response extraction");
  });
}

async function testModelEndpointProtocolRouting() {
  const chatCapabilities = ["chat", "vision", "toolCalling"];

  const openAiChat = {
    ...provider("openai", chatCapabilities, "https://routing.contract.test"),
    endpointProtocol: "openai-chat"
  };
  await withMockFetch("OpenAI Chat protocol routing", [
    (request) => {
      assertEqual(request.url, "https://routing.contract.test/v1/chat/completions", "OpenAI Chat exact endpoint");
      const body = parseJsonBody(request);
      assert(Array.isArray(body.messages), "OpenAI Chat uses messages");
      assertEqual(body.messages[0].role, "system", "OpenAI Chat keeps the assistant system role");
      assertEqual(body.messages[0].content, "System prompt", "OpenAI Chat keeps the assistant prompt");
      assertAbsent(body, "input", "OpenAI Chat must not use Responses input");
      return jsonResponse({ choices: [{ message: { content: "chat routed" } }] });
    }
  ], async () => {
    const text = await createProviderAdapter(openAiChat).completeText({
      model: "gpt-chat-route",
      messages: sampleMessages()
    });
    assertEqual(text, "chat routed", "OpenAI Chat response parser");
  });

  const openAiResponses = { ...openAiChat, endpointProtocol: "openai-responses" };
  await withMockFetch("OpenAI Responses protocol routing", [
    (request) => {
      assertEqual(request.url, "https://routing.contract.test/v1/responses", "OpenAI Responses exact endpoint");
      const body = parseJsonBody(request);
      assert(Array.isArray(body.input), "OpenAI Responses uses input items");
      assertEqual(body.instructions, "System prompt", "OpenAI Responses maps the assistant prompt to instructions");
      assertEqual(body.input[0].role, "user", "Official OpenAI Responses does not duplicate instructions into input");
      assertAbsent(body, "messages", "OpenAI Responses must not use Chat messages");
      return jsonResponse({ output_text: "responses routed" });
    }
  ], async () => {
    const text = await createProviderAdapter(openAiResponses).completeText({
      model: "gpt-responses-route",
      messages: sampleMessages()
    });
    assertEqual(text, "responses routed", "OpenAI Responses parser");
  });

  const compatibleResponses = {
    ...provider("openai-compatible", chatCapabilities, "https://routing.contract.test"),
    endpointProtocol: "openai-responses"
  };
  await withMockFetch("Compatible Responses prompt fallback", [
    (request) => {
      const body = parseJsonBody(request);
      assertEqual(body.instructions, "System prompt", "Compatible Responses keeps top-level instructions");
      assertEqual(body.input[0].role, "developer", "Compatible Responses receives a developer prompt fallback");
      assertEqual(body.input[0].content, "System prompt", "Compatible Responses fallback keeps the assistant prompt");
      assertEqual(body.input[1].role, "user", "Compatible Responses keeps user input after the fallback");
      return jsonResponse({ output_text: "compatible responses routed" });
    }
  ], async () => {
    const text = await createProviderAdapter(compatibleResponses).completeText({
      model: "compatible-responses-route",
      messages: sampleMessages()
    });
    assertEqual(text, "compatible responses routed", "Compatible Responses parser");
  });

  await withMockFetch("Compatible Responses tool-round prompt fallback", [
    (request) => {
      const body = parseJsonBody(request);
      assertEqual(body.instructions, "System prompt", "Compatible Responses first tool round keeps instructions");
      assertEqual(body.input[0].role, "developer", "Compatible Responses first tool round keeps developer fallback");
      return jsonResponse({
        id: "compatible-responses-tool-1",
        output: [{ type: "function_call", call_id: "compatible-call-1", name: "lookup", arguments: "{\"query\":\"x\"}" }]
      });
    },
    (request) => {
      const body = parseJsonBody(request);
      assertEqual(body.instructions, "System prompt", "Compatible Responses follow-up tool round keeps instructions");
      assertEqual(body.input[0].role, "developer", "Compatible Responses follow-up tool round keeps developer fallback");
      assertEqual(body.input[1].type, "function_call_output", "Compatible Responses keeps tool output after developer fallback");
      return jsonResponse({ output_text: "compatible tool final" });
    }
  ], async () => {
    const text = await createProviderAdapter(compatibleResponses).completeText({
      model: "compatible-responses-tool-route",
      messages: sampleMessages(),
      tools: [toolDefinition()],
      runTool: async () => ({ ok: true })
    });
    assertEqual(text, "compatible tool final", "Compatible Responses tool parser");
  });

  const openAiImageWithStoredResponses = {
    ...provider("openai", ["image", "imageEdit"], "https://routing.contract.test"),
    endpointProtocol: "openai-responses"
  };
  await withMockFetch("Stored Chat protocol does not route OpenAI image generation", [
    (request) => {
      assertEqual(
        request.url,
        "https://routing.contract.test/v1/images/generations",
        "OpenAI image generation keeps its dedicated endpoint"
      );
      const body = parseJsonBody(request);
      assertEqual(body.model, "gpt-image-route", "OpenAI image route keeps the mapped model");
      return jsonResponse({ data: [{ b64_json: "aW1hZ2U=" }] });
    }
  ], async () => {
    await createProviderAdapter(openAiImageWithStoredResponses).generateImage({
      model: "gpt-image-route",
      prompt: "dedicated image endpoint",
      mode: "generate",
      count: 1
    });
  });

  const anthropicMessages = { ...openAiChat, endpointProtocol: "anthropic-messages" };
  await withMockFetch("Anthropic Messages protocol routing", [
    (request) => {
      assertEqual(request.url, "https://routing.contract.test/v1/messages", "Anthropic Messages exact endpoint");
      assertEqual(headerValue(request.init.headers, "x-api-key"), anthropicMessages.apiKey, "Anthropic protocol auth header");
      const body = parseJsonBody(request);
      assert(Array.isArray(body.messages), "Anthropic protocol uses Messages content");
      assertEqual(body.system, "System prompt", "Anthropic maps the assistant prompt to top-level system");
      return jsonResponse({ content: [{ type: "text", text: "anthropic routed" }] });
    }
  ], async () => {
    const text = await createProviderAdapter(anthropicMessages).completeText({
      model: "claude-route",
      messages: sampleMessages()
    });
    assertEqual(text, "anthropic routed", "Anthropic Messages parser");
  });

  const geminiGenerateContent = { ...openAiChat, endpointProtocol: "gemini-generate-content" };
  await withMockFetch("Gemini generateContent protocol routing", [
    (request) => {
      assertEqual(
        request.url,
        "https://routing.contract.test/v1beta/models/gemini-route:generateContent",
        "Gemini generateContent exact endpoint"
      );
      assertEqual(headerValue(request.init.headers, "x-goog-api-key"), geminiGenerateContent.apiKey, "Gemini protocol auth header");
      const body = parseJsonBody(request);
      assert(Array.isArray(body.contents), "Gemini protocol uses contents and parts");
      assertEqual(body.systemInstruction.parts[0].text, "System prompt", "Gemini maps the assistant prompt to systemInstruction");
      return jsonResponse({ candidates: [{ content: { parts: [{ text: "gemini routed" }] } }] });
    }
  ], async () => {
    const text = await createProviderAdapter(geminiGenerateContent).completeText({
      model: "gemini-route",
      messages: sampleMessages()
    });
    assertEqual(text, "gemini routed", "Gemini generateContent parser");
  });

  const kimiChat = {
    ...provider("kimi", chatCapabilities, "https://routing.contract.test"),
    endpointProtocol: "openai-chat"
  };
  await withMockFetch("Kimi model routed through OpenAI Chat", [
    (request) => {
      assertEqual(request.url, "https://routing.contract.test/v1/chat/completions", "Kimi exact Chat endpoint");
      const body = parseJsonBody(request);
      assertEqual(body.max_completion_tokens, 4096, "Kimi keeps its Chat parameter normalization");
      assertAbsent(body, "max_tokens", "Kimi removes the generic max_tokens field");
      assertAbsent(body, "temperature", "Kimi fixed sampling removes temperature");
      return jsonResponse({ choices: [{ message: { content: "kimi routed" } }] });
    }
  ], async () => {
    const text = await createProviderAdapter(kimiChat).completeText({
      model: "kimi-k2.6",
      messages: sampleMessages(),
      temperature: 0.5,
      maxTokens: 4096
    });
    assertEqual(text, "kimi routed", "Kimi Chat response parser");
  });

  const geminiVendorWithChat = {
    ...provider("gemini", [...chatCapabilities, "image", "imageEdit"], "https://routing.contract.test"),
    endpointProtocol: "openai-chat"
  };
  const composedAdapter = createProviderAdapter(geminiVendorWithChat);
  await withMockFetch("Chat protocol does not replace Gemini media methods", [
    (request) => {
      assertEqual(request.url, "https://routing.contract.test/v1/chat/completions", "Gemini vendor chat override endpoint");
      return jsonResponse({ choices: [{ message: { content: "gateway chat" } }] });
    },
    (request) => {
      assertEqual(
        request.url,
        "https://routing.contract.test/v1beta/models/gemini-image-route:generateContent",
        "Gemini media keeps its native endpoint"
      );
      return jsonResponse({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "aW1hZ2U=" } }] } }] });
    }
  ], async () => {
    await composedAdapter.completeText({ model: "gemini-chat-route", messages: sampleMessages() });
    await composedAdapter.generateImage({
      model: "gemini-image-route",
      prompt: "media routing",
      mode: "generate",
      count: 1
    });
  });
}

async function testOpenAIAdapter() {
  const openai = provider("openai", ["chat", "vision", "toolCalling", "webSearch", "codeExecution", "image", "imageEdit", "tts", "stt", "embedding"]);
  const adapter = createOpenAIAdapter(openai);
  let observedOpenAIUsage = null;

  await withMockFetch("openai chat", [
    (request) => {
      assertIncludes(request.url, "/responses", "OpenAI chat should use Responses API");
      assertEqual(headerValue(request.init.headers, "Authorization"), `Bearer ${openai.apiKey}`, "OpenAI auth header");
      const body = parseJsonBody(request);
      assertEqual(body.model, "gpt-contract", "OpenAI chat model");
      assertEqual(body.instructions, "System prompt", "OpenAI system prompt maps to instructions");
      assertEqual(body.input[0].role, "user", "OpenAI input role");
      assertEqual(body.top_p, 0.8, "OpenAI chat top-p");
      assertEqual(body.max_output_tokens, 2048, "OpenAI chat maximum output tokens");
      assertEqual(body.text.verbosity, "high", "OpenAI response verbosity");
      return jsonResponse({
        output_text: "openai text",
        usage: { input_tokens: 120, output_tokens: 30, total_tokens: 150 }
      });
    }
  ], async () => {
    const text = await adapter.completeText({
      model: "gpt-contract",
      messages: sampleMessages(),
      temperature: 0.2,
      topP: 0.8,
      maxTokens: 2048,
      responseVerbosity: "high",
      onUsage: (usage) => {
        observedOpenAIUsage = usage;
      }
    });
    assertEqual(text, "openai text", "OpenAI response text extraction");
    assertEqual(JSON.stringify(observedOpenAIUsage), JSON.stringify({
      inputTokens: 120,
      outputTokens: 30,
      totalTokens: 150
    }), "OpenAI response usage projection");
  });

  await withMockFetch("openai default verbosity omission", [
    (request) => {
      const body = parseJsonBody(request);
      assertAbsent(body, "text", "OpenAI default verbosity must preserve provider behavior by omission");
      return jsonResponse({ output_text: "default verbosity" });
    }
  ], async () => {
    await adapter.completeText({
      model: "gpt-contract",
      messages: sampleMessages(),
      responseVerbosity: undefined
    });
  });

  await assertReasoningMappings("openai reasoning", adapter, {
    model: "gpt-reasoning-contract",
    expected: (body, reasoningEffort) => {
      const mappedEffort = reasoningEffort === "off" ? "none" : reasoningEffort;
      if (reasoningEffort === "default") {
        assertAbsent(body, "reasoning", "OpenAI default reasoning must be omitted");
      } else {
        assertEqual(body.reasoning?.effort, mappedEffort, `OpenAI ${reasoningEffort} reasoning effort`);
      }
      if (["low", "medium", "high", "xhigh"].includes(reasoningEffort)) {
        assertAbsent(body, "temperature", `OpenAI ${reasoningEffort} reasoning must omit temperature`);
        assertAbsent(body, "top_p", `OpenAI ${reasoningEffort} reasoning must omit top-p`);
      } else {
        assertEqual(body.temperature, 0.2, `OpenAI ${reasoningEffort} keeps temperature`);
        assertEqual(body.top_p, 0.8, `OpenAI ${reasoningEffort} keeps top-p`);
      }
    }
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
      assertEqual(body.instructions, "System prompt", "OpenAI first tool round keeps assistant instructions");
      assertEqual(body.tools[0].type, "function", "OpenAI tool type");
      assertEqual(body.tools[0].strict, true, "OpenAI tool schema is strict");
      return jsonResponse({
        id: "resp-1",
        output: [{ type: "function_call", call_id: "call-1", name: "lookup", arguments: "{\"query\":\"x\"}" }]
      });
    },
    (request) => {
      const body = parseJsonBody(request);
      assertEqual(body.instructions, "System prompt", "OpenAI follow-up tool round keeps assistant instructions");
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

  await withMockFetch("openai hosted tools", [
    (request) => {
      const body = parseJsonBody(request);
      assertEqual(body.tools[0].type, "web_search", "OpenAI hosted search tool type");
      assertEqual(body.tools[1].type, "code_interpreter", "OpenAI hosted code tool type");
      assertEqual(body.tools[1].container.type, "auto", "OpenAI code interpreter auto container");
      return jsonResponse({ output_text: "hosted tool final" });
    }
  ], async () => {
    const result = await adapter.completeText({
      model: "gpt-hosted-contract",
      messages: sampleMessages(),
      hostedTools: [{ name: "web_search" }, { name: "code_execution" }]
    });
    assertEqual(result, "hosted tool final", "OpenAI hosted tool final text");
  });

  await withMockFetch("openai media and embeddings", [
    (request) => {
      assertIncludes(request.url, "/images/generations", "OpenAI image endpoint");
      const body = parseJsonBody(request);
      assertEqual(body.size, "2048x1152", "OpenAI image size");
      assertEqual(body.n, 3, "OpenAI image count");
      assertEqual(body.quality, "high", "OpenAI image quality");
      assertEqual(body.output_format, "webp", "OpenAI image output format");
      assertEqual(body.output_compression, 0, "OpenAI image zero compression value");
      return jsonResponse({
        data: [
          { url: "https://asset.test/image-1.webp" },
          { url: "https://asset.test/image-2.webp" },
          { url: "https://asset.test/image-3.webp" }
        ]
      });
    },
    (request) => {
      assertIncludes(request.url, "/images/edits", "OpenAI image edit endpoint");
      assert(request.init.body instanceof FormData, "OpenAI image editing should use FormData");
      assertEqual(headerValue(request.init.headers, "Content-Type"), "", "OpenAI multipart boundary must be generated by fetch");
      const form = request.init.body;
      assertEqual(form.get("model"), "gpt-image-2", "OpenAI edit model");
      assertEqual(form.get("prompt"), "edit image", "OpenAI edit prompt");
      assertEqual(form.get("n"), "2", "OpenAI edit count");
      assertEqual(form.get("size"), "2048x2048", "OpenAI edit size");
      assertEqual(form.get("quality"), "medium", "OpenAI edit quality");
      assertEqual(form.get("output_format"), "jpeg", "OpenAI edit output format");
      assertEqual(form.get("output_compression"), "0", "OpenAI edit zero compression value");
      const inputImage = form.get("image");
      const maskImage = form.get("mask");
      assert(inputImage instanceof Blob, "OpenAI edit includes the source image");
      assert(maskImage instanceof Blob, "OpenAI edit includes the mask image");
      assertEqual(inputImage.type, "image/png", "OpenAI source image MIME type");
      assertEqual(maskImage.type, "image/png", "OpenAI mask MIME type");
      return jsonResponse({
        data: [
          { b64_json: "ZWRpdC0x" },
          { b64_json: "ZWRpdC0y" }
        ]
      });
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
    const image = await adapter.generateImage({
      model: "gpt-image-2",
      prompt: "image",
      size: "2048x1152",
      count: 3,
      quality: "high",
      outputFormat: "webp",
      outputCompression: 0
    });
    assertEqual(image.data.length, 3, "OpenAI image generation retains every returned asset");
    assertEqual(image.data[2].url, "https://asset.test/image-3.webp", "OpenAI final image response URL");
    const edit = await adapter.generateImage({
      model: "gpt-image-2",
      prompt: "edit image",
      mode: "edit",
      inputImage: { dataUrl: imageDataUrl, name: "source.png", mimeType: "image/png" },
      maskImage: { dataUrl: imageDataUrl, name: "mask.png", mimeType: "image/png" },
      size: "2048x2048",
      count: 2,
      quality: "medium",
      outputFormat: "jpeg",
      outputCompression: 0
    });
    assertEqual(edit.data.length, 2, "OpenAI image editing retains every returned asset");
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
  const claude = provider("anthropic", ["chat", "vision", "toolCalling", "webSearch", "urlContext", "codeExecution"], "https://claude.contract.test/v1");
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
      assertEqual(body.top_p, 0.6, "Claude chat top-p");
      assertEqual(body.max_tokens, 3072, "Claude chat maximum output tokens");
      return jsonResponse({ content: [{ type: "text", text: "claude text" }] });
    }
  ], async () => {
    const text = await adapter.completeText({
      model: "claude-contract",
      messages: [
        { role: "system", content: "System prompt" },
        { role: "user", content: [{ type: "text", text: "Look" }, { type: "image", dataUrl: imageDataUrl }] }
      ],
      temperature: 0.2,
      topP: 0.6,
      maxTokens: 3072
    });
    assertEqual(text, "claude text", "Claude response extraction");
  });

  await assertReasoningMappings("claude reasoning", adapter, {
    model: "claude-sonnet-5",
    expected: (body, reasoningEffort) => {
      if (reasoningEffort === "default") {
        assertAbsent(body, "thinking", "Claude default thinking must be omitted");
        assertAbsent(body, "output_config", "Claude default output effort must be omitted");
      } else if (reasoningEffort === "off") {
        assertEqual(body.thinking?.type, "disabled", "Claude off thinking type");
        assertAbsent(body, "output_config", "Claude off output effort must be omitted");
      } else {
        assertEqual(body.thinking?.type, "adaptive", `Claude ${reasoningEffort} thinking type`);
        assertEqual(
          body.output_config?.effort,
          reasoningEffort === "xhigh" ? "max" : reasoningEffort,
          `Claude ${reasoningEffort} output effort`
        );
      }
      if (["low", "medium", "high", "xhigh"].includes(reasoningEffort)) {
        assertAbsent(body, "temperature", `Claude ${reasoningEffort} reasoning must omit temperature`);
        assertAbsent(body, "top_p", `Claude ${reasoningEffort} reasoning must omit top-p`);
      } else {
        assertEqual(body.temperature, 0.2, `Claude ${reasoningEffort} keeps temperature`);
        assertEqual(body.top_p, 0.8, `Claude ${reasoningEffort} keeps top-p`);
      }
    }
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

  await withMockFetch("claude hosted tools", [
    (request) => {
      const body = parseJsonBody(request);
      assertEqual(body.tools[0].type, "web_search_20250305", "Claude hosted search tool version");
      assertEqual(body.tools[1].type, "web_fetch_20250910", "Claude URL context maps to web fetch");
      assertEqual(body.tools[1].citations.enabled, true, "Claude web fetch citations enabled");
      assertEqual(body.tools[2].type, "code_execution_20250825", "Claude hosted code tool version");
      return jsonResponse({ content: [{ type: "text", text: "claude hosted final" }], stop_reason: "end_turn" });
    }
  ], async () => {
    const result = await adapter.completeText({
      model: "claude-hosted-contract",
      messages: sampleMessages(),
      hostedTools: [{ name: "web_search" }, { name: "url_context" }, { name: "code_execution" }]
    });
    assertEqual(result, "claude hosted final", "Claude hosted tool final text");
  });

  assertNoPendingFetch("claude unsupported");
  assertThrows(() => adapter.generateImage(), /image generation/, "Claude image generation should be unsupported");
  assertThrows(() => adapter.embedText(), /embeddings/, "Claude embeddings should be unsupported");
}

async function testGeminiAdapter() {
  const gemini = provider("gemini", ["chat", "vision", "toolCalling", "webSearch", "urlContext", "codeExecution", "image", "imageEdit", "tts", "stt", "embedding"], "https://gemini.contract.test/v1beta");
  const adapter = createGeminiAdapter(gemini);

  await withMockFetch("gemini chat vision", [
    (request) => {
      assertIncludes(request.url, "/models/gemini-contract%2Fmodel:generateContent", "Gemini generateContent endpoint encodes model");
      assertEqual(headerValue(request.init.headers, "x-goog-api-key"), gemini.apiKey, "Gemini API key header");
      const body = parseJsonBody(request);
      assertEqual(body.systemInstruction.parts[0].text, "System prompt", "Gemini system instruction");
      assertEqual(body.contents[0].parts[1].inlineData.mimeType, "image/png", "Gemini image inline data");
      assertEqual(body.generationConfig.topP, 0.7, "Gemini chat top-p");
      assertEqual(body.generationConfig.maxOutputTokens, 4096, "Gemini chat maximum output tokens");
      return jsonResponse({ candidates: [{ content: { parts: [{ text: "gemini text" }] } }] });
    }
  ], async () => {
    const text = await adapter.completeText({
      model: "gemini-contract/model",
      messages: [
        { role: "system", content: "System prompt" },
        { role: "user", content: [{ type: "text", text: "Look" }, { type: "image", dataUrl: imageDataUrl }] }
      ],
      temperature: 0.2,
      topP: 0.7,
      maxTokens: 4096
    });
    assertEqual(text, "gemini text", "Gemini response extraction");
  });

  await assertReasoningMappings("gemini 3 reasoning", adapter, {
    model: "gemini-3.1-pro-preview",
    expected: (body, reasoningEffort) => {
      const expectedLevel = {
        off: "MINIMAL",
        low: "LOW",
        medium: "MEDIUM",
        high: "HIGH",
        xhigh: "HIGH"
      }[reasoningEffort];
      if (reasoningEffort === "default") {
        assertAbsent(body.generationConfig, "thinkingConfig", "Gemini 3 default thinking must be omitted");
      } else {
        assertEqual(
          body.generationConfig.thinkingConfig?.thinkingLevel,
          expectedLevel,
          `Gemini 3 ${reasoningEffort} thinking level`
        );
      }
      if (["low", "medium", "high", "xhigh"].includes(reasoningEffort)) {
        assertAbsent(body.generationConfig, "temperature", `Gemini 3 ${reasoningEffort} must omit temperature`);
        assertAbsent(body.generationConfig, "topP", `Gemini 3 ${reasoningEffort} must omit top-p`);
      }
    }
  });

  await assertReasoningMappings("gemini 2.5 reasoning", adapter, {
    model: "gemini-2.5-flash",
    expected: (body, reasoningEffort) => {
      const expectedBudget = {
        off: 0,
        low: 1024,
        medium: 4096,
        high: 8192,
        xhigh: 16384
      }[reasoningEffort];
      if (reasoningEffort === "default") {
        assertAbsent(body.generationConfig, "thinkingConfig", "Gemini 2.5 default thinking must be omitted");
      } else {
        assertEqual(
          body.generationConfig.thinkingConfig?.thinkingBudget,
          expectedBudget,
          `Gemini 2.5 ${reasoningEffort} thinking budget`
        );
      }
    }
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

  await withMockFetch("gemini hosted tools", [
    (request) => {
      const body = parseJsonBody(request);
      assertEqual(Object.keys(body.tools[0])[0], "googleSearch", "Gemini hosted search mapping");
      assertEqual(Object.keys(body.tools[1])[0], "urlContext", "Gemini URL context mapping");
      assertEqual(Object.keys(body.tools[2])[0], "codeExecution", "Gemini code execution mapping");
      return jsonResponse({ candidates: [{ content: { parts: [{ text: "gemini hosted final" }] } }] });
    }
  ], async () => {
    const result = await adapter.completeText({
      model: "gemini-3-hosted-contract",
      messages: sampleMessages(),
      hostedTools: [{ name: "web_search" }, { name: "url_context" }, { name: "code_execution" }]
    });
    assertEqual(result, "gemini hosted final", "Gemini hosted tool final text");
  });

  await withMockFetch("gemini image edit fan-out", [
    (request) => {
      assertIncludes(request.url, "/models/gemini-3.1-flash-image:generateContent", "Gemini image edit endpoint");
      const body = parseJsonBody(request);
      assertEqual(body.contents[0].parts.length, 3, "Gemini image edit includes prompt, source, and semantic mask");
      assertIncludes(body.contents[0].parts[0].text, "semantic mask", "Gemini mask must be described semantically");
      assertEqual(body.contents[0].parts[1].inlineData.mimeType, "image/png", "Gemini edit source image MIME type");
      assertEqual(body.contents[0].parts[2].inlineData.mimeType, "image/png", "Gemini semantic mask MIME type");
      assertEqual(body.generationConfig.responseModalities[1], "IMAGE", "Gemini image modality");
      assertEqual(body.generationConfig.imageConfig.aspectRatio, "16:9", "Gemini image aspect ratio");
      assertEqual(body.generationConfig.imageConfig.imageSize, "2K", "Gemini image resolution");
      assertAbsent(body, "n", "Gemini native image requests must omit OpenAI count fields");
      assertAbsent(body, "quality", "Gemini native image requests must omit OpenAI quality fields");
      assertAbsent(body, "output_format", "Gemini native image requests must omit OpenAI format fields");
      return jsonResponse({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "Z2VtaW5pLTE=" } }] } }] });
    },
    (request) => {
      const body = parseJsonBody(request);
      assertEqual(body.contents[0].parts.length, 3, "Gemini fan-out request keeps edit inputs");
      return jsonResponse({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "Z2VtaW5pLTI=" } }] } }] });
    },
    (request) => {
      const body = parseJsonBody(request);
      assertEqual(body.contents[0].parts.length, 3, "Gemini final fan-out request keeps edit inputs");
      return jsonResponse({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "Z2VtaW5pLTM=" } }] } }] });
    }
  ], async (mock) => {
    const image = await adapter.generateImage({
      model: "gemini-3.1-flash-image",
      prompt: "edit image",
      mode: "edit",
      inputImage: { dataUrl: imageDataUrl, name: "source.png", mimeType: "image/png" },
      maskImage: { dataUrl: imageDataUrl, name: "mask.png", mimeType: "image/png" },
      aspectRatio: "16:9",
      imageSize: "2K",
      count: 3
    });
    assertEqual(mock.calls.length, 3, "Gemini exact image count uses bounded request fan-out");
    assertEqual(image.responses.length, 3, "Gemini image response keeps every fan-out response");
    assertEqual(image.candidates.length, 3, "Gemini image response flattens every candidate");
  });

  await withMockFetch("gemini media embedding stt", [
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
      assertEqual(body.top_p, 0.5, "Compatible chat top-p");
      assertEqual(body.max_tokens, 1024, "Compatible chat maximum output tokens");
      return jsonResponse({ choices: [{ message: { content: "compatible text" } }] });
    }
  ], async () => {
    const text = await adapter.completeText({
      model: "compatible-chat",
      messages: [
        { role: "system", content: "System prompt" },
        { role: "user", content: [{ type: "text", text: "Look" }, { type: "image", dataUrl: imageDataUrl }] }
      ],
      temperature: 0.2,
      topP: 0.5,
      maxTokens: 1024
    });
    assertEqual(text, "compatible text", "Compatible response text");
  });

  await assertReasoningMappings("compatible reasoning", adapter, {
    model: "compatible-reasoning",
    expected: (body, reasoningEffort) => {
      if (reasoningEffort === "default") {
        assertAbsent(body, "reasoning_effort", "Compatible default reasoning must be omitted");
      } else {
        assertEqual(
          body.reasoning_effort,
          reasoningEffort === "off" ? "none" : reasoningEffort,
          `Compatible ${reasoningEffort} reasoning effort`
        );
      }
      assertEqual(body.temperature, 0.2, `Compatible ${reasoningEffort} keeps temperature`);
      assertEqual(body.top_p, 0.8, `Compatible ${reasoningEffort} keeps top-p`);
    }
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

  assertNoPendingFetch("compatible hosted tool rejection");
  await assertRejects(
    () => adapter.completeText({ model: "compatible-chat", messages: sampleMessages(), hostedTools: [{ name: "web_search" }] }),
    /does not support provider-hosted tools/,
    "Generic OpenAI-compatible endpoints must reject OpenAI hosted tools"
  );
}

async function testBotcfAdapter() {
  const botcf = provider("botcf", ["image", "imageEdit"], "https://botcf.contract.test/v1");
  const adapter = createBotcfAdapter(botcf);
  const secondImageDataUrl = "data:image/png;base64,aW1hZ2Uy";

  await withMockFetch("botcf image endpoints", [
    (request) => {
      assertIncludes(request.url, "/images/generations", "BotCF text-to-image endpoint");
      assertEqual(headerValue(request.init.headers, "Authorization"), `Bearer ${botcf.apiKey}`, "BotCF auth header");
      const body = parseJsonBody(request);
      assertEqual(body.model, "gpt-image-2", "BotCF text-to-image model");
      assertEqual(body.prompt, "botcf image", "BotCF text-to-image prompt");
      assertEqual(body.n, 2, "BotCF text-to-image count");
      assertEqual(body.size, "2048x2048", "BotCF text-to-image size");
      return jsonResponse({ data: [{ url: "https://asset.test/botcf-1.png" }, { url: "https://asset.test/botcf-2.png" }] });
    },
    (request) => {
      assertIncludes(request.url, "/images/edits", "BotCF multipart edit endpoint");
      assert(request.init.body instanceof FormData, "BotCF local image editing should use FormData");
      assertEqual(headerValue(request.init.headers, "Content-Type"), "", "BotCF multipart boundary must be generated by fetch");
      const form = request.init.body;
      assertEqual(form.get("model"), "gpt-image-2", "BotCF multipart edit model");
      assertEqual(form.get("prompt"), "botcf edit", "BotCF multipart edit prompt");
      assertEqual(form.get("n"), "2", "BotCF multipart edit count");
      assertEqual(form.get("size"), "1536x1024", "BotCF multipart edit size");
      assertEqual(form.getAll("image").length, 1, "BotCF first local reference uses image field");
      assertEqual(form.getAll("image[]").length, 1, "BotCF additional local references use image[] field");
      assert(form.get("image") instanceof Blob, "BotCF first local reference is a Blob");
      assert(form.get("image[]") instanceof Blob, "BotCF second local reference is a Blob");
      return jsonResponse({ data: [{ b64_json: "Ym90Y2YtZWRpdA==" }] });
    },
    (request) => {
      assertIncludes(request.url, "/images/edits", "BotCF URL edit endpoint");
      const body = parseJsonBody(request);
      assertEqual(body.model, "gpt-image-2", "BotCF URL edit model");
      assertEqual(body.prompt, "botcf url edit", "BotCF URL edit prompt");
      assertEqual(body.images.length, 2, "BotCF URL edit keeps multiple references");
      assertEqual(body.images[0].image_url, "https://example.com/one.png", "BotCF URL edit first reference");
      assertEqual(body.images[1].image_url, "https://example.com/two.png", "BotCF URL edit second reference");
      return jsonResponse({ data: [{ url: "https://asset.test/botcf-url.png" }] });
    },
    (request) => {
      assertIncludes(request.url, "/chat/completions", "BotCF Gemini image endpoint");
      const body = parseJsonBody(request);
      assertEqual(body.model, "gemini-3.1-flash-image", "BotCF Gemini image model");
      assertEqual(body.messages[0].role, "user", "BotCF Gemini image role");
      assertEqual(body.messages[0].content[0].type, "text", "BotCF Gemini image prompt part");
      assertEqual(body.messages[0].content[0].text, "botcf gemini", "BotCF Gemini image prompt");
      assertEqual(body.messages[0].content[1].type, "image_url", "BotCF Gemini reference part type");
      assertEqual(body.messages[0].content[1].image_url.url, "https://example.com/reference.png", "BotCF Gemini reference URL");
      return jsonResponse({
        choices: [{
          message: {
            content: [{ type: "image_url", image_url: { url: "https://asset.test/botcf-gemini.png" } }]
          }
        }]
      });
    }
  ], async () => {
    const generated = await adapter.generateImage({
      model: "gpt-image-2",
      prompt: "botcf image",
      count: 2,
      size: "2048x2048"
    });
    assertEqual(generated.data.length, 2, "BotCF text-to-image retains returned assets");

    await adapter.generateImage({
      model: "gpt-image-2",
      prompt: "botcf edit",
      mode: "edit",
      inputImages: [
        { dataUrl: imageDataUrl, name: "one.png", mimeType: "image/png" },
        { dataUrl: secondImageDataUrl, name: "two.png", mimeType: "image/png" }
      ],
      count: 2,
      size: "1536x1024"
    });

    await adapter.generateImage({
      model: "gpt-image-2",
      prompt: "botcf url edit",
      mode: "edit",
      referenceImageUrls: ["https://example.com/one.png", "https://example.com/two.png"]
    });

    await adapter.generateImage({
      model: "gemini-3.1-flash-image",
      prompt: "botcf gemini",
      mode: "edit",
      referenceImageUrls: ["https://example.com/reference.png"]
    });
  });

  assertNoPendingFetch("botcf incompatible edit shapes");
  await assertRejects(
    () => adapter.generateImage({
      model: "gpt-image-2",
      prompt: "mixed botcf edit",
      mode: "edit",
      inputImages: [{ dataUrl: imageDataUrl, name: "one.png", mimeType: "image/png" }],
      referenceImageUrls: ["https://example.com/one.png"]
    }),
    /either uploaded references or public HTTPS reference URLs/,
    "BotCF native image editing must reject mixed local and URL references"
  );
  await assertRejects(
    () => adapter.generateImage({
      model: "gemini-3.1-flash-image",
      prompt: "local gemini edit",
      mode: "edit",
      inputImages: [{ dataUrl: imageDataUrl, name: "one.png", mimeType: "image/png" }]
    }),
    /requires public HTTPS reference URLs/,
    "BotCF Gemini image editing must reject local uploads"
  );
}

async function testKimiAdapter() {
  const kimi = provider("kimi", ["chat"], "https://api.moonshot.ai/v1");
  const adapter = createKimiAdapter(kimi);

  await withMockFetch("kimi fixed sampling", [
    (request) => {
      assertIncludes(request.url, "/chat/completions", "Kimi chat endpoint");
      assertEqual(headerValue(request.init.headers, "Authorization"), `Bearer ${kimi.apiKey}`, "Kimi auth header");
      const body = parseJsonBody(request);
      assertEqual(body.model, "kimi-k3", "Kimi model");
      assertAbsent(body, "temperature", "Kimi fixed sampling must omit temperature");
      assertAbsent(body, "top_p", "Kimi fixed sampling must omit top-p");
      assertAbsent(body, "max_tokens", "Kimi must omit deprecated max_tokens");
      assertEqual(body.max_completion_tokens, 16384, "Kimi maximum output uses max_completion_tokens");
      return jsonResponse({ choices: [{ message: { content: "kimi text" } }] });
    }
  ], async () => {
    const text = await adapter.completeText({
      model: "kimi-k3",
      messages: sampleMessages(),
      temperature: 0.9,
      topP: 0.8,
      maxTokens: 16384
    });
    assertEqual(text, "kimi text", "Kimi response text");
  });

  await assertReasoningMappings("kimi k3 reasoning", adapter, {
    model: "kimi-k3",
    expected: (body, reasoningEffort) => {
      assertAbsent(body, "temperature", `Kimi K3 ${reasoningEffort} must omit temperature`);
      assertAbsent(body, "top_p", `Kimi K3 ${reasoningEffort} must omit top-p`);
      if (["low", "medium", "high", "xhigh"].includes(reasoningEffort)) {
        assertEqual(body.reasoning_effort, "max", `Kimi K3 ${reasoningEffort} maps to max effort`);
      } else {
        assertAbsent(body, "reasoning_effort", `Kimi K3 ${reasoningEffort} reasoning effort must be omitted`);
      }
      assertAbsent(body, "thinking", `Kimi K3 ${reasoningEffort} must not send K2 thinking controls`);
    }
  });

  await assertReasoningMappings("kimi k2.6 reasoning", adapter, {
    model: "kimi-k2.6",
    expected: (body, reasoningEffort) => {
      assertAbsent(body, "reasoning_effort", `Kimi K2.6 ${reasoningEffort} must omit K3 reasoning effort`);
      if (reasoningEffort === "default") {
        assertAbsent(body, "thinking", "Kimi K2.6 default thinking must be omitted");
      } else if (reasoningEffort === "off") {
        assertEqual(body.thinking?.type, "disabled", "Kimi K2.6 off thinking type");
      } else {
        assertEqual(body.thinking?.type, "enabled", `Kimi K2.6 ${reasoningEffort} thinking type`);
        assertEqual(body.thinking?.keep, "all", `Kimi K2.6 ${reasoningEffort} preserves thinking`);
      }
    }
  });

  assertNoPendingFetch("kimi hosted tool rejection");
  await assertRejects(
    () => adapter.completeText({ model: "kimi-k3", messages: sampleMessages(), hostedTools: [{ name: "web_search" }] }),
    /does not support provider-hosted tools/,
    "Kimi must reject undeclared hosted tools"
  );
}

async function testQwenAdapter() {
  const qwen = provider("qwen", ["chat", "webSearch", "codeExecution"], "https://dashscope.aliyuncs.com/compatible-mode/v1");
  const adapter = createQwenAdapter(qwen);

  await withMockFetch("qwen completion tokens", [
    (request) => {
      assertIncludes(request.url, "/chat/completions", "Qwen chat endpoint");
      assertEqual(headerValue(request.init.headers, "Authorization"), `Bearer ${qwen.apiKey}`, "Qwen auth header");
      const body = parseJsonBody(request);
      assertEqual(body.model, "qwen3.7-plus", "Qwen model");
      assertEqual(body.top_p, 0.75, "Qwen chat top-p");
      assertAbsent(body, "max_tokens", "Qwen must omit deprecated max_tokens");
      assertEqual(body.max_completion_tokens, 12288, "Qwen maximum output uses max_completion_tokens");
      return jsonResponse({ choices: [{ message: { content: "qwen text" } }] });
    }
  ], async () => {
    const text = await adapter.completeText({
      model: "qwen3.7-plus",
      messages: sampleMessages(),
      temperature: 0.3,
      topP: 0.75,
      maxTokens: 12288
    });
    assertEqual(text, "qwen text", "Qwen response text");
  });

  await assertReasoningMappings("qwen reasoning", adapter, {
    model: "qwen3.7-plus",
    expected: (body, reasoningEffort) => {
      assertAbsent(body, "reasoning_effort", `Qwen ${reasoningEffort} must omit generic reasoning effort`);
      if (reasoningEffort === "default") {
        assertAbsent(body, "enable_thinking", "Qwen default thinking enablement must be omitted");
        assertAbsent(body, "thinking_budget", "Qwen default thinking budget must be omitted");
      } else if (reasoningEffort === "off") {
        assertEqual(body.enable_thinking, false, "Qwen off disables thinking");
        assertAbsent(body, "thinking_budget", "Qwen off thinking budget must be omitted");
      } else {
        assertEqual(body.enable_thinking, true, `Qwen ${reasoningEffort} enables thinking`);
        assertEqual(
          body.thinking_budget,
          { low: 1024, medium: 4096, high: 8192, xhigh: 16384 }[reasoningEffort],
          `Qwen ${reasoningEffort} thinking budget`
        );
      }
    }
  });

  await withMockFetch("qwen responses hosted tools", [
    (request) => {
      assertIncludes(request.url, "/responses", "Qwen hosted tools use documented Responses-compatible endpoint");
      const body = parseJsonBody(request);
      assertEqual(body.tools[0].type, "web_search", "Qwen hosted search mapping");
      assertEqual(body.tools[1].type, "code_interpreter", "Qwen hosted code mapping");
      assertAbsent(body, "reasoning", "Qwen hosted tools must not inherit OpenAI reasoning syntax");
      assertEqual(body.enable_thinking, true, "Qwen hosted tools preserve Qwen thinking enablement");
      assertEqual(body.thinking_budget, 8192, "Qwen hosted tools preserve Qwen thinking budget");
      return jsonResponse({ output_text: "qwen hosted final" });
    }
  ], async () => {
    const result = await adapter.completeText({
      model: "qwen3.6-flash",
      messages: sampleMessages(),
      hostedTools: [{ name: "web_search" }, { name: "code_execution" }],
      reasoningEffort: "high"
    });
    assertEqual(result, "qwen hosted final", "Qwen hosted tool final text");
  });
}

async function testDeepSeekAdapter() {
  const deepseek = provider("deepseek", ["chat"], "https://api.deepseek.com");
  const adapter = createDeepSeekAdapter(deepseek);

  await withMockFetch("deepseek chat parameters", [
    (request) => {
      assertIncludes(request.url, "/chat/completions", "DeepSeek chat endpoint");
      assertEqual(headerValue(request.init.headers, "Authorization"), `Bearer ${deepseek.apiKey}`, "DeepSeek auth header");
      const body = parseJsonBody(request);
      assertEqual(body.model, "deepseek-v4-flash", "DeepSeek model");
      assertEqual(body.temperature, 0.2, "DeepSeek temperature");
      assertEqual(body.top_p, 0.65, "DeepSeek top-p");
      assertEqual(body.max_tokens, 8192, "DeepSeek maximum output uses max_tokens");
      return jsonResponse({ choices: [{ message: { content: "deepseek text" } }] });
    }
  ], async () => {
    const text = await adapter.completeText({
      model: "deepseek-v4-flash",
      messages: sampleMessages(),
      temperature: 0.2,
      topP: 0.65,
      maxTokens: 8192
    });
    assertEqual(text, "deepseek text", "DeepSeek response text");
  });

  await assertReasoningMappings("deepseek reasoning", adapter, {
    model: "deepseek-v4-flash",
    expected: (body, reasoningEffort) => {
      if (reasoningEffort === "default") {
        assertAbsent(body, "thinking", "DeepSeek default thinking must be omitted");
        assertAbsent(body, "reasoning_effort", "DeepSeek default reasoning effort must be omitted");
      } else if (reasoningEffort === "off") {
        assertEqual(body.thinking?.type, "disabled", "DeepSeek off thinking type");
        assertAbsent(body, "reasoning_effort", "DeepSeek off reasoning effort must be omitted");
      } else {
        assertEqual(body.thinking?.type, "enabled", `DeepSeek ${reasoningEffort} thinking type`);
        assertEqual(
          body.reasoning_effort,
          reasoningEffort === "xhigh" ? "max" : "high",
          `DeepSeek ${reasoningEffort} reasoning effort`
        );
      }
      if (["low", "medium", "high", "xhigh"].includes(reasoningEffort)) {
        assertAbsent(body, "temperature", `DeepSeek ${reasoningEffort} reasoning must omit temperature`);
        assertAbsent(body, "top_p", `DeepSeek ${reasoningEffort} reasoning must omit top-p`);
      } else {
        assertEqual(body.temperature, 0.2, `DeepSeek ${reasoningEffort} keeps temperature`);
        assertEqual(body.top_p, 0.8, `DeepSeek ${reasoningEffort} keeps top-p`);
      }
    }
  });

  assertNoPendingFetch("deepseek hosted tool rejection");
  await assertRejects(
    () => adapter.completeText({ model: "deepseek-v4-flash", messages: sampleMessages(), hostedTools: [{ name: "web_search" }] }),
    /does not support provider-hosted tools/,
    "DeepSeek must reject undeclared hosted tools"
  );
}

async function testFetchHelpers() {
  assertEqual(
    providerUrl({ kind: "openai", baseUrl: "https://api.xi-ai.cn" }, "/responses"),
    "https://api.xi-ai.cn/v1/responses",
    "OpenAI bare managed domain receives the v1 API prefix"
  );
  assertEqual(
    providerUrl({ kind: "anthropic", baseUrl: "https://api.xi-ai.cn" }, "/messages"),
    "https://api.xi-ai.cn/v1/messages",
    "Anthropic bare managed domain receives the v1 API prefix"
  );
  assertEqual(
    providerUrl({ kind: "gemini", baseUrl: "https://api.xi-ai.cn" }, "/models/gemini-test:generateContent"),
    "https://api.xi-ai.cn/v1beta/models/gemini-test:generateContent",
    "Gemini bare managed domain receives the v1beta API prefix"
  );
  assertEqual(
    providerUrl({ kind: "gemini", baseUrl: "https://api.xi-ai.cn/v1" }, "/models/gemini-test:generateContent"),
    "https://api.xi-ai.cn/v1beta/models/gemini-test:generateContent",
    "Gemini routing replaces an incompatible v1 base suffix"
  );
  assertEqual(
    providerUrl({ kind: "openai", baseUrl: "https://api.xi-ai.cn/v1beta" }, "/responses"),
    "https://api.xi-ai.cn/v1/responses",
    "OpenAI routing replaces an incompatible v1beta base suffix"
  );
  assertEqual(
    providerUrl({ kind: "openai", baseUrl: "https://api.xi-ai.cn/v1" }, "/v1/chat/completions"),
    "https://api.xi-ai.cn/v1/chat/completions",
    "Explicit endpoint versions do not duplicate a base version suffix"
  );
  for (const kind of ["openai-compatible", "kimi", "deepseek", "qwen", "botcf"]) {
    assertEqual(
      providerUrl({ kind, baseUrl: "https://api.xi-ai.cn" }, "/chat/completions"),
      "https://api.xi-ai.cn/v1/chat/completions",
      `${kind} bare managed domain receives the v1 API prefix`
    );
  }
  assertEqual(
    providerUrl({ kind: "openai-compatible", baseUrl: "https://gateway.contract.test/custom/v1" }, "/chat/completions"),
    "https://gateway.contract.test/custom/v1/chat/completions",
    "Existing versioned custom provider paths are preserved"
  );
  assertEqual(
    providerUrl({ kind: "openai-compatible", baseUrl: "https://gateway.contract.test/custom" }, "/v1/chat/completions"),
    "https://gateway.contract.test/custom/v1/chat/completions",
    "Explicit endpoint versions are not duplicated"
  );

  const helperProvider = provider("openai-compatible", ["chat", "tts"], "https://helper.contract.test");
  const adapter = createOpenAICompatibleAdapter(helperProvider);
  await withMockFetch("bare provider endpoint", [
    (request) => {
      assertEqual(request.url, "https://helper.contract.test/v1/chat/completions", "Bare compatible endpoint path");
      return new Response(JSON.stringify({ choices: [{ message: { content: "plain JSON compatibility" } }] }), {
        headers: { "content-type": "text/plain" }
      });
    }
  ], async () => {
    const text = await adapter.completeText({ model: "helper-chat", messages: sampleMessages() });
    assertEqual(text, "plain JSON compatibility", "Valid JSON remains compatible when an upstream omits its JSON content type");
  });

  await withMockFetch("html success rejection", [
    () => new Response("<!doctype html><html><title>Gateway</title></html>", {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" }
    })
  ], async () => {
    await assertRejects(
      () => adapter.completeText({ model: "helper-chat", messages: sampleMessages() }),
      /HTML.*\/v1/u,
      "Successful HTML landing pages must not become model text"
    );
  });

  await withMockFetch("malformed JSON rejection", [
    () => new Response("not-json", { status: 200, headers: { "content-type": "text/plain" } })
  ], async () => {
    await assertRejects(
      () => adapter.completeText({ model: "helper-chat", messages: sampleMessages() }),
      /无法解析的 JSON/u,
      "Malformed non-HTML provider responses must fail"
    );
  });

  for (const [label, contentType] of [
    ["declared HTML", "Text/HTML; charset=utf-8"],
    ["mislabeled HTML", "text/plain"],
    ["unlabeled HTML", ""]
  ]) {
    await withMockFetch(`html asset rejection: ${label}`, [
      () => new Response("<!doctype html><html><body>Landing page</body></html>", {
        status: 200,
        headers: contentType ? { "content-type": contentType } : undefined
      })
    ], async () => {
      await assertRejects(
        () => adapter.synthesizeSpeech({ model: "helper-tts", input: "hello", voice: "alloy" }),
        /HTML 页面而不是媒体资源/u,
        `${label} landing pages must not become binary assets`
      );
    });
  }

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

  await withMockFetch("bounded provider response", [
    () => new Response(JSON.stringify({ data: "x".repeat(2_000) }), {
      status: 200,
      headers: { "content-type": "application/json" }
    })
  ], async () => {
    await assertRejects(
      () => fetchJson("https://helper.contract.test/v1/large", {
        body: {},
        maxResponseBytes: 1_000
      }),
      /exceeds 1 MB/u,
      "Provider helpers must stop reading responses after the configured byte limit"
    );
  });
}

const tests = [
  ["Catalog model mapping contract", testCatalogModelMapping],
  ["Model endpoint protocol routing", testModelEndpointProtocolRouting],
  ["OpenAI adapter contracts", testOpenAIAdapter],
  ["Claude adapter contracts", testAnthropicAdapter],
  ["Gemini adapter contracts", testGeminiAdapter],
  ["Kimi adapter contracts", testKimiAdapter],
  ["DeepSeek adapter contracts", testDeepSeekAdapter],
  ["Qwen adapter contracts", testQwenAdapter],
  ["OpenAI-compatible adapter contracts", testOpenAICompatibleAdapter],
  ["BotCF adapter contracts", testBotcfAdapter],
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
