# Claude streaming and output limit repair

## Goal

Make Claude Messages conversations visibly stream when requested and ensure
their required `max_tokens` value comes from a model-aware limit rather than an
implicit 4,096-token fallback.

## Confirmed Facts

- Chat settings default to `streamOutput: true`, but the browser does not send
  that setting to `/api/chat/stream`; it only decides whether received token
  events are rendered incrementally.
- Ordinary tool-free Claude requests already call `/v1/messages` with
  `stream: true` and parse native Anthropic SSE text deltas.
- Any local or hosted tool moves the server through the complete-text tool
  path, which returns the final answer as one public token event.
- When the user-facing maximum output setting is disabled, the browser omits
  `maxTokens`, the server preserves it as undefined, and the Anthropic adapter
  sends `max_tokens: 4096`.
- Anthropic Messages requires a positive `max_tokens`; provider-managed
  unlimited output cannot be represented by omitting the field.
- Anthropic's current model documentation exposes model-specific maximum
  output values and its Models API exposes `max_tokens`. The shipped model
  catalog therefore needs an administrator-owned output-limit field.

## Requirements

- `streamOutput` must be part of the Chat request contract. It defaults to true
  for legacy callers.
- Tool-free Claude requests with `streamOutput=true` must forward text deltas
  before the upstream response completes. Thinking deltas must not appear as
  assistant text.
- `streamOutput=false` must produce a deliberately non-streaming Provider call
  while retaining the public SSE envelope and one terminal `done` event.
- Tool/search paths must retain their current functional behavior and expose
  an explicit buffered-generation state; they must not be mistaken for a
  broken native stream.
- Add `maxOutputTokens` to the normalized model catalog, Admin CRUD, presets,
  public/admin bootstrap types, and model editor.
- The server must resolve one effective output limit before Provider access:
  the user override may lower but never exceed the selected model's configured
  maximum. Invalid or oversized values fail before an upstream request.
- Anthropic requests must always receive the effective output limit. Remove
  the adapter-local `4096` fallback.
- Context-history selection must reserve the effective output limit when the
  user has not enabled a lower manual limit.
- Existing administrator model records must be preserved and receive a bounded
  normalized fallback without being renamed, reordered, enabled, or otherwise
  overwritten.
- API Keys, prompts, model output, and client-provided URLs must not enter
  diagnostics, metadata, or logs.

## Acceptance Criteria

- [ ] A delayed Anthropic fixture emits at least two browser-visible token
      updates before its upstream `message_stop`/EOF.
- [ ] `streamOutput=false` makes a non-streaming Anthropic request and renders
      the same final answer once without changing the Chat SSE terminal
      contract.
- [ ] Claude tool-free, local-tool, hosted-tool, cancellation, error, and usage
      paths preserve their existing behavior with explicit stream/buffered
      expectations.
- [ ] Disabling the manual output limit no longer sends `4096` for shipped
      Claude models.
- [ ] Manual output values at or below the model limit are forwarded exactly;
      values above it return a clear 400-class error before Provider access.
- [ ] Legacy model data, Admin create/update, metadata export/import, restart,
      public bootstrap, and desktop/mobile model editing preserve
      `maxOutputTokens`.
- [ ] OpenAI, Gemini, Kimi, DeepSeek, Qwen, image, knowledge, and BYOK address
      boundaries do not regress.
- [ ] Type-check, Provider contracts, feature/UI audits, privacy, server tests,
      focused desktop/mobile E2E, build, and release-check pass.
- [ ] Any real-provider or online reverse-proxy validation is reported
      separately and is never inferred from fixtures.

## Out Of Scope

- Adding a new Provider or endpoint protocol.
- Changing the administrator-managed `api.xi-ai.cn` upstream boundary.
- Persisting API Keys or adding Provider credentials to the server.
- Implementing fully incremental tool-call argument rendering for every
  Provider in this task.
- Publishing a release or deploying to production without a separate request.
