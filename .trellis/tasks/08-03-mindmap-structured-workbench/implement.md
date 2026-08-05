# Structured mind map workbench implementation

## Phase 1 - Contract And Regression Baseline

- Add shared TypeScript types and server-side normalization tests before replacing behavior.
- Cover clean/fenced JSON, legacy Markdown, bounds, duplicate siblings, invalid output, expansion merge, and serializers.
- Record current active-route and public-shell invariants in focused tests.

## Phase 2 - Server Structured Generation

- Implement trusted preset profiles and the structured document helper.
- Split the Mind Map route from Translation and return `mindmap` plus compatible Markdown.
- Implement `generate`, `expand`, and `reorganize` request projections with bounded current-document input.
- Add route-level tests proving selected models and operation payloads use the existing provider adapter.

## Phase 3 - Client Document And Canvas

- Implement client normalization, immutable editing commands, serializers, and layout projection.
- Replace the four-branch decorative canvas with complete-tree rendering, zoom, fit, selection, and collapse.
- Preserve shell/workspace scroll ownership and responsive geometry.

## Phase 4 - Workbench And Real Actions

- Add preset, depth, and density controls plus a larger source input.
- Add the selected-node editor and local add/delete/move commands.
- Wire real AI Expand and AI Reorganize requests with clear busy, failure, and retry states.
- Mark initial content as an example or use an explicit empty state; never present it as generated output.

## Phase 5 - Export, Cleanup, And Verification

- Add clipboard, Markdown, Mermaid, SVG, and PNG exports from the current document.
- Update static contract readers when active implementation moves into new files.
- Remove or retire unreachable duplicate mind-map UI only after active behavior is locked by tests.
- Update frontend/backend specs with the structured mind-map contract.

## Validation

```powershell
npm.cmd run check
npm.cmd run ui-contract
npm.cmd run feature-audit
npm.cmd run build
npm.cmd run test:server
$env:PLAYWRIGHT_BASE_URL='http://127.0.0.1:8788'
npm.cmd exec -- playwright test tests/e2e/mindmap-workbench.spec.ts --workers=1
npm.cmd exec -- playwright test tests/e2e/module-shell.spec.ts --grep "Mind Map" --workers=1
git diff --check
```

## Risk And Rollback Points

- Parser risk: keep legacy Markdown/Mermaid fallback and reject meaningless trees.
- Provider portability risk: do not add response-format fields unsupported by the common adapter.
- Layout risk: cap nodes/depth and test long Chinese labels at desktop/mobile widths.
- Dirty-worktree risk: touch only mind-map, shared type, route, owning contract, and focused test surfaces; preserve unrelated user edits.
