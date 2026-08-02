# Sidebar Key Switch And Chat Composer Visibility

## Goal

Allow a public user to identify and replace the active session-only API Key from the lower-left access card, and keep the expanded Chat composer fully visible inside the browser viewport.

## Requirements

- The desktop access card shows a masked identifier for the current API Key and a clear replace action.
- The full API Key must not appear in normal page text, attributes, logs, URLs, localStorage, or backend data.
- Activating the replace action opens the existing API connection dialog with the current session value; saving continues to use `cherry-web-user-provider` in sessionStorage only.
- The required first-use dialog remains non-dismissible until a valid Key exists.
- Mobile users retain a reachable replace-Key action even though the desktop access card is hidden.
- On desktop, the currently expanded Chat session must keep its composer, send button, and generation note within the viewport at initial load and after changing viewport height.
- The message history owns the remaining vertical space and scrolls internally; collapsed sessions remain reachable through the public workspace scroll owner.
- Mobile Chat keeps natural document flow, safe-area bottom spacing, one visible scroll owner, and no horizontal overflow.

## Acceptance Criteria

- [x] A ready desktop session displays only a masked Key suffix in the lower-left access card.
- [x] Clicking the Key row or replace control opens the existing API dialog, and saving a replacement updates the mask without reloading.
- [x] Mobile exposes a 44px replace-Key control and preserves the existing navigation menu behavior.
- [x] The Key remains sessionStorage-only and the unmasked value is absent from rendered shell text and localStorage.
- [x] At `1440x900`, `1280x800`, and a `2048x1030` desktop viewport, the expanded composer bottom is inside the viewport with at least 12px visual clearance.
- [x] Desktop message history remains scrollable and the public workspace still reaches collapsed sessions.
- [x] At `390x844` and `375x812`, the composer is reachable, safe-area spacing is present, and there is no horizontal overflow.
- [x] TypeScript, focused BYOK/Chat E2E, UI contracts, production build, and `git diff --check` pass.

## Non-goals

- Persisting credentials beyond the current browser session.
- Displaying or copying the full Key from the sidebar.
- Adding provider URLs or provider-specific credentials to the public shell.
- Changing model request adapters or backend authentication.
