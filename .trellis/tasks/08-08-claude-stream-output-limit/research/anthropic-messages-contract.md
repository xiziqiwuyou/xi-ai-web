# Anthropic Messages streaming and output-limit evidence

## Official Sources

- Messages API: https://platform.claude.com/docs/en/api/messages
- Streaming: https://platform.claude.com/docs/en/build-with-claude/streaming
- Model overview: https://platform.claude.com/docs/en/about-claude/models/overview
- Official TypeScript SDK Messages types:
  https://github.com/anthropics/anthropic-sdk-typescript/blob/main/src/resources/messages/messages.ts

## Confirmed Protocol Facts

- `max_tokens` is a required positive Messages request field.
- `stream: true` selects `text/event-stream` output.
- Native streams use message/content-block lifecycle events. Display text is
  carried by `content_block_delta` with `delta.type = text_delta`.
- `max_tokens` is a requested stopping ceiling and a `max_tokens` stop reason
  can indicate either the requested ceiling or the model maximum.
- Thinking tokens count toward `max_tokens`; explicit thinking budgets must be
  lower than the request ceiling.
- The current model overview says the Models API exposes `max_input_tokens`,
  `max_tokens`, and capability metadata. Its synchronous Messages comparison
  lists 128k output for Fable 5, Opus 5, and Sonnet 5, and 64k for Haiku 4.5.
  The same documentation identifies Opus 4.8, Opus 4.7, Opus 4.6, and Sonnet
  4.6 as extended-output models.

## Repository Evidence

- `server/providers/anthropic.mjs` sends `max_tokens: 4096` whenever the
  optional browser value is absent.
- `src/features/chat/chatSessionSettings.ts` disables the manual limit by
  default, and `ChatModule.tsx` therefore omits `maxTokens`.
- `server/index.mjs` accepts optional Chat values up to 1,000,000; the 4,096
  behavior is adapter-local, not a global route maximum.
- `streamOutput` currently gates browser rendering only. It is not part of the
  public Chat payload.
- Tool-bearing requests are intentionally completed through the non-streaming
  tool loop before one final public token event.
- The standard Anthropic SSE fixture already proves native frame parsing, but
  it does not prove that a public token arrives before upstream completion or
  that the browser renders an intermediate state.

## Implementation Implications

- The application cannot model Anthropic "unlimited" output by omitting the
  field. It needs one effective model-aware ceiling.
- The selected server catalog entry is the correct owner of that ceiling;
  browser values are optional lower overrides only.
- Online failures can still be caused by a gateway returning buffered JSON or
  a reverse proxy buffering SSE. Those require a disposable-Key smoke and are
  separate from deterministic local acceptance.
