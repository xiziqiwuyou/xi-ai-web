# Image result preview and editing actions

## Goal

Turn image generation results into a compact, reusable thumbnail and preview workflow for both text-to-image and image-to-image results.

## Requirements

- Render generated images as bounded thumbnails instead of full-width images.
- Open a shared modal preview when a thumbnail is activated.
- Provide rotate-left, rotate-right, horizontal flip, vertical flip, zoom-out, zoom-in, and reset controls in the preview.
- Provide copy-image, download-image, regenerate, and edit-image commands.
- Regenerate through the existing image request flow without duplicating Provider logic.
- Edit-image converts the selected result into a local PNG reference, selects a compatible editable model when required, switches to image-edit mode, and scrolls the editor into view.
- When a remote result host blocks browser CORS, edit-image retries through a same-origin server importer that accepts public HTTPS images only, rejects redirects/private targets/non-image data, and enforces timeout and byte limits.
- Close the preview before the deferred editor scroll runs so overlay scroll locking cannot swallow the navigation.
- Apply the same result behavior regardless of whether the source request was text-to-image or image-to-image.
- Keep API Keys and generated image bytes inside existing browser/session boundaries.

## Acceptance Criteria

- [x] One result does not expand to fill the entire content width.
- [x] Thumbnail activation opens one accessible preview dialog with a bounded image viewport.
- [x] Every transform control updates the preview and reset restores the initial state.
- [x] Download produces a PNG and copy uses the image clipboard when supported, with a clear fallback message.
- [x] Regenerate sends one new request through the existing form settings.
- [x] Edit-image closes the preview, switches to edit mode, and provides both CORS-readable and CORS-blocked remote results as the image input.
- [x] The server importer rejects unsafe URLs, redirects, unsupported media, and oversized images without exposing an unrestricted proxy.
- [x] The editor scroll executes after the preview overlay releases its scroll lock.
- [x] Desktop and mobile layouts keep one dialog scroll owner and no horizontal overflow.
- [x] TypeScript, production build, UI contracts, focused Playwright tests, and `git diff --check` pass.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
