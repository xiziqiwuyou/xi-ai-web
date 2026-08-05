# Implementation Plan

1. Add browser image blob, canvas transform, copy, download, and data-URL utilities.
2. Build the compact result gallery and accessible preview dialog.
3. Integrate regenerate and edit-to-image callbacks into `ImageStudio`.
4. Replace the oversized result CSS with bounded thumbnails and responsive preview styles.
5. Extend image E2E coverage for thumbnail geometry, preview controls, export, regenerate, and edit handoff.
6. Run TypeScript, UI contracts, focused desktop/mobile Playwright, production build, and diff checks.

## Rollback

The result component is isolated behind `resultImages.length`. Reverting the component integration and its scoped CSS restores the previous inline result behavior without changing Provider payloads or stored gallery records.
