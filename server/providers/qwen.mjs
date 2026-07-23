import { createOpenAICompatibleAdapter } from "./openai-compatible.mjs";
import { createOpenAIAdapter } from "./openai.mjs";

function normalizeQwenChatBody(body, { model }) {
  if (/^qwen(?:3|omni|vl)/i.test(String(model || "")) && body.max_tokens !== undefined) {
    body.max_completion_tokens = body.max_tokens;
    delete body.max_tokens;
  }
  return body;
}

export function createQwenAdapter(provider) {
  const compatible = createOpenAICompatibleAdapter(provider, {
    kind: "qwen",
    normalizeChatBody: normalizeQwenChatBody
  });
  const responses = createOpenAIAdapter(provider);
  return {
    ...compatible,
    kind: "qwen",
    completeText: (params) => params.hostedTools?.length
      ? responses.completeText(params)
      : compatible.completeText(params),
    streamChat: (params) => params.hostedTools?.length
      ? responses.streamChat(params)
      : compatible.streamChat(params)
  };
}
