# Phase 01: Premium Visual System

Priority: high
Status: planned

## Overview

Refine the existing CSS system so the app feels closer to the reference image: clean warm white surface, richer glass, rounded tactile controls, and narrower icon-first navigation.

## Requirements

- Increase radius hierarchy.
- Make the left rail narrower and more sculpted.
- Make every module icon tile larger and more tactile.
- Add visible but restrained shadows and focus/hover motion.
- Avoid fake metrics, annotation panels, and public design/debug descriptions.
- Avoid one-note red-only palette. Red is primary; module icons may use subtle teal/blue/yellow accents.

## Related Code Files

- Modify: `C:\Users\56252\Documents\New project 2\src\styles.css`
- Modify: `C:\Users\56252\Documents\New project 2\src\app\LeftNav.tsx`
- Modify: `C:\Users\56252\Documents\New project 2\src\app\TopBar.tsx`

## Visual Tokens

Replace the current flat radius setup with explicit tiers:

```css
--radius-shell: 28px;
--radius-panel: 24px;
--radius-card: 18px;
--radius-control: 16px;
--radius-icon: 22px;
--radius-pill: 999px;
```

Recommended dimensions:

- App shell padding: `18px` desktop.
- Left rail: `86px` to `92px` desktop.
- Left rail panel radius: `28px`.
- Brand badge: `54px` square, radius `20px`.
- Menu button: `68px` to `74px` high.
- Menu icon tile: `48px` to `52px` square, radius `18px` to `20px`.
- Top bar radius: `24px`.
- Chat/composer panels: `24px`.
- Composer input shell: `22px` to `26px`.

## Implementation Steps

1. Update CSS variables.
2. Replace `--radius-card: 8px` usage where major panels need larger rounding.
3. Keep repeated item cards slightly smaller than shell panels.
4. Tune `.rednote-shell` grid to `92px minmax(0, 1fr)`.
5. Tune `.left-nav`, `.brand-card`, `.module-button`, `.module-button svg`.
6. Remove unused `.nav-footnote` and `.provider-health` CSS if no components use them.
7. Keep labels visible on desktop and 1024px. Hide only on narrow mobile if required.
8. Add active marker and glow that match the reference without overpowering content.

## Success Criteria

- Left rail feels like a premium floating control strip.
- Icons are visually dominant enough.
- Radius is consistent across shell, panels, cards, controls.
- UI looks more like the reference without copying brand text or annotation panels.
- No layout jump on hover/focus.

## Risks

- Too much blur can reduce readability.
  - Mitigation: keep content panels more opaque than decorative chrome.
- Narrow rail can truncate Chinese labels.
  - Mitigation: desktop label below icon; mobile horizontal rail with icon + optional label.

