# Phase 07 - Admin Model and Prompt Ops

## Context Links

- Admin portal: `C:\Users\56252\Documents\New project 2\src\features\admin\AdminPortal.tsx`
- Admin console current source: `C:\Users\56252\Documents\New project 2\src\features\admin\AdminConsole.tsx`
- Admin APIs: `C:\Users\56252\Documents\New project 2\server\index.mjs`
- Model registry helpers: `C:\Users\56252\Documents\New project 2\server\registry\model-registry.mjs`

## Overview

Date: 2026-05-30  
Priority: P2  
Status: Completed

Improve admin model catalog and prompt operations so the public model picker stays reliable and non-technical admins can maintain it.

## Key Insights

- Admin stores model metadata, not credentials.
- Model capabilities drive public UI behavior.
- Current editing works, but there is little validation or bulk workflow.

## Requirements

- Add provider/model presets for OpenAI, Claude, Gemini, and OpenAI-compatible.
- Add capability templates:
  - Chat.
  - Vision chat.
  - Image generation.
  - TTS.
  - STT.
  - Video.
  - Embedding.
  - Tool calling.
- Validate duplicate ids, missing model names, invalid defaults.
- Import/export admin metadata as JSON.
- Add preview of public visible model list.
- Improve prompt preset editing and module filtering.

## Architecture

Keep admin metadata in existing JSON store first:

```text
AdminConsole
  Site settings
  Menu items
  Model catalog
    presets
    validation
    import/export
  Assistants
  Apps
  Prompt presets
```

No credential fields are added.

## Related Code Files

- Modify: `C:\Users\56252\Documents\New project 2\src\features\admin\AdminConsole.tsx`
  - If created in Phase 01, continue there.
- Create: `C:\Users\56252\Documents\New project 2\src\features\admin\modelCatalogPresets.ts`
  - Preset definitions and templates.
- Create: `C:\Users\56252\Documents\New project 2\src\features\admin\adminValidation.ts`
  - Client validation helpers.
- Modify: `C:\Users\56252\Documents\New project 2\src\api.ts`
  - Optional import/export wrappers if backend endpoints are added.
- Modify: `C:\Users\56252\Documents\New project 2\server\index.mjs`
  - Add metadata import/export endpoint guarded by admin auth if needed.
- Modify: `C:\Users\56252\Documents\New project 2\server\registry\model-registry.mjs`
  - Centralize model catalog normalization.
- Modify: `C:\Users\56252\Documents\New project 2\src\styles.css`
  - Admin table/card density, validation hints, preset panels.

## Implementation Steps

1. Add model preset definitions.
2. Add "add from preset" flow.
3. Add validation summary:
   - Duplicate id.
   - Missing vendor/model/label.
   - Capability/default mismatch.
   - No enabled chat model.
4. Add public preview section:
   - Models visible to public.
   - Grouped by capability.
5. Add JSON export:
   - models.
   - menu items.
   - assistants.
   - apps.
   - prompt presets.
6. Add JSON import:
   - validate first.
   - apply only after confirmation.
7. Improve prompt presets:
   - filter by module.
   - enable/disable faster.
   - duplicate preset.

## Todo List

- [x] Add model capability presets.
- [x] Add admin validation summary.
- [x] Add public model preview.
- [x] Add metadata import/export.
- [x] Improve prompt preset operations.
- [x] Verify admin auth guard.

## Success Criteria

- Admin can add common models quickly from presets.
- Invalid catalog state is visible before saving.
- Public model picker only sees enabled valid models.
- Admin can export and import metadata.
- No credential fields exist in admin model records.

## Risk Assessment

- Risk: Import can corrupt JSON data.
  - Mitigation: validate full payload before write and keep backup of prior data.
- Risk: Presets get stale.
  - Mitigation: presets are editable suggestions, not hardcoded truth.

## Security Considerations

- Import/export endpoints require admin auth.
- Import payload must reject unknown dangerous fields.
- Never include API Key/Base URL in model metadata export.

## Next Steps

After admin ops, run full QA and document deployment expectations.
