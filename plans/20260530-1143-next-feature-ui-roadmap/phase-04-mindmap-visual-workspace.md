# Phase 04 - Mindmap Visual Workspace

## Context Links

- Mindmap generation path: `C:\Users\56252\Documents\New project 2\src\features\generation\GenerationModule.tsx`
- Result renderer: `C:\Users\56252\Documents\New project 2\src\components\workbench\ResultPanel.tsx`
- Server prompt: `C:\Users\56252\Documents\New project 2\server\index.mjs`

## Overview

Date: 2026-05-30  
Priority: P1  
Status: Completed

Upgrade mindmap from raw text/Mermaid output into a visual workspace with rendered nodes, zoom/pan, edit-friendly text, and export.

## Key Insights

- Current server prompt asks for Mermaid mindmap plus hierarchy notes.
- The app already uses React and can lazy-load a renderer.
- Native DOM/SVG renderer gives more design control than dumping raw Mermaid only.

## Requirements

- Parse generated Mermaid mindmap or Markdown hierarchy.
- Render a visual mindmap.
- Support zoom in/out, fit view, pan.
- Keep raw Markdown/Mermaid available.
- Export Markdown.
- Export SVG or PNG.
- Use Rednote glass design without heavy decorative noise.

## Architecture

Two-layer renderer:

```text
MindmapModule
  prompt/options sidebar
  visual result panel
  raw source tab
  export actions

mindmapParser.ts
  mermaid mindmap parser
  markdown heading/list fallback

MindmapCanvas.tsx
  SVG or DOM tree renderer
  zoom/pan controls
```

Avoid making Mermaid the only path. If model output is imperfect, fallback parser should still display a tree.

## Related Code Files

- Create: `C:\Users\56252\Documents\New project 2\src\features\mindmap\MindmapModule.tsx`
- Create: `C:\Users\56252\Documents\New project 2\src\features\mindmap\mindmapParser.ts`
- Create: `C:\Users\56252\Documents\New project 2\src\features\mindmap\MindmapCanvas.tsx`
- Create: `C:\Users\56252\Documents\New project 2\src\features\mindmap\mindmapExport.ts`
- Modify: `C:\Users\56252\Documents\New project 2\src\app\ModuleRouter.tsx`
  - Route `mindmap` to dedicated module.
- Modify: `C:\Users\56252\Documents\New project 2\server\index.mjs`
  - Tighten mindmap prompt and result normalization.
- Modify: `C:\Users\56252\Documents\New project 2\src\styles.css`
  - Mindmap workspace, canvas controls, tabs, node styling.
- Optional dependency: `html-to-image` or custom SVG serialization.

## Implementation Steps

1. Extract mindmap flow from generic `GenerationModule` or wrap it with a dedicated visual result.
2. Build parser:
   - Mermaid `mindmap` code block.
   - Markdown headings.
   - Nested list fallback.
3. Build visual renderer:
   - Root node.
   - Branch groups.
   - Responsive layout.
   - Stable node dimensions.
4. Add interactions:
   - Zoom.
   - Pan.
   - Fit to screen.
   - Raw/visual tabs.
5. Add exports:
   - Markdown source.
   - SVG from rendered tree.
   - PNG if browser support is reliable.
6. Add empty and error states.
7. Validate long Chinese labels wrap cleanly.

## Todo List

- [x] Build parser with fallback paths.
- [x] Build visual renderer.
- [x] Add zoom/pan/fit controls.
- [x] Add raw source tab.
- [x] Add export actions.
- [x] Test long labels and mobile layout.

## Success Criteria

- Mindmap page renders a visual map after generation.
- User can switch between visual and raw source.
- User can export Markdown and SVG/PNG.
- Long labels do not overlap.
- `npm run check` and `npm run build` pass.

## Risk Assessment

- Risk: Model outputs invalid Mermaid.
  - Mitigation: parse Markdown fallback and show raw source.
- Risk: Canvas export gets flaky.
  - Mitigation: prioritize SVG export first.

## Security Considerations

- Do not inject raw Mermaid/Markdown as HTML.
- Escape labels in SVG export.

## Next Steps

After mindmap rendering, improve video/audio as long-running media workflows.
