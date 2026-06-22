# Phase 05 - Media Job Experience

## Context Links

- Media UI: `C:\Users\56252\Documents\New project 2\src\features\generation\GenerationModule.tsx`
- Result panel: `C:\Users\56252\Documents\New project 2\src\components\workbench\ResultPanel.tsx`
- OpenAI-compatible media adapter: `C:\Users\56252\Documents\New project 2\server\providers\openai-compatible.mjs`
- OpenAI adapter: `C:\Users\56252\Documents\New project 2\server\providers\openai.mjs`

## Overview

Date: 2026-05-30  
Priority: P2  
Status: Completed

Make media generation feel complete: video task polling/history, richer audio playback/download, and optional speech-to-text input.

## Key Insights

- Video generation currently returns `submitted` or `completed`, but no follow-up status flow.
- Audio TTS works as a generated asset, while music mode is disabled.
- Provider status endpoints differ. Do not pretend there is one universal format.

## Requirements

- Persist submitted video jobs in browser-local job history.
- Poll status through request-time user connection.
- Allow manual refresh.
- Show progress/status labels.
- Save completed assets to gallery.
- Add audio download controls.
- Optional: add STT mode for uploaded audio if a model with `stt` is enabled.

## Architecture

Use local job records:

```ts
type MediaJob = {
  id: string;
  module: "video" | "audio";
  providerVendor: string;
  modelId: string;
  endpointPath: string;
  providerJobId?: string;
  status: "submitted" | "processing" | "completed" | "failed";
  prompt: string;
  createdAt: string;
  updatedAt: string;
};
```

Server adds adapter status call:

```text
POST /api/media/video/status
  connection
  modelId
  endpointPath
  providerJobId
```

The endpoint does not persist credentials or job data.

## Related Code Files

- Create: `C:\Users\56252\Documents\New project 2\src\features\media\mediaJobStorage.ts`
- Create: `C:\Users\56252\Documents\New project 2\src\features\media\MediaJobPanel.tsx`
- Modify: `C:\Users\56252\Documents\New project 2\src\features\generation\GenerationModule.tsx`
  - Add video job tracking and audio actions.
- Modify: `C:\Users\56252\Documents\New project 2\src\api.ts`
  - Add media status endpoint wrapper.
- Modify: `C:\Users\56252\Documents\New project 2\src\types.ts`
  - Add media job/status types.
- Modify: `C:\Users\56252\Documents\New project 2\server\index.mjs`
  - Add status endpoint and validation.
- Modify: `C:\Users\56252\Documents\New project 2\server\providers\types.mjs`
  - Add optional `getVideoStatus` adapter contract.
- Modify: `C:\Users\56252\Documents\New project 2\server\providers\openai-compatible.mjs`
  - Implement generic status path when configured.
- Modify: `C:\Users\56252\Documents\New project 2\src\components\workbench\AssetGallery.tsx`
  - Improve download and metadata actions for audio/video.
- Modify: `C:\Users\56252\Documents\New project 2\src\styles.css`
  - Job timeline, status chips, media player polish.

## Implementation Steps

1. Define media job type and local storage.
2. When video returns `submitted`, create local job record.
3. Add job panel to video page:
   - Current job.
   - Recent jobs.
   - Refresh button.
4. Add status endpoint:
   - Adapter-specific.
   - Explicit unsupported error.
5. Update job result when completed or failed.
6. On completed video, add asset to gallery.
7. Add audio controls:
   - Download asset.
   - Copy asset URL if remote.
8. Optional STT:
   - Add mode switch TTS/STT.
   - Upload audio file.
   - Use `stt` capable models.

## Todo List

- [x] Add local media job storage.
- [x] Add video status endpoint contract.
- [x] Add video job panel and polling.
- [x] Add audio asset download actions.
- [ ] Add optional STT mode if scope allows.
- [x] Verify unsupported providers fail clearly.

## Success Criteria

- Submitted video jobs stay visible after refresh.
- User can refresh/poll video task status.
- Completed video appears in result and gallery.
- Audio results can be played and downloaded.
- Unsupported status endpoints show clear guidance.
- Credentials remain request-time only.

## Risk Assessment

- Risk: Provider status APIs differ too much.
  - Mitigation: support configurable status path for OpenAI-compatible first.
- Risk: Polling with expired session credentials fails.
  - Mitigation: reopen API modal and let user retry.

## Security Considerations

- Do not persist API Key in media jobs.
- Store only model id, endpoint path, provider job id, prompt, and status.
- Cap polling interval to avoid hammering provider APIs.

## Next Steps

After media jobs, make gallery strong enough to manage generated assets.
