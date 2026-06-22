# Phase 04: Chat UX Recomposition

Priority: medium
Status: planned

## Overview

Recompose chat so it feels like the reference: conversation list, spacious content, premium composer, compact connection controls. Remove admin-like provider forms from the visible public workspace.

## Requirements

- Keep conversation list on the left of chat content.
- Composer is the visual anchor.
- Public model connection is a chip/popover, not a top admin-style select row.
- Assistant switching stays simple.
- Empty state should feel polished and product-like, not instructional.

## Related Code Files

- Modify: `C:\Users\56252\Documents\New project 2\src\features\chat\ChatModule.tsx`
- Modify: `C:\Users\56252\Documents\New project 2\src\styles.css`
- Optional create: `C:\Users\56252\Documents\New project 2\src\features\chat\UserProviderPanel.tsx`

## Component Plan

Split `ChatModule.tsx` if it grows further:

- `ChatModule`
- `ConversationPanel`
- `ChatHeader`
- `MessageList`
- `Composer`
- `UserProviderPanel`

Keep the first implementation conservative. Extract only if file becomes hard to edit.

## UI Behavior

1. Top chat header:
   - Active conversation title.
   - Assistant chip.
   - Model connection chip.
   - Pin/more actions if needed.

2. Connection popover:
   - URL input.
   - Key password input.
   - Model input.
   - Save for session button.
   - Connected badge.

3. Composer:
   - Large rounded glass textarea.
   - Tool icons left/bottom.
   - Model chip inside toolbar.
   - Red circular send button.
   - Focus state: red border glow and slight lift.

4. Empty chat:
   - Assistant avatar.
   - Short title.
   - 2-3 prompt chips max.
   - No mention of admin/API setup.

## Success Criteria

- Chat no longer starts with four utilitarian select controls.
- User can tell whether a direct model connection is ready.
- Input box looks premium and matches reference more closely.
- Text never overlaps at desktop, 1024px, or mobile.

## Risks

- Adding a connection panel can clutter the chat.
  - Mitigation: keep it collapsed behind a chip; open only when needed.
- Users may forget key after refresh if memory-only.
  - Mitigation: show a clear disconnected state. Optional `sessionStorage` can be a later explicit choice.

