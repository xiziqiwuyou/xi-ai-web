# Structured mind map workbench

## Goal

Turn the public Mind Map destination into a reliable BYOK workbench that converts a topic or source text into a validated hierarchical document, displays every generated node, supports lightweight local editing, and performs real AI expansion and reorganization.

## Background

The active `MindmapStudio` can call `/api/generate/mindmap`, but its authored canvas renders at most four first-level branches. Its current Expand action only changes selection and its AI Reorganize action only rotates the local array. The server requests free-form Mermaid plus prose, and the response has no typed mind-map field or structural validation. A retired `MindmapModule` contains source editing and a fuller SVG canvas but is not routed.

## Requirements

- R1: Define one versioned `MindmapDocument` tree contract shared by API response types, frontend state, editing helpers, rendering, and exports.
- R2: The server owns trusted prompts, preset profiles, parsing, bounds, deduplication, generated IDs, and Markdown fallback. Browser text never becomes a system prompt.
- R3: Provide eight presets: free brainstorm, meeting action, project plan, learning notes, product planning, content outline, problem analysis, and decision comparison.
- R4: Generation options are intentionally compact: model, preset, maximum depth, information density, and topic/source text.
- R5: The canvas renders the complete normalized tree and supports zoom, reset/fit, expand/collapse, node selection, and overflow-safe desktop/mobile navigation.
- R6: Lightweight editing supports rename, optional note, add child, delete non-root node, and move among siblings. Free dragging and cross-node relationship edges are out of scope.
- R7: AI Expand sends the selected bounded subtree and merges returned children without rewriting unrelated nodes. AI Reorganize sends the bounded current document and returns one newly normalized complete tree.
- R8: Copy and export produce content matching the edited document. Required formats are Markdown, Mermaid, SVG, and PNG.
- R9: Existing BYOK connection, managed upstream, model catalog selection, gallery result callback, module transition, and public shell geometry remain unchanged.
- R10: Malformed or incomplete model output never masquerades as a successful map. Use deterministic normalization/fallback where safe and a clear error otherwise.
- R11: Do not add a dependency. Reuse the existing chat-completion adapter, parser/export code, UI primitives, and active rednote-flat-v2 style layer.

## Acceptance Criteria

- [x] A simple topic produces a version-1 document with one root, 3-8 first-level branches, no duplicate sibling labels, bounded labels/notes, at most 60 total nodes, and the requested maximum depth.
- [x] OpenAI Chat/Responses, Anthropic Messages, and Gemini-backed catalog entries continue through the existing provider adapter with the selected request model.
- [x] The active canvas shows all normalized levels rather than only four branch summaries; empty/default content is explicitly presented as an example or empty state.
- [x] Rename, note editing, add child, delete, sibling move, collapse, expand, zoom, and fit update the visible document without a provider call.
- [x] AI Expand makes a provider request and changes only the selected branch; AI Reorganize makes a provider request and replaces the normalized whole-tree arrangement.
- [x] Markdown, Mermaid, SVG, PNG, and clipboard outputs reflect the current edited document and contain no hidden default nodes.
- [x] Invalid JSON, fenced JSON, legacy Mermaid, Markdown fallback, over-depth trees, excess nodes, duplicate labels, and missing children are covered by tests.
- [x] Desktop 1280/1440 and mobile 375/390 flows have no document-width overflow, preserve 44px mobile targets, and keep actionable loading/error states.
- [x] Typecheck, build, UI contract, feature audit, focused server tests, and focused Playwright tests pass.

## Out Of Scope

- Arbitrary node dragging, free-form positioning, cross-node relationship lines, real-time collaboration, server-side user persistence, and a separate mind-map account system.
- Provider-specific structured-output APIs; the common adapter remains the portability boundary.
