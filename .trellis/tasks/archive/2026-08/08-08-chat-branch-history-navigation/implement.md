# Implementation Plan

## P0 - Pure Branch Graph Contract

- [x] Add bounded branch-family projection types, limits, deterministic edge
      acceptance, cycle detection, orphan promotion, and immutable traversal.
- [x] Add branch-view pruning/search that preserves matching ancestors and
      excludes attachment/citation/transient content.
- [x] Extend local Chat contracts for sibling/nested families, duplicate IDs,
      self links, multi-node cycles, missing parents, depth/node caps, and input
      immutability.

## P1 - Conversation Manager Integration

- [x] Add the Branches view to the existing manager tabs and reuse its search,
      dialog, list scroll owner, focus, and empty-state conventions.
- [x] Render progressively disclosed family and nested node rows with mode,
      current, archived, orphan, and invalid states.
- [x] Add `currentConversationId` projection from `ChatModule` without changing
      session sorting, pinning, persistence, or `updatedAt`.

## P2 - Navigation And Streaming Guards

- [x] Route active-node Open through `openManagedConversation` and archived-node
      Restore through `restoreManagedConversation` only.
- [x] Keep search/family expansion usable while streaming and preserve the
      existing synchronous mutation guard against UI bypass.
- [x] Verify parent, sibling, nested child, archived child, and partial-import
      navigation behavior with zero provider/server requests.

## P3 - Responsive Styling And Accessibility

- [x] Add compact nested-list styles to the Chat-owned stylesheet using current
      tokens, fixed indentation caps, existing scrollbar behavior, and no new
      page/dialog geometry.
- [x] Verify truthful `aria-expanded`, current-state semantics, keyboard focus,
      reduced motion, dark mode, 36px desktop controls, and 44px mobile targets.
- [x] Keep one visible dialog scroll owner and no horizontal overflow at
      `1440x900`, `1280x800`, `390x844`, and `375x812`.

## P4 - Full Verification And Finish

- [x] Run `npm run check`, `npm run chat-local-contracts`,
      `npm run workspace-storage-contracts`, `npm run ui-contract`,
      `npm run privacy`, focused Playwright, `npm run test:server`,
      `npm run build`, `git diff --check`, and Trellis task validation.
- [x] Review code against frontend state/component/quality specs and update the
      branch-history code-spec with any new executable contract.
- [x] Commit only this child task, archive it, and record the session; do not
      publish or push a release.

## Risky Files

- `src/features/chat/ChatConversationManager.tsx`: preserve existing
  Active/Archived behavior, dialog focus, and local search semantics.
- `src/features/chat/ChatModule.tsx`: pass derived current ID only; avoid broad
  state refactors or send-pipeline changes.
- Chat stylesheet: do not introduce another scroll owner or change the dialog's
  established desktop/mobile dimensions.

## Rollback Points

- After P0: remove the helper and tests with no persisted impact.
- After P1/P2: remove the Branches tab and prop; Active/Archived remain intact.
- After P3: revert branch-specific selectors only; no data migration exists.
