# Test Spec - UI Ergonomics

Date: 2026-06-05

## Required Commands

- `node --check scripts\ui-contract.mjs`
- `node --check scripts\ui-runtime.mjs`
- `npm run ui-contract`
- `npm run ui-runtime`
- `npm run check`
- `npm run build`
- `npm run qa`
- `npm run smoke`

## Static Contract Assertions

- TopBar:
  - Desktop search opens enabled suggestions on focus, including an empty query.
  - Search exposes combobox/listbox semantics.
  - Search keeps ArrowUp/ArrowDown/Enter/Escape handling.
  - Search includes helper text for keyboard behavior, referenced by `aria-describedby`.
  - Search continues filtering disabled menu items.
  - Mobile global search remains intentionally hidden below `760px` because bottom navigation is the mobile module switcher.

- API Connection:
  - Modal locks background scroll while open.
  - Modal restores background scroll on close/unmount.
  - Form uses autocomplete/input mode hints for URL and key fields.
  - Form exposes URL and API Key readiness indicators.
  - Required mode keeps Escape close gated until URL/key are ready.
  - Reset action remains optional and does not persist server-side secrets.
  - API key status never renders the raw key beyond masked/filled state.

- Model Picker:
  - Disabled/empty model state is visible and connected with `aria-describedby`.
  - Select remains disabled when no model is available.

- Prompt Composer:
  - Shared workbench composer shows an informational character count.
  - Chat composer shows an informational character count.
  - Shared workbench and chat composers support Ctrl/Command+Enter submit from the textarea.
  - Plain Enter keeps multiline editing in both composer surfaces.
  - Ctrl/Command+Enter submits only when the same submit button would be enabled.
  - Busy state exposes accessible status text.

## Runtime UI Assertions

- Uses a locally installed Chromium-family browser through remote debugging when available.
- Verifies at desktop width:
  - Focusing global search opens the suggestions popover before typing.
  - Search helper copy is present.
  - API modal sets body overflow to locked state while open.
  - Typing into the chat composer and pressing Ctrl+Enter clears/submits the prompt.
- Verifies at mobile width:
  - Global search is hidden.
  - Bottom navigation remains available.
  - API modal width fits the viewport.

If no supported browser is available, runtime UI script must fail with a clear environment message instead of silently passing.

## Runtime Smoke Assertions

- `/` serves the app root.
- `/admin` remains a direct route only.
- `/api/public/bootstrap` does not leak `apiKey`, `baseUrl`, admin entry flags, settings menu, or public conversations.
- Legacy public conversations route still returns 410.

## Review Gates

- Code review must have no remaining findings.
- Architecture review must be CLEAR.
- UltraQA must pass or document a concrete blocker.
