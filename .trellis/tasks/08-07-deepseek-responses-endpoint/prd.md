# DeepSeek Responses Endpoint Compatibility

## Goal

Make the shipped DeepSeek model catalog and provider adapter support the
official DeepSeek Responses API without changing the project's endpoint
taxonomy or breaking DeepSeek Chat Completions compatibility.

## Confirmed Facts

- DeepSeek's official documentation exposes `POST /responses` at the base
  URL `https://api.deepseek.com`.
- The official Responses endpoint currently supports `deepseek-v4-flash` and
  does not support `deepseek-v4-pro` yet.
- Requests use the Responses shape (`input`, `instructions`,
  `max_output_tokens`, `reasoning.effort`, and `stream`).
- Responses streaming uses semantic SSE events and ends with
  `response.completed`, `response.incomplete`, or `response.failed`; it does
  not use `data: [DONE]`.
- The API is stateless and requires the full conversation plus returned tool
  items on each request. Image/file inputs are not supported.
- The repository already has the `openai-responses` protocol and an OpenAI
  Responses adapter, while DeepSeek currently defaults to Chat Completions.

## Requirements

- Keep the existing four endpoint protocol values. DeepSeek Responses uses the
  existing `openai-responses` wire protocol; do not add a duplicate endpoint
  enum solely for DeepSeek.
- Set only the shipped `deepseek-v4-flash` preset to
  `endpointProtocol: "openai-responses"`. Keep `deepseek-v4-pro` on the
  existing Chat Completions default until DeepSeek documents Responses support.
- Route a DeepSeek model explicitly configured with `openai-responses` through
  a DeepSeek-specific Responses adapter wrapper that reuses the shared
  Responses implementation.
- Preserve DeepSeek Chat Completions behavior and its current reasoning-field
  normalization when a model is configured with `openai-chat`.
- For DeepSeek Responses, keep the official fields and map the existing
  semantic reasoning values to `reasoning.effort`; `off` maps to `none` and
  `xhigh` remains `xhigh`.
- Do not send image attachments to DeepSeek Responses; the existing `vision`
  capability gate must reject them before upstream access.
- Preserve independent GLM/Kimi search behavior; do not enable DeepSeek's
  hosted `web_search` capability as a side effect.
- Add contract coverage for default catalog mapping, exact `/v1/responses`
  requests, prompt/input projection, stream terminal events, reasoning and
  max-output fields, and stateless function-call rounds.
- Document the official compatibility boundary and the unsupported
  `deepseek-v4-pro` Responses case in the backend spec.

## Acceptance Criteria

- [x] Fresh server and frontend catalogs mark `deepseek-v4-flash` as
  `openai-responses`, while `deepseek-v4-pro` remains `openai-chat`.
- [x] A DeepSeek Responses request reaches `/v1/responses`, uses `input` and
  `instructions`, never uses Chat `messages`, and forwards the API Key through
  the existing managed-upstream path.
- [x] DeepSeek Responses streaming forwards output deltas and accepts the
  documented terminal event without requiring `[DONE]`.
- [x] DeepSeek Responses tool rounds contain the prior response output and
  `function_call_output` in the next full `input`, with no
  `previous_response_id` dependency.
- [x] DeepSeek Chat Completions tests remain green, and media routes remain
  vendor-owned and unaffected by chat endpoint selection.
- [x] Type-check, provider contracts, feature audit, server tests, privacy,
  and build pass.
- [x] No real API Key or external provider request is used by tests.

## Out Of Scope

- Adding new DeepSeek model IDs not present in the current catalog.
- Enabling DeepSeek hosted web search in the product; independent GLM/Kimi
  search remains the supported search path.
- Supporting images, file inputs, audio, or video through DeepSeek Responses.
- Changing the public managed upstream policy, session-only BYOK storage, or
  release version in this task.
