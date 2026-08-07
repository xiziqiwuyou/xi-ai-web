# Implementation Plan

## P0. Contract and regression baseline

- [x] Capture existing image-input and search-trigger behavior in focused failing tests.
- [x] Add a shared Chat image-capability predicate and document the `vision` versus `image`/`imageEdit` boundary.
- [x] Confirm the stable `modelId` path from public bootstrap through client request and server catalog lookup.

Gate: tests reproduce the unconditional picker and prove independent search is a separate execution class.

## P1. Image capability gating

- [x] Gate the visible image button and hidden file input without moving the composer layout.
- [x] Recheck the latest selected model in the image intake handler.
- [x] Add confirmed model switching for pending images and derived incompatibility for catalog capability loss.
- [x] Preserve client send and server request guards; add no-upstream crafted-request coverage.

Gate: every image entry path agrees with the selected model's `vision` capability.

## P2. Independent search state machine

- [x] Separate configured/armed/request-phase concepts from model compatibility.
- [x] Trigger search only from an explicit send with non-empty current-turn text.
- [x] Ensure provider selection, typing, attachment input, and model switching issue no search request.
- [x] Preserve provider selection and draft on failure; clear it when the tool or Key becomes unavailable.
- [x] Map unauthorized, unsupported, rate-limit, timeout, malformed, and cancelled outcomes without credential leakage.
- [x] Make the primary Chat connection Key authoritative and ignore a caller-supplied alternate search Key.
- [x] Show provider-specific searching feedback and transition to generating on the first token.

Gate: one explicit send produces at most one independent search before Chat, with no fallback.

## P3. Interaction and responsive regression

- [x] Add confirmation-dialog, incompatible-attachment, tooltip/focus, and mobile behavior coverage.
- [x] Verify independent search with a Chat-only model lacking `webSearch`.
- [x] Verify search-off, attachment-only, retry, cancellation, dark mode, keyboard, and stable layout behavior.

Gate: desktop and mobile E2E cover every user-visible state without layout shifts.

## P4. Full verification

- [x] Run `npm run check`, `npm run build`, `npm run privacy`, and `npm run ui-contract`.
- [x] Run `npm run search-contracts`, `npm run chat-local-contracts`, and focused server tests.
- [x] Run focused Chat desktop/mobile Playwright suites and review screenshots where applicable.
- [x] Cover forged search credentials and the independent-search timeout path at the real Chat route.
- [x] Run a Trellis quality review and record any remaining real-provider validation gap.

Gate: all reproducible checks pass and unrelated `v0.0.8` work remains intact.
