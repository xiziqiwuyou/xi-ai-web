# Phase 05: Browser QA

Status: planned
Priority: P1

## Goal

Validate the polished UI visually and functionally.

## Checks

Run:

```bash
npm run check
npm run build
```

Browser:
- Open `http://localhost:8787/`.
- Check desktop 1440px.
- Check tablet 1024px.
- Check mobile 390px.
- Open admin drawer.
- Toggle menu visibility.
- Hover menu/thread/buttons.
- Focus composer.
- Open each module.

## Visual Acceptance

- Looks closer to Rednote: warm, white, red-accented, content-card style.
- Glass is light, not blurry sludge.
- Shadows create depth without muddying text.
- Buttons and menus feel tactile.
- No overlapping labels.
- No horizontal scroll on mobile.

## Risks

- Too much blur can hurt performance on low-end devices.
- Too much red can feel aggressive.
- Strong transparency can reduce contrast.

Mitigation:
- Keep blur on large containers only.
- Use solid white fallback backgrounds.
- Keep text containers mostly opaque.
