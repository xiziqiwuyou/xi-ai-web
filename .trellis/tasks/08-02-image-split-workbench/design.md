# Technical Design

## Layout

`figma-image-builder` becomes a two-column desktop grid. `ImageStudio` keeps request state and renders the form in the left track. A new `figma-image-output-pane` occupies the right track and switches only its internal state among idle, loading, and `ImageResultGallery`. Notices and the inspiration waterfall span both tracks. Below 1024px the grid collapses to one column.

## Quantity Contract

Remove `imageCountOptions` and the `count` React state. The timing key and generation payload use the literal value `1`. Server normalization remains unchanged so API compatibility is preserved outside the public UI.

## Loading State

Idle and loading states share one aspect-ratio-aware result stage. Loading uses a CSS border spinner with a reduced-motion fallback, not a progress bar. The stage contains an accessible status with elapsed time and the server-global estimate. Estimate sample copy moves from the form footer into the right pane.

## Result State

`ImageResultGallery` receives the selected aspect ratio and uses it for the thumbnail. The gallery remains the owner of preview and image actions. Starting a new request clears the previous result so the loading frame occupies the same right-hand surface.

## Workbench Alignment

The form and result pane are both top-aligned grid items. The result pane owns a shared outer shell matching the composer border, radius, padding, and surface color, while the loading frame and completed gallery remain internal states. This keeps the header and workbench visually aligned without changing the generation API.

When the equal-height row is taller than the form's intrinsic content, the prompt field uses a two-row grid so the textarea absorbs the extra height. The composer footer remains a compact full-width action row instead of leaving an unstructured empty region beside a right-aligned button.

## Inline Prompt Variants

ImageStudio keeps the editable prompt as the original draft and stores the optimized response separately. The textarea renders the active variant, while a compact text switcher labeled "优化前" and "优化后" selects the prompt sent to generation. Manual edits clear the comparison state and become the new original draft. The prompt toolbar keeps the switcher in a stable row so responsive layouts do not jump when the controls appear.

## Built-in Image Prompt Instruction

The server owns the image-specific optimization instruction in server/image-prompt.mjs. It requires preservation of user intent and exact text, fills only useful visual structure, handles image-edit intent, excludes UI-controlled parameters, treats the user description as untrusted content, and requires one plain prompt as output. The route sends this instruction through the selected chat model and continues to normalize wrappers and reject HTML responses.

## Cross-origin Result Actions

Image result actions first try direct browser access. For HTTPS assets that fail because the remote host does not expose CORS, the browser calls the guarded same-origin image importer, reads the returned data URL, and reuses the existing canvas transform pipeline for clipboard PNG writes and downloads. If both paths fail, copy retains the explicit source-URL fallback and download exposes the bounded read error.

## Rollback

Restoring the fourth quantity menu and moving `ImageResultGallery` below the form returns the previous single-column composition without changing server APIs.
