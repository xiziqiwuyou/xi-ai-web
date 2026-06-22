# Phase 06 - Media Provider Templates and Polling

## Context Links

- Media jobs: `C:\Users\56252\Documents\New project 2\src\features\media`
- Generation module: `C:\Users\56252\Documents\New project 2\src\features\generation\GenerationModule.tsx`
- Model catalog registry: `C:\Users\56252\Documents\New project 2\server\registry\model-registry.mjs`
- OpenAI-compatible adapter: `C:\Users\56252\Documents\New project 2\server\providers\openai-compatible.mjs`
- Admin console: `C:\Users\56252\Documents\New project 2\src\features\admin\AdminConsole.tsx`

## Overview

Date: 2026-05-30  
Priority: P2  
Status: Completed

Make video/media providers configurable enough for real deployment: endpoint templates, status mappings, polling, and clear provider support states.

## Key Insights

- Video currently uses generic `endpointPath` and status path.
- Model catalog only stores vendor/model/capabilities/defaults.
- Different providers return task IDs and assets differently.

## Requirements

- Add optional media endpoint config per model.
- Support generation endpoint, status endpoint, ID path, asset path, status mapping.
- Add auto-polling with capped interval.
- Add cancel/remove local job.
- Show provider-specific setup hints in admin.
- Keep user credentials request-time only.

## Architecture

Extend model metadata:

```ts
type MediaEndpointConfig = {
  generatePath?: string;
  statusPath?: string;
  idJsonPath?: string;
  statusJsonPath?: string;
  assetJsonPath?: string;
  requestShape?: "openai-compatible" | "simple-json";
};
```

Server maps via safe JSON path allowlist:

```text
jsonPath: "data.0.url" / "id" / "status"
No arbitrary code.
```

## Related Code Files

- Modify: `C:\Users\56252\Documents\New project 2\src\types.ts`
  - Add optional `mediaConfig` on `ModelCatalogEntry`.
- Modify: `C:\Users\56252\Documents\New project 2\server\registry\model-registry.mjs`
  - Normalize media config.
- Modify: `C:\Users\56252\Documents\New project 2\src\features\admin\AdminConsole.tsx`
  - Add media config editor for video-capable models.
- Modify: `C:\Users\56252\Documents\New project 2\server\providers\openai-compatible.mjs`
  - Use model media config when present.
- Modify: `C:\Users\56252\Documents\New project 2\server\providers\types.mjs`
  - Add safe JSON path extraction helper.
- Modify: `C:\Users\56252\Documents\New project 2\src\features\media\MediaJobPanel.tsx`
  - Add auto-poll, cancel local job, retry.
- Modify: `C:\Users\56252\Documents\New project 2\src\features\media\mediaJobStorage.ts`
  - Store polling settings and failure reason.

## Implementation Steps

1. Add media config type and normalization.
2. Add admin editor only when model has `video` capability.
3. Add safe JSON path extraction:
   - dot segments only.
   - numeric array indexes only.
   - no eval.
4. Update generate video adapter:
   - Use configured generate path.
   - Extract provider job id using config.
5. Update status adapter:
   - Use configured status path.
   - Extract status/assets using config.
6. Add frontend auto-polling:
   - Off by default or explicit toggle.
   - Min interval 10 seconds.
   - Stop after completed/failed or max attempts.
7. Add local job controls:
   - remove.
   - retry refresh.
   - copy provider job id.

## Todo List

- [ ] Add media config schema.
- [ ] Add admin media config UI.
- [ ] Add safe JSON path helper.
- [ ] Use config in video generation/status.
- [ ] Add auto-polling and job controls.
- [ ] Document provider setup examples.

## Success Criteria

- Admin can configure a non-standard video provider without code changes.
- Video jobs auto-refresh safely.
- Completed assets are extracted into gallery.
- Failed jobs show provider message.
- No API URL/Key are stored in job records.

## Risk Assessment

- Risk: JSON path config becomes too flexible.
  - Mitigation: allow safe simple paths only.
- Risk: Polling can overload provider.
  - Mitigation: hard interval cap and max attempts.

## Security Considerations

- No arbitrary mapping expressions.
- No stored credentials.
- Redact provider error text.

## Next Steps

After media reliability, improve artifact editing and export quality.
