import { createOpenAICompatibleAdapter } from "./openai-compatible.mjs";

function normalizeDeepSeekChatBody(body, { reasoningEffort }) {
  delete body.reasoning_effort;
  if (reasoningEffort === "off") {
    body.thinking = { type: "disabled" };
    return body;
  }
  if (["low", "medium", "high", "xhigh"].includes(reasoningEffort)) {
    body.thinking = { type: "enabled" };
    body.reasoning_effort = reasoningEffort === "xhigh" ? "max" : "high";
    delete body.temperature;
    delete body.top_p;
  }
  return body;
}

export function createDeepSeekAdapter(provider) {
  return createOpenAICompatibleAdapter(provider, {
    kind: "deepseek",
    normalizeChatBody: normalizeDeepSeekChatBody
  });
}
