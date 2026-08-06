# Stable low-latency chat stream buffering

## Goal

Stabilize the complete Chat streaming path without turning the response into a
fully buffered or artificially typed answer. Small provider fragments should be
coalesced into low-latency batches, the browser should render and persist those
batches at bounded cadence, and slow clients must not create unbounded server
memory growth.

## Requirements

- Preserve the existing public SSE events: `meta`, `token`, `error`, `done`, and
  heartbeat. `done` remains the final business event.
- Apply the new micro-buffer only to ordinary no-tool native streaming. Existing
  local, prompt-mode, and provider-hosted tool loops may retain final-answer
  fallback behavior.
- Keep first-token latency bounded; do not wait for the full response or use a
  fixed per-character typewriter delay.
- Flush on a short interval, a bounded character threshold, provider completion,
  error, client cancellation, and queue backpressure.
- Propagate async token callbacks through provider SSE readers so the server can
  honor `res.write()` backpressure and abort safely at queue limits.
- Batch Chat React updates with animation frames and throttle IndexedDB writes;
  final `done`, `error`, and `stop` states must always persist exact content.
- Make operational buffer limits configurable, bounded, and server-side only.
- Add regression coverage for latency bounds, exact text preservation, no
  post-cancel writes, backpressure, and reduced persistence frequency.

## Acceptance Criteria

- [ ] Normal native Chat output is delivered in multiple bounded SSE batches
  when the provider emits many small fragments.
- [ ] The first batch is not held for a full-response buffer and normal local
  tests keep first-flush delay below the configured maximum.
- [ ] Concatenating all public token payloads exactly equals the provider text;
  no token is duplicated or lost, including the final pending buffer.
- [ ] Slow downstream writes wait for `drain` within a bounded timeout and do not
  grow an unbounded queue.
- [ ] Client cancellation aborts provider work, clears timers/listeners, and
  produces no token after cancellation.
- [ ] Streaming UI updates are frame-batched and persistence is not performed
  once per token; final state is still durable.
- [ ] `npm run check`, `npm run provider-contracts`, `npm run chat-local-contracts`,
  `npm run test:server`, `npm run test:security`, and `npm run release-check` pass.

## Notes

- A provider-side thinking gap cannot be smoothed by the server without inventing
  content. This change smooths bursty short fragments only and must leave long
  model pauses honest.
- Do not add a new dependency or persist API Keys, prompts, image bytes, or raw
  provider streams.
