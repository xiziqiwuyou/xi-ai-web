import { createAnthropicAdapter } from "./anthropic.mjs";
import { createDeepSeekAdapter } from "./deepseek.mjs";
import { createGeminiAdapter } from "./gemini.mjs";
import { createKimiAdapter } from "./kimi.mjs";
import { createOpenAIAdapter } from "./openai.mjs";
import { createOpenAICompatibleAdapter } from "./openai-compatible.mjs";
import { createQwenAdapter } from "./qwen.mjs";
import { normalizeProviderKind } from "./types.mjs";

export function createProviderAdapter(provider) {
  const kind = normalizeProviderKind(provider?.kind);
  if (kind === "openai") return createOpenAIAdapter(provider);
  if (kind === "anthropic") return createAnthropicAdapter(provider);
  if (kind === "gemini") return createGeminiAdapter(provider);
  if (kind === "kimi") return createKimiAdapter(provider);
  if (kind === "deepseek") return createDeepSeekAdapter(provider);
  if (kind === "qwen") return createQwenAdapter(provider);
  return createOpenAICompatibleAdapter(provider);
}

export { defaultCapabilities, modelForCapability, normalizeProviderKind } from "./types.mjs";
