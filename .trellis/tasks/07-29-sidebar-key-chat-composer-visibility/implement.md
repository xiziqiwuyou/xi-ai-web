# Implementation Plan

1. Add shell-level regression tests for a masked, interactive Key row and session-only replacement.
2. Add Chat geometry regressions for desktop composer viewport containment and mobile safe-area reachability.
3. Add a pure Key-mask helper and pass only its result plus the existing modal-open callback through `AppShell` and `TopBar`.
4. Render the desktop Key row and a mobile replace-Key icon using existing button/icon primitives and accessible names.
5. Replace the desktop message-history `100dvh` height with expanded-session grid sizing; preserve mobile natural flow and safe-area padding.
6. Run TypeScript, focused E2E, UI/feature contracts, build, runtime smoke, and `git diff --check`.

## Verification Results

- `npm run check`: passed.
- `npm run ui-contract`: passed.
- `npm run feature-audit`: passed.
- `npm run privacy`: passed.
- `npm run build`: passed.
- Focused Key replacement and composer-containment E2E: 8 passed, 4 skipped.
- Full shell and Chat E2E scope: 113 passed, 35 skipped.
- Desktop browser geometry at `1440x900`: composer bottom `831.83px`, generation note bottom `855.33px`, viewport bottom `900px`, horizontal overflow `0px`.
- Mobile browser review at `390x844`: replacement row is reachable in the function menu and the Chat page remains contained behind the overlay.
