import { createOpenAICompatibleAdapter } from "./openai-compatible.mjs";

export function createDeepSeekAdapter(provider) {
  return createOpenAICompatibleAdapter(provider, { kind: "deepseek" });
}
