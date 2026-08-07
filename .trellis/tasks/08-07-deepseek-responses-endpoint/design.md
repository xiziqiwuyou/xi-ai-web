# DeepSeek Responses Endpoint Design

## Protocol Boundary

`openai-responses` is the shared wire-protocol value for OpenAI-compatible
Responses implementations. The selected catalog entry still owns the
protocol, while `vendor: deepseek` selects the DeepSeek-specific adapter
normalization. This keeps the existing admin endpoint selector compact and
prevents vendor defaults from changing the unsupported `deepseek-v4-pro`.

## Adapter Composition

- Keep `createDeepSeekAdapter()` for DeepSeek Chat Completions.
- Add `createDeepSeekResponsesAdapter()` in `server/providers/deepseek.mjs`.
- Extend `createOpenAIAdapter()` with an opt-in `statelessResponses` option.
- In `createChatProtocolAdapter()`, select the DeepSeek Responses wrapper only
  when `kind === "deepseek"` and `endpointProtocol === "openai-responses"`.
- OpenAI and Qwen paths retain their current stateful Responses tool-loop
  behavior.

## Stateless Tool Loop

DeepSeek does not retain Responses objects. On a tool round, preserve the
previous input items, append the provider's returned `output` items, then
append each local `function_call_output`. The next request sends that complete
input list and omits `previous_response_id`. The shared adapter continues to
use `previous_response_id` for providers that opt into the default stateful
mode.

## Prompt And Reasoning Projection

DeepSeek Responses receives the system prompt in `instructions` and does not
need the generic non-OpenAI developer fallback duplicated in `input`. The
DeepSeek wrapper removes any stateful-only `previous_response_id` field and
otherwise reuses the official Responses body: `model`, `input`,
`instructions`, `reasoning`, `max_output_tokens`, `temperature`, `top_p`,
`tools`, and `stream`.

## Catalog Compatibility

The server and browser shipped presets explicitly declare the endpoint on the
model record. Existing administrator-edited records are not silently
rewritten; they can select `Responses API` in the existing model editor. This
avoids overwriting a deliberate Chat Completions choice while making fresh
catalogs correct for the only currently documented DeepSeek Responses model.

## Failure And Rollback

Capability checks remain before network access. DeepSeek vision input is
rejected because the catalog has no `vision` capability. If Responses routing
regresses, administrators can switch the model back to `openai-chat` without
changing credentials or the managed upstream. No schema or persistent data
migration is required.
