# Native provider chat streaming

## Goal

Make normal Chat requests stream native text deltas for the OpenAI Responses,
Anthropic Messages, and Gemini Generate Content endpoint protocols. The deployed
service must visibly render provider output as it arrives instead of waiting for
the full provider response.

## Requirements

- Preserve the existing BYOK boundary: browser-supplied Keys remain transient and
  the administrator-managed upstream remains the only outbound origin.
- Preserve the public Chat SSE contract: `meta`, zero or more `token`, and one
  terminal `done` event while the client remains connected.
- Use the three providers' native streaming endpoints and extract only displayable
  text deltas. Reasoning/thinking deltas must never be shown as ordinary chat text.
- Parse provider SSE safely across arbitrary byte and frame boundaries.
- Retain non-streaming `completeText` behavior and existing tool-call loops.
- Make the server flush response headers before its initial public SSE event.
- Document the dedicated reverse-proxy path needed to prevent buffering on
  `/api/chat/stream`.
- Add mocked provider-contract coverage for request projection, split frames,
  text assembly, usage where the provider exposes it, and JSON fallbacks.

## Acceptance Criteria

- [ ] OpenAI Responses sends `stream: true` and forwards multiple
  `response.output_text.delta` events incrementally.
- [ ] Anthropic Messages sends `stream: true` and forwards text-only
  `content_block_delta` events incrementally.
- [ ] Gemini calls `:streamGenerateContent?alt=sse` and forwards incremental
  candidate text without duplicating prior chunks.
- [ ] Malformed or non-SSE success responses retain bounded, actionable failure
  behavior; compatible JSON responses still return usable final text where
  supported.
- [ ] `npm run provider-contracts`, `npm run test:server`, and `npm run check`
  pass after the change.
- [ ] The Nginx deployment template has a no-buffer, no-gzip dedicated Chat SSE
  location and does not create a duplicate catch-all location.

## Notes

- This patch deliberately excludes stream-aware multi-round local/hosted tool
  execution. Tool-enabled conversations continue to emit their final answer
  after the tool loop until a separate event contract is designed.
- No real user Key is required or permitted in tests. Provider behavior is locked
  with controlled chunked SSE fixtures.
