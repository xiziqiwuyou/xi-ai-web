# Image split workbench and inline loading preview

## Goal

Remove the public image count control, fix generation to one image, and move result/loading into a responsive right-hand preview pane.

## Requirements

- Remove the image quantity menu and all public quantity copy from Image Studio.
- Every Image Studio generation and edit request must send `count: 1`.
- Keep server API count normalization compatible for non-UI callers.
- Use a stable two-column desktop workbench with the creation form on the left and current result on the right.
- Keep the result pane mounted before, during, and after generation so the page does not jump.
- Render a rotating loading indicator inside the result image frame while generation is running.
- Show elapsed time, server-global recent-10 estimate, and sample count inside the result pane rather than in the parameter deck.
- Replace the loading frame in place with the generated image and preserve preview/edit/copy/download/regenerate actions.
- Use the selected image aspect ratio for the loading frame and result thumbnail.
- Stack form and result vertically below the desktop breakpoint without horizontal overflow.
- Keep the left composer and right result surface on the same desktop top baseline with one shared panel language.
- Keep prompt optimization inside the prompt field: show the returned text in the textarea and provide clear text toggles labeled "优化前" and "优化后" without inserting a variable-height preview block.
- Preserve prompt field geometry while optimization completes and when the active prompt variant changes, including responsive layouts.
- When equal-height desktop columns create extra vertical space, allocate it to the prompt textarea and keep the bottom action row compact and full-width.
- Use a server-owned image prompt optimization instruction that preserves user intent, supports text-to-image and image-to-image descriptions, isolates UI parameters, and rejects transport-wrapper output.
- When a generated image is hosted without browser CORS access, copy and download actions must retry through the guarded same-origin image importer before falling back to the source URL.

## Acceptance Criteria

- [x] No `生成数量` trigger is rendered.
- [x] Text-to-image and image-edit payloads both contain `count: 1`.
- [x] Desktop form and result panes are side by side and remain inside the viewport.
- [x] The result pane exists before generation and does not change outer geometry when loading starts.
- [x] Busy state exposes one accessible status with a rotating indicator and elapsed/estimated time.
- [x] Completed state shows one bounded result image in the right pane.
- [x] Tablet/mobile layouts stack and retain 44px actions with no horizontal overflow.
- [x] Existing image result dialog and edit handoff continue to work.
- [x] TypeScript, UI/feature contracts, focused desktop/mobile Playwright, production build, privacy scan, and `git diff --check` pass.

## Additional Acceptance Criteria

- [x] Composer and result surfaces share a desktop top baseline and unified outer panel treatment.
- [x] Optimized prompts use an inline "优化前"/"优化后" switcher and do not change prompt field height.
- [x] Extra desktop height is absorbed by the prompt textarea and no oversized blank footer region remains.
- [x] Image prompt optimization uses a tested built-in visual-director instruction before calling the selected chat model.
- [x] Cross-origin generated images use the same-origin importer for transformed clipboard copy and PNG download.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
