# Implementation Plan

1. P0: Extend the cross-device Playwright contract to capture the QR-stage
   approval placement, no-scroll visibility, stable geometry, focus, and no
   automatic approval/upload behavior.
2. P1: Extract one sender approval render block and place it inside the desktop
   QR stage or first in mobile/manual session flow.
3. P2: Add bounded focus management for the approval transition.
4. P3: Add stable QR-stage sizing and short reduced-motion-aware approval entry
   styling without changing dialog dimensions.
5. P4: Run targeted desktop and mobile sync E2E, then fix any layout or protocol
   regression.
6. P5: Run type check, UI contracts/runtime, sync server/security tests, build,
   diff review, and Trellis completion checks.

## Rollback

Revert the feature commit. No migrations, server state, or browser data changes
are involved.
