import { createOpenAICompatibleAdapter } from "./openai-compatible.mjs";

function normalizeKimiChatBody(body, { model, reasoningEffort }) {
  const modelName = String(model || "");
  if (/^kimi-(?:k2\.(?:5|6|7)|k3)(?:$|-)/i.test(modelName)) {
    delete body.temperature;
    delete body.top_p;
    if (body.max_tokens !== undefined) {
      body.max_completion_tokens = body.max_tokens;
      delete body.max_tokens;
    }

    delete body.reasoning_effort;
    if (reasoningEffort === "off") {
      if (/^kimi-k2\.6(?:$|-)/i.test(modelName)) body.thinking = { type: "disabled" };
      return body;
    }
    if (["low", "medium", "high", "xhigh"].includes(reasoningEffort)) {
      if (/^kimi-k2\.6(?:$|-)/i.test(modelName)) {
        body.thinking = { type: "enabled", keep: "all" };
      } else {
        body.reasoning_effort = "max";
      }
    }
  }
  return body;
}

export function createKimiAdapter(provider) {
  return createOpenAICompatibleAdapter(provider, {
    kind: "kimi",
    normalizeChatBody: normalizeKimiChatBody
  });
}
