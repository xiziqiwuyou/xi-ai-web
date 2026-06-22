# Phase 06: QA and Visual Validation

Status: planned
Priority: P1

## Checks

Run:

```bash
npm run check
npm run build
```

Browser:
- Desktop 1440px.
- Tablet 1024px.
- Mobile 390px.
- Hover each menu tile.
- Active menu tile.
- Composer focus state.
- Admin drawer open.
- Disabled menu state.

## Visual Acceptance

- Left rail is narrow.
- Icon tiles are bigger than text.
- Glass effects are obvious but not muddy.
- Public UI has no admin/internal wording except optional admin icon title.
- No fake metrics.
- Text does not overlap.

## Regression Checks

- Chat still streams.
- Conversation create/delete still works.
- Admin menu toggles still persist.
- Public bootstrap still returns sanitized menu.
