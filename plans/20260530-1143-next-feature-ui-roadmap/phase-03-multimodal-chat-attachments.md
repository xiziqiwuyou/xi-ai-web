# Phase 03 - Multimodal Chat Attachments

## Context Links

- Chat UI: `C:\Users\56252\Documents\New project 2\src\features\chat\ChatModule.tsx`
- API types: `C:\Users\56252\Documents\New project 2\src\types.ts`
- Provider adapters: `C:\Users\56252\Documents\New project 2\server\providers`
- Tool registry: `C:\Users\56252\Documents\New project 2\server\tools\registry.mjs`

## Overview

Date: 2026-05-30  
Priority: P1  
Status: Completed

Make chat attachment, image, and microphone controls functional. Support vision-capable image input, lightweight file context, and provider-specific payload mapping.

## Key Insights

- Chat toolbar already has attachment/image/mic buttons.
- `ModelCapability` includes `vision`, `fileSearch`, and `toolCalling`.
- Provider adapters differ significantly for multimodal payload formats.

## Requirements

- Add attachment tray to composer.
- Support image upload for vision models.
- Support text-like file upload as context attachment.
- Show previews and remove controls.
- Disable or explain unsupported attachment types for current model.
- Preserve streaming text response.
- Keep public credentials request-time only.

## Architecture

Normalize attachments before provider mapping:

```ts
type ChatAttachment = {
  id: string;
  kind: "image" | "text" | "audio";
  name: string;
  mimeType: string;
  size: number;
  dataUrl?: string;
  text?: string;
};
```

Frontend sends normalized attachments with `ChatStreamPayload`. Server validates size/count and maps:

- OpenAI: Responses input content parts.
- Claude: Messages content blocks.
- Gemini: contents parts with inline data or text.
- OpenAI-compatible: support image only when compatible endpoint accepts content parts; otherwise reject clearly.

## Related Code Files

- Modify: `C:\Users\56252\Documents\New project 2\src\types.ts`
  - Add `ChatAttachment` and extend `ChatStreamPayload`.
- Modify: `C:\Users\56252\Documents\New project 2\src\features\chat\ChatModule.tsx`
  - Add attachment tray, file picker, previews, validation, clear/remove.
- Create: `C:\Users\56252\Documents\New project 2\src\features\chat\attachmentUtils.ts`
  - MIME validation, file-to-dataURL, file-to-text.
- Modify: `C:\Users\56252\Documents\New project 2\src\api.ts`
  - Include attachments in chat stream payload.
- Modify: `C:\Users\56252\Documents\New project 2\server\index.mjs`
  - Validate attachments and pass them to adapter.
- Modify: `C:\Users\56252\Documents\New project 2\server\providers\types.mjs`
  - Add normalized attachment helpers.
- Modify: `C:\Users\56252\Documents\New project 2\server\providers\openai.mjs`
  - Map image/text attachments.
- Modify: `C:\Users\56252\Documents\New project 2\server\providers\anthropic.mjs`
  - Map image/text attachments.
- Modify: `C:\Users\56252\Documents\New project 2\server\providers\gemini.mjs`
  - Map image/text attachments.
- Modify: `C:\Users\56252\Documents\New project 2\server\providers\openai-compatible.mjs`
  - Add guarded support or explicit error.
- Modify: `C:\Users\56252\Documents\New project 2\src\styles.css`
  - Composer tray, thumbnails, file chips, error state.

## Implementation Steps

1. Add attachment types and constraints:
   - Max files.
   - Max image size.
   - Max text chars.
2. Implement frontend file selection:
   - Paperclip accepts text/PDF later.
   - Image button accepts images.
   - Mic remains disabled or moves to Phase 05 STT.
3. Render attachment tray above composer toolbar.
4. Gate by selected model:
   - Image requires `vision`.
   - File context requires `chat` and extracted text.
5. Extend chat payload and stream call.
6. Validate attachments server-side.
7. Map attachments in each provider adapter.
8. Add error messages for unsupported provider/model combination.
9. Add tests/smokes:
   - Text-only still works.
   - Vision model with image builds valid payload.
   - Non-vision model blocks image before request.

## Todo List

- [x] Add attachment model and validation.
- [x] Build composer attachment tray.
- [x] Add image/file upload flows.
- [x] Map attachments for OpenAI/Claude/Gemini.
- [x] Add clear unsupported-state copy.
- [x] Verify streaming still works.

## Success Criteria

- Chat sends text-only messages unchanged.
- Chat can attach an image when selected model supports `vision`.
- Chat can attach text-like file context.
- Unsupported attachments are blocked with useful UI feedback.
- API Key is not persisted server-side.
- `npm run check` and `npm run build` pass.

## Risk Assessment

- Risk: Base64 images create huge requests.
  - Mitigation: size cap and client-side preview compression later.
- Risk: Provider payload mismatches break streaming.
  - Mitigation: add adapter-specific guarded paths and test with small fixtures.

## Security Considerations

- Enforce file count and size on client and server.
- Strip file names to safe display names.
- Do not write attachments to `data/app-data.json`.
- Avoid logging request bodies.

## Next Steps

After attachments, build mindmap visual rendering for richer productivity output.
