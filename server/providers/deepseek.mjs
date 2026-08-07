import { createOpenAIAdapter } from "./openai.mjs";
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

function normalizeDeepSeekResponseBody(body) {
  delete body.previous_response_id;
  if (Array.isArray(body.tools)) {
    body.tools = body.tools.map((tool) => {
      if (tool?.type !== "function") return tool;
      const { strict: _strict, ...supported } = tool;
      return supported;
    });
  }
  if (
    body.instructions
    && Array.isArray(body.input)
    && body.input[0]?.role === "developer"
    && body.input[0]?.content === body.instructions
  ) {
    body.input = body.input.slice(1);
  }
  return body;
}

export function createDeepSeekAdapter(provider) {
  return createOpenAICompatibleAdapter(provider, {
    kind: "deepseek",
    normalizeChatBody: normalizeDeepSeekChatBody
  });
}

export function createDeepSeekResponsesAdapter(provider) {
  return createOpenAIAdapter(provider, {
    normalizeResponseBody: normalizeDeepSeekResponseBody,
    statelessResponses: true
  });
}
