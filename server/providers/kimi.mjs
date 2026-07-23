import { createOpenAICompatibleAdapter } from "./openai-compatible.mjs";

function normalizeKimiChatBody(body, { model }) {
  if (/^kimi-(?:k2\.(?:5|6|7)|k3)(?:$|-)/i.test(String(model || ""))) {
    delete body.temperature;
    delete body.top_p;
    if (body.max_tokens !== undefined) {
      body.max_completion_tokens = body.max_tokens;
      delete body.max_tokens;
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
