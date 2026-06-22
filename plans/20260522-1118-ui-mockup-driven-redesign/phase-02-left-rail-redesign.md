# Phase 02: Left Rail Redesign

Status: planned
Priority: P0

## Goal

Match the mockup's narrow, icon-forward menu.

## Target Specs

Desktop:
- Shell left column: 96px.
- Left rail internal padding: 12px.
- Brand badge: 52px square.
- Menu tile: 64px high.
- Icon visual size: 28-32px.
- Label: 12px, one line, centered.

Collapsed tablet:
- Same 84-88px rail.
- Hide secondary brand text.

Mobile:
- Horizontal top rail.
- Icon tile: 52px.
- Labels hidden or very small.

## Files

Modify:
- `src/styles.css`
- `src/app/LeftNav.tsx`

## CSS Direction

Use structure:

```css
.rednote-shell {
  grid-template-columns: 96px minmax(0, 1fr);
}

.module-button {
  grid-template-columns: 1fr;
  justify-items: center;
  min-height: 64px;
}

.module-button svg {
  width: 34px;
  height: 34px;
}
```

## Success Criteria

- Menu feels like app navigation, not admin sidebar.
- Icon tiles are visually dominant.
- Text never wraps awkwardly.
