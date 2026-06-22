# Phase 03 - Shared Workbench Components

## Overview

Status: Completed  
Priority: P0

Create shared components before rewriting every feature page. This keeps UI consistent and prevents repeated module-specific layouts.

## Components To Create

- `WorkbenchLayout`
- `WorkbenchSidebar`
- `WorkbenchMain`
- `ModelPicker`
- `ConnectionStatus`
- `PromptComposer`
- `PromptPresetGrid`
- `GenerationOptions`
- `ResultPanel`
- `AssetGallery`
- `EmptyState`
- `CapabilityBadge`
- `HistoryStrip`

## Related Files

- Create: `C:\Users\56252\Documents\New project 2\src\components\workbench\WorkbenchLayout.tsx`
- Create: `C:\Users\56252\Documents\New project 2\src\components\workbench\ModelPicker.tsx`
- Create: `C:\Users\56252\Documents\New project 2\src\components\workbench\PromptComposer.tsx`
- Create: `C:\Users\56252\Documents\New project 2\src\components\workbench\ResultPanel.tsx`
- Create: `C:\Users\56252\Documents\New project 2\src\components\workbench\AssetGallery.tsx`
- Modify: `C:\Users\56252\Documents\New project 2\src\styles.css`
- Modify: `C:\Users\56252\Documents\New project 2\src\types.ts`

## Component Contracts

```ts
type WorkbenchLayoutProps = {
  title: string;
  description: string;
  sidebar: ReactNode;
  children: ReactNode;
  result?: ReactNode;
};

type ModelPickerProps = {
  models: ModelCatalogEntry[];
  capability: ModelCapability;
  value?: string;
  onChange: (id: string) => void;
};
```

## Implementation Steps

1. Extract model filtering from chat/generation into helpers.
2. Create shared `ModelPicker`.
3. Create shared `ConnectionStatus` tied to BYOK settings.
4. Create `PromptComposer` with:
   - prompt textarea
   - preset chips
   - submit button
   - advanced options slot
5. Create `ResultPanel` with:
   - text result
   - image/audio/video assets
   - raw details
6. Replace generation module internals only after shared components compile.

## Success Criteria

- Chat and generation modules use the same model picker style.
- All generation pages share submit/result states.
- Capability filtering is centralized.
- No duplicate card/control CSS for each module.

## Completed Notes

- Added shared workbench components under `src/components/workbench`.
- Centralized model capability filtering and preferred model selection in `model-utils.ts`.
- Updated chat to use the shared `ModelPicker`.
- Updated image/audio/video/agents/knowledge generation pages to use `WorkbenchLayout`, `ConnectionStatus`, `ModelPicker`, `PromptComposer`, `GenerationOptions`, and `ResultPanel`.
- Fixed mobile workbench layout so the prompt form and result panel do not overlap.

## Validation

- `npm run check` passed.
- `npm run build` passed.
- Browser validation confirmed image/audio/video/agents/knowledge pages render the shared workbench.
- Desktop and mobile screenshots saved under `reports/screenshots`.

## Risk

- Component abstraction too early can slow delivery.
- Mitigation: keep props simple. Extract only repeated UI.
