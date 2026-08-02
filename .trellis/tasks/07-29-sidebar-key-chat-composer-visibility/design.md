# Design

## State And Component Boundary

`App` remains the owner of `UserProviderConfig` and `apiConfigOpen`. It derives a non-reversible masked Key label and passes that label plus `onOpenApiConfig` through `AppShell` to `TopBar`. `TopBar` renders the desktop access-card row and a mobile icon action; neither child receives the full Key.

The existing `ApiConnectionModal` remains the only editing surface. Replacing a Key therefore keeps the current sanitization, required-dialog behavior, focus management, and sessionStorage persistence.

## Key Mask Contract

- Empty Key: `未配置`.
- Key with four or more characters: `•••• ${lastFour}`.
- Short Key: `••••`.
- The mask helper accepts a string and never returns the original value.

## Chat Height Contract

Desktop Chat uses the shell's available viewport rather than a second independent `100dvh` message-history calculation. The expanded session becomes a grid with header, flexible message history, and controls. A desktop maximum block size is derived from the viewport after shell padding and Chat heading; the history receives the remaining space with a bounded minimum.

At widths below `1024px`, the public shell has a mobile header and natural page flow. The fixed desktop session height is removed, the message history retains its existing mobile minimum, and the composer area receives `env(safe-area-inset-bottom)` padding.

## Compatibility

- Exactly one expanded conversation remains enforced by existing Chat state.
- Composer width, message track width, command palette placement, and attachment layout remain unchanged.
- No storage or API payload migration is required.

## Verification

- BYOK E2E covers masked rendering, dialog opening, replacement, sessionStorage-only persistence, and no full-Key shell leakage.
- Chat visual E2E measures composer/generation-note bounds against `window.innerHeight` across desktop viewports and validates mobile reachability/overflow.
- Existing wheel and stacked-session tests protect nested scrolling and collapsed-session access.
