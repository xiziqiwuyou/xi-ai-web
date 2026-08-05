# Implementation Plan

1. Add failing E2E/static contracts for composer usage, fallback estimates, quick context selection, persistence, and the removed dialog slider.
2. Add the immediate context-count update boundary in `ChatModule` and pass it to `ChatSessionBlock`.
3. Render the usage/context controls in the existing session-tools row and remove per-message usage rendering.
4. Remove the duplicate settings slider and update the usage-toggle copy.
5. Add scoped desktop/mobile styles without changing the authored message/composer geometry.
6. Run TypeScript, Chat contracts, focused and full Chat Playwright, production build, and diff checks.
