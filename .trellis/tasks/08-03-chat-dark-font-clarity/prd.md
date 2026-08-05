# Chat dark typography clarity

## Goal

Make Chat message text more compact by default and improve small-text clarity across the dark public UI without changing the established layout or light-theme palette.

## Requirements

- New or unsaved Chat session settings default message text to `13px` while preserving every valid saved user choice from `13px` through `18px`.
- Dark mode uses a screen-optimized UI font stack and explicit browser text-rendering defaults that do not thin glyphs.
- Dark primary, muted, and faint text tokens remain visually distinct while meeting readable contrast on the dark surface.
- Chat message line height scales with the selected font size instead of retaining a fixed line height tuned for the former `15px` default.
- Keep the existing dark background, accent colors, component geometry, and light-theme typography unchanged.

## Acceptance Criteria

- [x] The default Chat message setting and the rendered default message bubble both compute to `13px`.
- [x] A previously saved valid custom message size is restored unchanged.
- [x] Dark mode resolves to the screen-optimized UI font stack for body, Chat messages, and controls.
- [x] Dark `--xhs-ink`, `--xhs-muted`, and `--xhs-faint` retain sufficient contrast against `--xhs-surface`; text-bearing parents do not add opacity, filters, or text shadows.
- [x] TypeScript, UI contracts, Chat-local contracts, build, and targeted Playwright desktop/mobile checks pass.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
