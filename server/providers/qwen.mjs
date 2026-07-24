import { createOpenAICompatibleAdapter } from "./openai-compatible.mjs";
import { createOpenAIAdapter } from "./openai.mjs";

function normalizeQwenThinking(body, { reasoningEffort }) {
  if (!["off", "low", "medium", "high", "xhigh"].includes(reasoningEffort)) return body;

  delete body.reasoning;
  delete body.reasoning_effort;
  body.enable_thinking = reasoningEffort !== "off";
  if (reasoningEffort === "off") {
    delete body.thinking_budget;
    return body;
  }

  body.thinking_budget = {
    low: 1024,
    medium: 4096,
    high: 8192,
    xhigh: 16384
  }[reasoningEffort];
  return body;
}

function normalizeQwenChatBody(body, { model, reasoningEffort }) {
  if (/^qwen(?:3|omni|vl)/i.test(String(model || "")) && body.max_tokens !== undefined) {
    body.max_completion_tokens = body.max_tokens;
    delete body.max_tokens;
  }
  return normalizeQwenThinking(body, { reasoningEffort });
}

export function createQwenAdapter(provider) {
  const compatible = createOpenAICompatibleAdapter(provider, {
    kind: "qwen",
    normalizeChatBody: normalizeQwenChatBody
  });
  const responses = createOpenAIAdapter(provider, {
    normalizeResponseBody: normalizeQwenThinking
  });
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
