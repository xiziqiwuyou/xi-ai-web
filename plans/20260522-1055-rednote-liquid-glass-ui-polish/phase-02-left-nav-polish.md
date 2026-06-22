# Phase 02: Left Navigation Polish

Status: planned
Priority: P0

## Goal

Make left menu feel like a premium content app navigation, not a generic sidebar.

## Changes

Modify:
- `C:\Users\56252\Documents\New project 2\src\styles.css`
- `C:\Users\56252\Documents\New project 2\src\app\LeftNav.tsx`

## Design Details

- Left nav becomes a floating glass rail inside the viewport.
- Brand block gets layered highlight and red badge shadow.
- Menu buttons get:
  - icon tile
  - active red tint
  - soft raised shadow
  - subtle left/inner active marker
  - hover translate `-1px`
  - active press scale `0.985`

## CSS Pattern

```css
.module-button {
  position: relative;
  transition:
    transform .18s var(--ease-spring),
    background .18s ease,
    box-shadow .18s ease;
}

.module-button:hover {
  transform: translateY(-1px);
}

.module-button.active::before {
  content: "";
  position: absolute;
  inset: 8px auto 8px 6px;
  width: 3px;
  border-radius: var(--radius-pill);
  background: var(--red);
}
```

## Success Criteria

- Active menu is instantly readable.
- Disabled menu still looks intentional.
- Mobile horizontal menu still fits.
- No text overlap.
