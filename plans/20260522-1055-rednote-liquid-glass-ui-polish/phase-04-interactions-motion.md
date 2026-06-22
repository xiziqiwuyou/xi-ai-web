# Phase 04: Interactions and Motion

Status: planned
Priority: P1

## Goal

Add small interactions that make the UI feel alive.

## Changes

Modify:
- `C:\Users\56252\Documents\New project 2\src\styles.css`
- Small optional changes in React components only if CSS selectors are insufficient.

## Interactions

- Nav/menu hover: lift + highlight.
- Thread card hover: lift + shadow.
- Buttons: press scale.
- Admin drawer: slide-in animation.
- Notice: fade/slide in.
- Module placeholders: initial soft reveal.
- Composer focus: red glow and slightly raised container.

## Accessibility

Respect reduced motion:

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: .01ms !important;
    transition-duration: .01ms !important;
  }
}
```

## Success Criteria

- Motion is noticeable but not distracting.
- Keyboard focus remains visible.
- No layout shift during hover.
