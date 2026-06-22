# UI Ergonomics Improvement Plan

Date: 2026-06-05

## Goal

Improve the public frontend so the core AI workspace feels easier for people to operate: clearer navigation, more helpful API setup, better model/input states, stronger focus affordances, and fewer layout surprises on desktop and mobile.

## Scope

- Public app shell and workbench UI only.
- No public admin entry.
- No login/registration.
- Keep user API URL/key stored only in browser session storage.
- No new dependencies.
- No backend behavior changes unless required by UI contracts.

## Target Friction Points

1. Global search currently opens only after typing; users do not get quick-switch suggestions on focus.
2. API setup modal does not clearly show per-field completion and is easy to treat as a generic settings card.
3. Model picker has weak empty/disabled state, so unsupported modules can feel broken.
4. Prompt composers lack consistent input affordances such as character count, keyboard submit hints, and a busy/disabled state that explains what is happening.
5. Modal/page scrolling and mobile workbench spacing can be tighter and more touch-friendly.

## Implementation Steps

1. TopBar search
   - On desktop, open enabled suggestions on focus, not only after typing.
   - Keep global search intentionally hidden under 760px where bottom navigation is the primary mobile path.
   - Add a small helper row for Enter/Escape behavior and connect it with `aria-describedby`.
   - Preserve keyboard navigation and enabled-only results.
2. API configuration
   - Add URL/key field status chips and helper text.
   - Add autocomplete/input mode attributes.
   - Add modal body scroll lock while open and restore body styles on close/unmount.
   - Make required modal state feel deliberate instead of dismissible.
   - Keep first-field autofocus and required-mode Escape gating.
3. Model and prompt controls
   - Add disabled/empty state text to `ModelPicker`, connected with `aria-describedby`.
   - Add informational prompt character count, Ctrl/Command+Enter submit support, and visible busy state copy to the shared workbench `PromptComposer`.
   - Add matching informational count and Ctrl/Command+Enter behavior to the chat composer so chat and generation inputs do not diverge.
   - Character count is informational only; no hard limit is introduced in this phase.
4. Visual and layout polish
   - Add stronger but restrained focus/hover states.
   - Tighten workbench sidebar/main spacing.
   - Improve mobile modal and form action layout.
5. Contract and QA
   - Extend `scripts/ui-contract.mjs` for new UI affordances.
   - Add a no-dependency runtime UI script using Edge/Chrome remote debugging when available.
   - Run `npm run check`, `npm run build`, `npm run ui-contract`, `npm run ui-runtime`, `npm run qa`, and `npm run smoke`.

## Acceptance Criteria

- Search suggestions open on focus and remain keyboard navigable.
- Mobile keeps the existing bottom navigation path; desktop global search remains hidden below 760px by design.
- API modal clearly communicates URL/key readiness without exposing secrets.
- API modal locks body scroll and restores it on close.
- Model picker communicates when no model supports the current capability.
- Shared workbench and chat composers support Ctrl/Command+Enter submit, plain Enter continues multiline editing, and both display input status.
- UI contract tests cover the new interaction affordances.
- Runtime UI script verifies focus-open search, modal scroll lock, and Ctrl/Command+Enter behavior when a supported browser is available.
- No public admin/settings entry is introduced.
