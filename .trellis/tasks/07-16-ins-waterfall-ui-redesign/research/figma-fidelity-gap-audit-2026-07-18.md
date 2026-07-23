# Figma Fidelity Gap Audit - 2026-07-18

## Evidence

- Authoritative Make file: `NqmyXu1t03HzZNssnm1dqL` (Version 24).
- The live preview was inspected through its iframe accessibility tree and the Make source resource.
- Local references were checked at `1440x900` and `390x844` under `reports/figma-fidelity`.

## Confirmed Gaps

1. **Chat session header hit area**
   - The reference treats the complete session header as the fold/unfold command. The model trigger remains an exception so it can open the model menu.
   - The local implementation only makes the small `点击折叠` control interactive.
   - Required fix: add a header command target, stop propagation from the model picker, and keep the explicit state label for keyboard users.

2. **Studio parameter controls**
   - Image model, ratio, and count, plus PPT audience, duration, and visual tone, are rendered as compact menu-button rows with a chevron in the reference.
   - Native selects preserve the value but do not reproduce the menu geometry, selected state, outside-click close, Escape close, or focus restoration.
   - Required fix: use one local menu-button primitive with a listbox-style popover and use it for each authored parameter row.

3. **Translation language controls**
   - Source and target language controls use the same compact menu anatomy as other authored controls. The tone group remains a segmented control.
   - Native selects make the desktop and mobile interaction inconsistent with the reference.
   - Required fix: use the same menu primitive and restore focus to the trigger after selection/close.

4. **Mobile navigation lifecycle**
   - The reference menu closes after route selection and when Escape is pressed; its trigger exposes the open state and the menu remains below the compact header.
   - The local menu closes on route changes but has no Escape close or explicit focus restoration.
   - Required fix: close on Escape and return focus to the menu trigger; retain the six-item order and 44px targets.

5. **Secondary control state coverage**
   - The visual pages already have the correct first-frame composition, but static contracts do not cover menu open/close, selected values, or mobile menu behavior.
   - Required fix: add focused E2E assertions for each authored menu and the header fold interaction rather than relying only on screenshot presence.

## Non-gaps Kept Intentionally

- The public shell still exposes exactly six destinations and no Admin/API entry.
- BYOK remains session-only and is opened contextually by the existing required dialog.
- The PPT creation gradient, map dot pattern, and session/assistant scrim blur remain the only Figma-approved visual exceptions.
- Provider requests, local conversation/gallery persistence, and admin isolation are outside this fidelity pass.
