# Public module transition and preload performance

## Goal

Make public menu navigation feel immediate and intentional while reducing the real wait for lazily loaded module code.

## Requirements

- Show a compact loading response when switching between public modules without covering or shifting the whole shell.
- Keep the current module visible while the destination module code is loading, then animate the destination into place.
- Preload the destination module when an enabled navigation item receives hover, pointer-down, touch, or keyboard focus intent.
- Keep URL, title, browser history, mobile focus restoration, and disabled-menu behavior unchanged.
- Respect `prefers-reduced-motion` and keep loading text available to assistive technology.
- Do not add a dependency or eagerly bundle all heavy public modules into the initial JavaScript chunk.

## Acceptance Criteria

- [ ] Navigation exposes a short progress treatment and target module label while a transition is pending.
- [ ] Repeated navigation to an already loaded module does not show a long blocking loader.
- [ ] Public module bundles preload from menu intent and retain lazy chunk boundaries in production output.
- [ ] Desktop and mobile navigation, browser back/forward, focus behavior, and scroll ownership pass browser tests.
- [ ] Type check, UI contract, production build, and targeted E2E tests pass.

## Notes

- Treat this as a lightweight frontend task; PRD-only planning is sufficient.
