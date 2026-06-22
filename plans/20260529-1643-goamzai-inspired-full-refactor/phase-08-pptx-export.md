# Phase 08 - PPTX Export

Status: Completed

## Scope

- Add a real `.pptx` export path for the PPT module.
- Keep model generation on the existing `/api/generate/ppt` request path.
- Perform PPTX parsing and file creation in the browser so user API URL/Key remain request-only BYOK data.
- Do not add backend storage for generated PPT files or user credentials.

## Implementation

- Added `src/features/generation/pptxExport.ts`.
- Parses generated Markdown into a deck title, content slides, bullet points, and speaker notes.
- Supports common Markdown structures: H1/H2/H3 headings, numbered slide headings, bullets, and Chinese/English note labels.
- Uses `pptxgenjs` to create an editable widescreen presentation with a light Rednote-inspired visual style.
- Added a PPT-only `导出 PPTX` action in the shared result panel.
- Updated the module highlight and README to mark PPTX export as implemented.

## Validation

- `npm run check` passes.
- `npm run build` passes.
- In-memory PPTX generation smoke test passes, including English/Chinese speaker note parsing and numbered-list parsing guards.
