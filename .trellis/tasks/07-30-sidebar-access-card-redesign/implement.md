# Implementation Plan

1. Update `TopBar` access-card markup to render a shared connection-details group for address and masked Key.
2. Replace the current scattered address/Key/footer rules with compact shared row styling and accessible interactive states.
3. Preserve responsive behavior and verify the desktop card remains hidden on mobile.
4. Extend focused shell E2E for structure, geometry, replacement, and privacy contracts.
5. Run TypeScript, UI contract, focused E2E, production build, browser visual inspection, and `git diff --check`.

## Verification Results

- `npm run check`: passed.
- `npm run ui-contract`: passed.
- `npm run privacy`: passed.
- Focused Key replacement E2E: 4 passed across 1440, 1280, 390, and 375 projects.
- Full `module-shell.spec.ts`: 89 passed, 27 skipped.
- `npm run build`: passed with the existing chunk-size advisory only.
- Browser review passed in dark and light themes at `1280x720`.
- The card ends at `696px` in a `720px` viewport, keeps a `12px` gap below navigation, and creates no horizontal overflow.
- Both connection rows render at `52px` with equal width and aligned icon/text columns.
- `git diff --check`: passed; line-ending notices are repository-wide warnings only.
