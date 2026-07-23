# Figma Handoff

- File: [xi-ai-web - Instagram Waterfall Redesign](https://www.figma.com/design/DRn9F4HRe5cpDSrHW8FiOQ)
- File key: `DRn9F4HRe5cpDSrHW8FiOQ`
- Creation method: Figma MCP `create_new_file`
- Editing method: Figma MCP `use_figma` with direct Figma Plugin API code
- Planned batches:
  1. Foundations and components
  2. Public desktop and mobile workspaces
  3. Admin desktop and mobile console

## Current Figma State

- The verified model-relay homepage was imported on 2026-07-18 as editable Figma node `16:2`.
- Direct link: https://www.figma.com/design/DRn9F4HRe5cpDSrHW8FiOQ?node-id=16-2

- Foundations board created successfully (`1440x1100`, page node `4:2`, frame node `4:3`).
- Shared Components board created successfully (`1440x1600`).
- Chat desktop board created successfully (`1440x900`, page node `12:2`, frame node `12:3`).
- Direct Plugin API development calls reached Figma's `429 Too Many Requests` limit while creating the Drawing board.
- Remaining screens will be captured from the verified implementation with `generate_figma_design` after cooldown. This is the fidelity closure step, not a fallback screenshot-only artifact: the capture creates editable Figma nodes from the delivered routes.

## Verified Implementation Handoff

- Final browser references are under `reports/redesign/final/` for `1440x900`, `1280x800`, `390x844`, and `375x812`.
- The folder contains all six public routes, `/admin`, mobile Drawing history, mobile Agent templates, the first-use API modal, and `audit.json`.
- The final audit covers 33 rendered states with zero horizontal overflow, exactly one visible scroll owner, zero rendered CSS gradients, and zero active backdrop filters.
- Playwright regression coverage asserts desktop `4/3` and mobile `2` masonry columns, responsive Admin navigation, public/Admin isolation, and scroll ownership.

## Version 24 Fidelity Closure Audit

- On 2026-07-18, all six public destinations were captured at `1440x900`, `1280x800`, `390x844`, and `375x812` (24 route/viewport states).
- Every state measured document/body width equal to the viewport, exactly one visible `figma-workspace` scroll owner, zero unapproved visible gradients, and zero unapproved backdrop blur.
- Additional interaction checks cover the fixed `224px` rail at the `1024px` breakpoint, single-column mobile navigation, complete menu dismissal/focus restoration, Chat vendor/model switching, and unbroken mobile hero phrases.

## Figma Connection Status

- On 2026-07-16, a fresh `codex exec` session confirmed the model channel works, but Figma metadata calls did not return before timeout; the MCP transport also logged an HTTP `403` response.
- A second metadata attempt using the provided SOCKS5 proxy also timed out before any Figma tool result.
- Neither attempt modified the Figma file or local implementation.
- Final `generate_figma_design` import remains pending until Figma MCP accepts authenticated calls again. The existing Foundations, Shared Components, and Chat Desktop frames remain unchanged.

## Constraints

- Flat light visual language.
- Instagram-clean white and neutral surfaces with restrained xi red accent.
- Responsive masonry only for browsable content and results.
- No gradients, backdrop blur, decorative glow, or public Admin entry.
- Desktop reference size: `1440x900`.
- Mobile reference size: `390x844`.
