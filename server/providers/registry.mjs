import { createAnthropicAdapter } from "./anthropic.mjs";
import { createGeminiAdapter } from "./gemini.mjs";
import { createOpenAIAdapter } from "./openai.mjs";
import { createOpenAICompatibleAdapter } from "./openai-compatible.mjs";
import { normalizeProviderKind } from "./types.mjs";

export function createProviderAdapter(provider) {
  const kind = normalizeProviderKind(provider?.kind);
  if (kind === "openai") return createOpenAIAdapter(provider);
  if (kind === "anthropic") return createAnthropicAdapter(provider);
  if (kind === "gemini") return createGeminiAdapter(provider);
  return createOpenAICompatibleAdapter(provider);
}

export { defaultCapabilities, modelForCapability, normalizeProviderKind } from "./types.mjs";
