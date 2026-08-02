import { createAnthropicAdapter } from "./anthropic.mjs";
import { createBotcfAdapter } from "./botcf.mjs";
import { createDeepSeekAdapter } from "./deepseek.mjs";
import { createGeminiAdapter } from "./gemini.mjs";
import { createKimiAdapter } from "./kimi.mjs";
import { createOpenAIAdapter } from "./openai.mjs";
import { createOpenAICompatibleAdapter } from "./openai-compatible.mjs";
import {
  createQwenAdapter,
  createQwenChatAdapter,
  createQwenResponsesAdapter
} from "./qwen.mjs";
import { normalizeEndpointProtocol, normalizeProviderKind } from "./types.mjs";

function createVendorAdapter(provider) {
  const kind = normalizeProviderKind(provider?.kind);
  if (kind === "openai") return createOpenAIAdapter(provider);
  if (kind === "anthropic") return createAnthropicAdapter(provider);
  if (kind === "gemini") return createGeminiAdapter(provider);
  if (kind === "kimi") return createKimiAdapter(provider);
  if (kind === "deepseek") return createDeepSeekAdapter(provider);
  if (kind === "qwen") return createQwenAdapter(provider);
  if (kind === "botcf") return createBotcfAdapter(provider);
  return createOpenAICompatibleAdapter(provider);
}

function createChatProtocolAdapter(provider) {
  const kind = normalizeProviderKind(provider?.kind);
  const endpointProtocol = normalizeEndpointProtocol(provider?.endpointProtocol, kind);

  if (endpointProtocol === "openai-responses") {
    return kind === "qwen" ? createQwenResponsesAdapter(provider) : createOpenAIAdapter(provider);
  }
  if (endpointProtocol === "anthropic-messages") return createAnthropicAdapter(provider);
  if (endpointProtocol === "gemini-generate-content") return createGeminiAdapter(provider);
  if (kind === "kimi") return createKimiAdapter(provider);
  if (kind === "deepseek") return createDeepSeekAdapter(provider);
  if (kind === "qwen") return createQwenChatAdapter(provider);
  return createOpenAICompatibleAdapter(provider);
}

export function createProviderAdapter(provider) {
  const vendorAdapter = createVendorAdapter(provider);
  const chatAdapter = createChatProtocolAdapter(provider);
  return {
    ...vendorAdapter,
    streamChat: chatAdapter.streamChat,
    completeText: chatAdapter.completeText
  };
}

export {
  defaultCapabilities,
  defaultEndpointProtocol,
  modelForCapability,
  normalizeEndpointProtocol,
  normalizeProviderKind
} from "./types.mjs";
