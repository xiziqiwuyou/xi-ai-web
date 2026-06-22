# Phase 07 - Artifact Editing and Export Polish

## Context Links

- PPT export: `C:\Users\56252\Documents\New project 2\src\features\generation\pptxExport.ts`
- Mindmap module: `C:\Users\56252\Documents\New project 2\src\features\mindmap`
- Generation module: `C:\Users\56252\Documents\New project 2\src\features\generation\GenerationModule.tsx`
- Gallery module: `C:\Users\56252\Documents\New project 2\src\features\gallery\GalleryModule.tsx`
- Result panel: `C:\Users\56252\Documents\New project 2\src\components\workbench\ResultPanel.tsx`

## Overview

Date: 2026-05-30  
Priority: P2  
Status: Completed

Make generated artifacts editable and exportable, not just one-shot outputs.

## Key Insights

- PPTX export exists from generated Markdown.
- Mindmap visual canvas exists with raw/SVG export.
- Image/video controls are basic.
- Gallery can store results but not edit artifacts.

## Requirements

- Add PPT outline editor before export.
- Add mindmap node label editing and simple node add/delete.
- Add image prompt controls:
  - negative prompt.
  - style preset.
  - aspect ratio.
  - quality.
- Add video prompt controls:
  - duration.
  - camera motion.
  - style.
- Add "reuse/edit from gallery" flow.
- Keep text fitting and responsive UI.

## Architecture

Split artifact-specific editors:

```text
features/ppt/PptWorkspace.tsx
features/mindmap/MindmapEditor.tsx
features/generation/CreativeControls.tsx
features/gallery/replayRouting.ts
```

Use structured local state, not provider-specific raw JSON.

## Related Code Files

- Create: `C:\Users\56252\Documents\New project 2\src\features\ppt\PptWorkspace.tsx`
- Create: `C:\Users\56252\Documents\New project 2\src\features\ppt\pptOutlineParser.ts`
- Modify: `C:\Users\56252\Documents\New project 2\src\features\generation\pptxExport.ts`
  - Export edited outline.
- Modify: `C:\Users\56252\Documents\New project 2\src\features\mindmap\MindmapModule.tsx`
  - Add edit mode.
- Modify: `C:\Users\56252\Documents\New project 2\src\features\mindmap\MindmapCanvas.tsx`
  - Support editable selected node.
- Create: `C:\Users\56252\Documents\New project 2\src\features\generation\CreativeControls.tsx`
- Modify: `C:\Users\56252\Documents\New project 2\src\features\gallery\GalleryModule.tsx`
  - Add replay with editable draft.
- Modify: `C:\Users\56252\Documents\New project 2\src\App.tsx`
  - Carry replay draft state.

## Implementation Steps

1. PPT:
   - Parse Markdown into title/slide objects.
   - Render editable slide list.
   - Export edited outline to PPTX.
2. Mindmap:
   - Add selected node state.
   - Edit node text.
   - Add sibling/child.
   - Delete leaf node first.
3. Creative controls:
   - Add reusable controls for image/video.
   - Map options to provider request where supported.
   - Include controls in gallery metadata.
4. Gallery replay:
   - Navigate to original module.
   - Prefill prompt and options.
   - Mark as draft, not auto-submit.
5. QA:
   - Long Chinese labels.
   - Mobile overflow.
   - Export file opens.

## Todo List

- [ ] Add PPT outline parser/editor.
- [ ] Export edited PPTX.
- [ ] Add mindmap edit mode.
- [ ] Add creative controls.
- [ ] Add gallery replay draft.
- [ ] Validate mobile text fitting.

## Success Criteria

- User can edit PPT slides before export.
- User can edit mindmap nodes and re-export SVG/Markdown.
- Image/video prompts have practical controls.
- Gallery replay restores prompt/options.
- No layout overlap on desktop/mobile.

## Risk Assessment

- Risk: Editable PPT structure diverges from generated Markdown.
  - Mitigation: keep raw Markdown fallback.
- Risk: Mindmap editing gets complex.
  - Mitigation: support label/add/delete first, drag layout later.

## Security Considerations

- Do not render raw model output as HTML.
- Escape SVG labels on export.
- Keep gallery data local.

## Next Steps

After artifact workflows, add automation and release gate.
