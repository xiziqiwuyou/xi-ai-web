# Implementation Plan

## P0 - Contracts And Regression Locks

- [x] Add optional archive metadata and pure retrieval/archive helpers.
- [x] Lock query bounds, ranking, result limits, CJK/Latin matching, attachment
      exclusion, source immutability, and parent/branch independence.
- [x] Lock strict archive timestamp sanitization and legacy behavior.

## P1 - Persistence

- [x] Preserve `archivedAt` through local save/load, workspace archive, and
      conversation archive.
- [x] Ensure malformed metadata removes only the optional field.
- [x] Extend privacy/storage contracts without adding server state.

## P2 - Chat State

- [x] Derive active and archived projections while retaining one complete list.
- [x] Make hydration, stack sorting, summaries, empty fallback, and transient UI
      cleanup archive-aware.
- [x] Add synchronous archive/restore/open guards during streaming.

## P3 - Conversation Manager

- [x] Build the shared-dialog manager with search, Active/Archived filter, count,
      compact rows, open, archive, and restore commands.
- [x] Add stable desktop/mobile styling, dark mode, keyboard/focus, 36/44px
      controls, and one scroll owner.

## P4 - Browser And Cross-Layer Verification

- [x] Add focused desktop/mobile Playwright coverage for zero-request retrieval,
      reload persistence, archive/restore ordering, last-active fallback,
      streaming locks, branch isolation, dark mode, focus, and containment.
- [x] Run `npm run check`, `chat-local-contracts`,
      `workspace-storage-contracts`, `ui-contract`, `privacy`, `feature-audit`,
      `test:server`, focused Playwright, and `build`.
- [x] Run `git diff --check`, task validation, changed-file review, and record
      durable retrieval/archive rules in frontend specs.

## Rollback Points

- After P1: revert optional metadata while legacy records remain readable.
- After P2: remove active projection changes if session ordering regresses.
- After P3: hide the manager entry without changing stored conversations.
