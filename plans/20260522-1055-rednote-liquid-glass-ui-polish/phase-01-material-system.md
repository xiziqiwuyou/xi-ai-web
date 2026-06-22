# Phase 01: Material System

Status: planned
Priority: P0

## Goal

Create reusable CSS material tokens so the design feels intentional, not random.

## Changes

Modify:
- `C:\Users\56252\Documents\New project 2\src\styles.css`

Add:
- Glass tokens.
- Shadow scale.
- Control radius vs card radius.
- Motion easing tokens.
- Subtle background texture using CSS gradients only, no blobs.

## Implementation Notes

Use layered backgrounds:

```css
body {
  background:
    linear-gradient(180deg, rgba(255, 36, 66, .07), transparent 34%),
    radial-gradient(circle at 12% 0%, rgba(255, 244, 245, .9), transparent 34%),
    #faf7f5;
}
```

Use glass utility pattern:

```css
.glass-panel {
  background: var(--glass-bg);
  border: 1px solid rgba(255, 255, 255, .72);
  box-shadow: var(--glass-shadow), var(--inner-highlight);
  backdrop-filter: blur(18px) saturate(1.18);
}
```

Do not create visible orb decorations.

## Success Criteria

- Design tokens reduce repeated hard-coded shadows/radii.
- Panels have consistent depth.
- Existing readability remains intact.
