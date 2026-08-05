# Structured mind map workbench design

## Data Flow

```text
MindmapStudio form
  -> GenerationPayload.options.mindmap
  -> POST /api/generate/mindmap
  -> trusted preset + operation prompt
  -> existing requestChatCompletion provider adapter
  -> server parser / normalizer / bounds
  -> GenerationResult.mindmap + compatible Markdown text
  -> client normalization
  -> editable document state
  -> canvas / copy / export / gallery callback
```

## Shared Contract

```ts
type MindmapNode = {
  id: string;
  label: string;
  note?: string;
  children: MindmapNode[];
};

type MindmapDocument = {
  version: 1;
  title: string;
  summary?: string;
  root: MindmapNode;
};

type MindmapGenerationOptions = {
  presetId: MindmapPresetId;
  maxDepth: 2 | 3 | 4 | 5;
  density: "concise" | "balanced" | "detailed";
  operation?: "generate" | "expand" | "reorganize";
  targetNodeId?: string;
  currentDocument?: MindmapDocument;
};
```

Model output omits IDs. The server assigns stable bounded IDs during normalization. `GenerationResult.text` remains normalized Markdown for compatibility and `GenerationResult.mindmap` becomes the authoritative projection.

## Server Boundary

- Add `server/mindmap-preset-profiles.mjs` for trusted domain guidance and visible preset metadata mirrored by a typed frontend constant.
- Add `server/mindmap-document.mjs`, following `ppt-deck.mjs`: extract JSON candidates, normalize options, sanitize recursively, cap depth/children/total nodes, deduplicate siblings, serialize Markdown/Mermaid, and build operation-specific messages.
- Split Mind Map from the combined Mind Map/Translation branch in `server/index.mjs`.
- `generate` and `reorganize` parse a complete model document. `expand` parses one returned subtree and merges only new normalized children into the selected server-normalized current document.
- Legacy Mermaid/Markdown output remains a fallback through the existing parser semantics, but a fallback that cannot produce meaningful branches is rejected.
- The server validates `currentDocument` before embedding it in a prompt and bounds the final prompt through existing request limits.

## Frontend Boundary

- Add `src/features/mindmap/mindmapDocument.ts` as the single client owner for unknown-result normalization, immutable editing operations, node lookup, Markdown/Mermaid serialization, and visible-tree projection.
- Replace the authored four-card stage with a full tree canvas. Reuse the current lightweight SVG approach and deterministic layout; do not import another graph engine into the Studio chunk.
- The canvas owns collapse state separately from the document so export always includes the full document unless the user explicitly chooses a branch export later.
- `MindmapStudio` owns form, current document, selected node, operation state, source editor visibility, and request commands. It does not parse raw provider text inline.
- Keep controls compact. Preset/depth/density menus sit with the model and prompt; node editing appears only after selection.

## Layout

- Desktop: compact setup row/card above a large tree canvas with a narrow contextual inspector for the selected node.
- Mobile: setup controls stack, canvas remains horizontally scrollable/zoomable, and node editing opens as an in-flow panel below the canvas.
- Use a balanced bilateral layout around the root when there are multiple top-level branches. Descendant rows are allocated by subtree leaf weight so nodes do not overlap.
- Fit computes a bounded scale from viewport and content dimensions. Zoom remains preview-only and never mutates export geometry.

## Compatibility And Rollback

- Keep `text` in every result and retain `parseMindmap` as legacy fallback/import support.
- Existing gallery records without `mindmap` normalize from `text` when reopened.
- No metadata migration is required because the new field is optional.
- Rollback is limited to the dedicated route branch, new helper files, active Studio component, and owning CSS/tests.

## Security And Limits

- API Key remains request-only and sessionStorage-only under the existing BYOK contract.
- User source/current map are user-role content, never concatenated into trusted system rules without explicit delimiting.
- Defaults: maximum depth 4, balanced density, at most 8 children per node, 60 total nodes, 24 characters per label, and 180 characters per note.
- Unknown fields and model-provided IDs are discarded.
