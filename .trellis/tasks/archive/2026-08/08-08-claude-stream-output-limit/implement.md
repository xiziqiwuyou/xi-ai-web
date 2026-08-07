# Claude streaming and output limit implementation plan

## P0. Reproduction And Contracts

- [x] Add a delayed Anthropic SSE contract that proves the first text delta is
      observed before upstream completion.
- [x] Lock the current 4,096 fallback and tool-buffered behavior with focused
      failing assertions before changing implementation.
- [x] Record official Anthropic Messages, streaming, model-limit, and Models
      API evidence under `research/`.

## P1. Streaming Semantics

- [x] Add `streamOutput` to the browser/server Chat payload with a true legacy
      default.
- [x] Route tool-free requests through native streaming only when enabled;
      otherwise use completion plus the existing SSE envelope.
- [x] Keep native Claude event parsing incremental, usage-aware, cancellable,
      and thinking-safe.

## P2. Model-Aware Output Limits

- [x] Add and normalize `maxOutputTokens` across server defaults, legacy data,
      shared types, bootstraps, Admin drafts/presets, CRUD, import/export, and
      fixtures.
- [x] Resolve and validate effective Chat output limits before Provider access.
- [x] Remove Anthropic's 4,096 fallback and apply the effective value to
      stream, completion, and tool requests.
- [x] Use the model limit for context-history reservation when no lower manual
      limit is enabled.

## P3. Tool And Status Boundary

- [x] Preserve local/hosted tool execution and mark its final-answer phase as
      buffered rather than native streaming.
- [x] Verify independent GLM/Kimi search remains separate from Anthropic hosted
      tools and does not alter model output limits.

## P4. Regression Coverage

- [x] Extend Provider, model registry, Admin route, feature/UI contract, Chat
      local, server, and desktop/mobile E2E coverage.
- [x] Cover stream on/off, delayed deltas, cancellation, Provider errors,
      usage, manual limits, oversized limits, legacy metadata, and dark/mobile
      containment.
- [x] Run `npm run check`, `npm run provider-contracts`, `npm run feature-audit`,
      `npm run ui-contract`, `npm run chat-local-contracts`, `npm run privacy`,
      `npm run test:server`, focused Playwright, `npm run build`, and
      `npm run release-check`.

## P5. Finish

- [x] Run `git diff --check`, review secrets and changed paths, and update the
      backend/frontend specs with the final executable contract.
- [x] Commit and archive through Trellis. Do not tag, push, deploy, or claim a
      real-provider smoke from this task.

## Verification Evidence

- `npm run check` passed.
- `npm run provider-contracts` passed, including delayed Claude SSE deltas,
  cancellation, usage, and model-aware `max_tokens` assertions.
- `npm run ui-contract`, `npm run feature-audit`,
  `npm run chat-local-contracts`, `npm run privacy`,
  `npm run automation-contracts`, `npm run search-contracts`, and
  `npm run test:security` passed.
- The full server suite passed: 93 tests.
- Focused desktop/mobile Playwright coverage passed: 6 tests.
- `npm run build`, `npm run release-check`, and `git diff --check` passed.
- The isolated UI runtime on port `8799` passed. The existing service on port
  `8787` and user-persisted menu labels were left untouched.

## Remaining Risk

- No real Claude credential or production reverse-proxy smoke was used. The
  application-side incremental contract is covered by deterministic fixtures;
  first-token latency and proxy buffering on `api.xi-ai.cn` remain deployment
  checks for a disposable credential.
