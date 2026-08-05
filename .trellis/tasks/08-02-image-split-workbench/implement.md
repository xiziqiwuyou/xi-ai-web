# Implementation Plan

1. Remove public quantity state/menu and lock Image Studio requests and timing keys to one image.
2. Add the right-side idle/loading/result composition and aspect-ratio handoff.
3. Rework scoped workbench CSS for desktop split layout, stable result geometry, spinner, and responsive stacking.
4. Update static contracts and Playwright assertions for three menus, fixed count, right-pane geometry, loading state, and completed result.
5. Run TypeScript, UI/feature contracts, focused Playwright, build, privacy, task validation, and diff checks.
6. Align the result shell with the composer and replace the variable-height prompt preview with an inline prompt variant switcher.
7. Add desktop/mobile regression assertions for prompt field geometry and original/optimized prompt selection.
