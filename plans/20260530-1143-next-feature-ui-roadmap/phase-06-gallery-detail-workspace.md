# Phase 06 - Gallery Detail Workspace

## Context Links

- Gallery UI: `C:\Users\56252\Documents\New project 2\src\features\gallery\GalleryModule.tsx`
- Gallery storage: `C:\Users\56252\Documents\New project 2\src\features\gallery\galleryStorage.ts`
- Asset renderer: `C:\Users\56252\Documents\New project 2\src\components\workbench\AssetGallery.tsx`

## Overview

Date: 2026-05-30  
Priority: P2  
Status: Completed

Turn the local gallery into an actual asset workspace: search, detail drawer, favorites, batch actions, and replay prompts.

## Key Insights

- Gallery already strips raw responses and caps localStorage payload.
- Current grid is useful but shallow.
- Generated results are browser-local, matching BYOK privacy.

## Requirements

- Search by title, prompt, module, model, text preview.
- Filter by module and status.
- Favorite/unfavorite items.
- Detail drawer or modal with full prompt/result/assets.
- Copy prompt.
- Reuse prompt in original module.
- Batch export selected items.
- Batch delete selected items.
- Keep local-only privacy copy.

## Architecture

Extend gallery item metadata:

```ts
type GalleryItem = GenerationResult & {
  sourceModule: ModuleId;
  prompt: string;
  modelId: string;
  favorite?: boolean;
  tags?: string[];
};
```

Use existing local storage with migration defaults.

## Related Code Files

- Modify: `C:\Users\56252\Documents\New project 2\src\types.ts`
  - Add optional gallery metadata.
- Modify: `C:\Users\56252\Documents\New project 2\src\features\gallery\galleryStorage.ts`
  - Preserve favorite/tags and migrate old records.
- Modify: `C:\Users\56252\Documents\New project 2\src\features\gallery\GalleryModule.tsx`
  - Search, detail, selection, favorite, replay.
- Modify: `C:\Users\56252\Documents\New project 2\src\App.tsx`
  - Add update/favorite callbacks if state remains top-level.
- Modify: `C:\Users\56252\Documents\New project 2\src\components\workbench\AssetGallery.tsx`
  - Add download/open actions.
- Modify: `C:\Users\56252\Documents\New project 2\src\styles.css`
  - Gallery toolbar, detail drawer, selected states.

## Implementation Steps

1. Add gallery migration fields.
2. Add toolbar:
   - Search input.
   - Module filter.
   - Favorites filter.
   - Selection mode.
3. Add card actions:
   - Favorite.
   - Open detail.
   - Reuse prompt.
4. Add detail drawer:
   - Full prompt.
   - Full text.
   - Assets.
   - Metadata.
   - Export/delete.
5. Add batch actions:
   - Export selected Markdown bundle.
   - Delete selected.
6. Add empty states for search/filter.
7. Validate localStorage size fallback still works.

## Todo List

- [x] Add gallery search and filters.
- [x] Add favorites.
- [x] Add detail drawer.
- [x] Add batch export/delete.
- [x] Add replay prompt flow.
- [x] Verify storage limits and migration.

## Success Criteria

- User can quickly find previous results.
- User can favorite important assets.
- User can inspect full result without leaving gallery.
- User can export one or multiple records.
- User can return to original module with prompt context.
- No server persistence of gallery items.

## Risk Assessment

- Risk: More gallery metadata exceeds localStorage cap.
  - Mitigation: keep caps and drop oldest items first.
- Risk: Replay prompt needs module-specific draft state.
  - Mitigation: start by navigating to module and copying prompt to clipboard or route state.

## Security Considerations

- Sanitize stored text lengths.
- Never store raw provider response.
- Keep asset data URL limits.

## Next Steps

After gallery, improve admin operations for model and prompt management.
