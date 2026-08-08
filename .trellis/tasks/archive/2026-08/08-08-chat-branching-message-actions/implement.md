# Implementation plan

## P0 - Contracts and regression locks

- [x] Add branch types and pure seed construction tests for continue/edit/retry.
- [x] Lock source-conversation immutability, invalid branch points, IDs, timestamps,
      attachment staging, and legacy behavior.

## P1 - Persistence

- [x] Sanitize optional branch metadata in workspace and conversation archives.
- [x] Preserve it through IndexedDB save/load and import/export.
- [x] Reject malformed, oversized, and self-referential provenance without dropping
      the containing conversation.

## P2 - Message actions and branch execution

- [x] Add accessible copy/edit/retry/continue actions to persisted messages.
- [x] Add inline editing with focus, Escape, Cancel, and empty-input guards.
- [x] Create top/expanded branch sessions and collapse prior sessions.
- [x] Route edit/retry through the existing send pipeline exactly once.
- [x] Keep branch recovery state when automatic send cannot proceed.

## P3 - Styling and browser coverage

- [x] Add native message action/editor styles for light/dark and hover/focus/touch.
- [x] Add desktop/mobile Playwright coverage for geometry, source immutability,
      request counts, keyboard behavior, and streaming locks.
- [x] Extend chat/workspace/privacy contracts for branch metadata boundaries.

## P4 - Verification and review

- [x] Run `npm run check` and `npm run chat-local-contracts` first.
- [x] Run focused Playwright branch tests on desktop and mobile.
- [x] Run `npm run ui-contract`, `npm run workspace-storage-contracts`,
      `npm run privacy`, `npm run test:server`, and `npm run build`.
- [x] Run `git diff --check`, Trellis task validation, and a full changed-file review.
- [x] Record any new durable branch/persistence convention in frontend specs.
