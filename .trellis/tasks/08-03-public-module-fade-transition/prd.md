# Public Module Fade Transition

## Goal

Make left-side public menu switches feel softer and more continuous without slowing navigation or moving the application shell.

## Requirements

- Animate only the public workspace canvas. The desktop/mobile navigation, shell geometry, footer, and scroll owner must stay fixed.
- Keep the current module visible while the destination lazy import is pending.
- After the destination is ready, apply a short fade-out to the current canvas and a short fade/settle entrance to the new canvas.
- Keep the complete interaction within roughly 160-220ms after the destination is ready.
- Preserve current failed-import rollback, last-request-wins navigation, browser history, focus, and accessibility behavior.
- Disable practical opacity/transform animation under `prefers-reduced-motion: reduce`.
- Do not add dependencies or feature-module-specific transition code.

## Acceptance Criteria

- [x] Clicking any available public menu keeps the old module mounted while a cold import is pending.
- [x] A ready destination switches through a short `out` phase and mounts with an `in` phase.
- [x] The shell and workspace geometry do not shift during either phase.
- [x] Reduced-motion users receive an immediate, non-animated switch.
- [x] Rapid navigation still resolves to the last requested module.
- [x] Type checking, production build, targeted navigation E2E, UI contracts, and `git diff --check` pass.

## Notes

- This is a lightweight shell interaction task. The PRD is the complete planning artifact.
