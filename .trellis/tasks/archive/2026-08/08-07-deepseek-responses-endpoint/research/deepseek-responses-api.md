# DeepSeek Responses API Research

Source: official DeepSeek API documentation, retrieved 2026-08-07.

- Guide: https://api-docs.deepseek.com/guides/responses_api
- Endpoint reference: https://api-docs.deepseek.com/api/create-response
- Chat Completions reference: https://api-docs.deepseek.com/api/create-chat-completion

## Findings

- Responses uses `POST /responses` with base URL `https://api.deepseek.com`.
  The managed xi-ai-web upstream adds `/v1`, so the application request path
  is `/v1/responses`.
- The official endpoint currently supports `deepseek-v4-flash`; the docs state
  that `deepseek-v4-pro` is not supported yet.
- Supported request fields include `model`, `input` (string or input item
  list), `instructions`, `reasoning.effort`, `max_output_tokens`,
  `temperature`, `top_p`, `tools`, and `stream`.
- `reasoning.effort` supports `none`, `minimal`, `low`, `medium`, `high`,
  `xhigh`, and `max`; `none` disables thinking. The app's `off`, `low`,
  `medium`, `high`, and `xhigh` semantic values map naturally to the supported
  subset.
- Streaming is semantic SSE. The terminal event is
  `response.completed`, `response.incomplete`, or `response.failed`; there is
  no `data: [DONE]` terminator.
- Responses are stateless. `previous_response_id`, `conversation`, and
  `store` are unsupported. For multi-turn and function-call requests, the
  client must send the complete input history, returned function-call items,
  and matching `function_call_output` items.
- Message roles `user`, `assistant`, `system`, and `developer` are supported,
  with `developer` treated as `system`. Image and file inputs are not
  supported.
- The Responses API supports function tools and a provider-hosted web search,
  but xi-ai-web keeps independent GLM/Kimi search as its product search path;
  this task does not enable DeepSeek hosted search.
