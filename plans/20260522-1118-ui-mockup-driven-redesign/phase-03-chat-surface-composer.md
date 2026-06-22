# Phase 03: Chat Surface and Composer

Status: planned
Priority: P0

## Goal

Bring the central chat area closer to the mockup.

## Changes

Conversation list:
- Keep within main content, not global left nav.
- Cards become compact note cards.
- Active card gets red side marker.
- Remove fake pin/star visual unless real action.

Chat header:
- Title row.
- Real model selection/status only.
- No fake telemetry.

Composer:
- Larger glass input.
- Two zones:
  - text input area
  - tool row with model chip, attach, mic/image, send button
- Strong focus glow.
- Send button circular red.

## Files

Modify:
- `src/features/chat/ChatModule.tsx`
- `src/styles.css`

## Success Criteria

- Composer is the most tactile element.
- Chat remains compact and usable.
- No instructional shortcut text in placeholder.
