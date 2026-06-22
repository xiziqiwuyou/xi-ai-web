# Phase 04 - Audio STT and Voice Input

## Context Links

- Chat composer: `C:\Users\56252\Documents\New project 2\src\features\chat\ChatModule.tsx`
- Audio generation: `C:\Users\56252\Documents\New project 2\src\features\generation\GenerationModule.tsx`
- Provider adapters: `C:\Users\56252\Documents\New project 2\server\providers`
- Server generation route: `C:\Users\56252\Documents\New project 2\server\index.mjs`
- Model catalog types: `C:\Users\56252\Documents\New project 2\src\types.ts`

## Overview

Date: 2026-05-30  
Priority: P1  
Status: Completed

Complete audio by adding speech-to-text upload and optional chat microphone input, while keeping request-time BYOK credentials.

## Key Insights

- TTS exists.
- STT capability exists in model catalog types.
- Chat microphone button is currently disabled.
- Express JSON body limit is not suitable for large audio base64 payloads.

## Requirements

- Audio module mode switch: TTS / STT.
- Upload audio file for transcription.
- Chat microphone records short audio and inserts transcript into composer.
- Server adapter contract supports `transcribeAudio`.
- OpenAI and OpenAI-compatible support first.
- Gemini/Claude show clear unsupported messages unless configured.

## Architecture

Use multipart upload for audio:

```text
POST /api/audio/transcribe
  multipart/form-data:
    connection JSON
    modelId
    file

Adapter.transcribeAudio({ provider, model, fileBuffer, mimeType })
```

Browser:

```text
AudioModule STT -> upload -> transcript result -> gallery item
Chat mic -> MediaRecorder -> transcribe -> append text
```

## Related Code Files

- Modify: `C:\Users\56252\Documents\New project 2\package.json`
  - Add multipart dependency only if needed.
- Modify: `C:\Users\56252\Documents\New project 2\server\index.mjs`
  - Add `/api/audio/transcribe`.
- Modify: `C:\Users\56252\Documents\New project 2\server\providers\types.mjs`
  - Add `transcribeAudio` contract helpers.
- Modify: `C:\Users\56252\Documents\New project 2\server\providers\openai.mjs`
  - Implement audio transcription endpoint.
- Modify: `C:\Users\56252\Documents\New project 2\server\providers\openai-compatible.mjs`
  - Implement compatible transcription endpoint.
- Modify: `C:\Users\56252\Documents\New project 2\src\features\generation\GenerationModule.tsx`
  - Add STT mode.
- Modify: `C:\Users\56252\Documents\New project 2\src\features\chat\ChatModule.tsx`
  - Enable mic recording/transcription.
- Modify: `C:\Users\56252\Documents\New project 2\src\api.ts`
  - Add multipart transcribe helper.

## Implementation Steps

1. Add audio file constraints:
   - Max 25MB.
   - Accepted mimes: wav, mp3, m4a, webm, ogg.
2. Add server multipart parser.
3. Add adapter method:
   - OpenAI: `/audio/transcriptions`.
   - OpenAI-compatible: configurable same path.
4. Add `api.transcribeAudio`.
5. Update audio module:
   - TTS existing path.
   - STT upload path.
   - Transcript result panel.
6. Update chat mic:
   - Start/stop recording.
   - Send webm to STT endpoint.
   - Insert transcript into textarea.
7. Add clear unsupported UI for missing `stt` models.

## Todo List

- [ ] Add transcription endpoint.
- [ ] Add adapter support.
- [ ] Add Audio STT UI.
- [ ] Enable chat microphone.
- [ ] Add result/gallery flow.
- [ ] Validate file size and unsupported providers.

## Success Criteria

- User can upload audio and receive transcript.
- User can record short voice in chat and insert transcript.
- TTS keeps working.
- Unsupported STT models are blocked before request.
- API URL/Key are not stored server-side.

## Risk Assessment

- Risk: Multipart dependency adds complexity.
  - Mitigation: isolate upload route and keep JSON APIs unchanged.
- Risk: Browser recording support varies.
  - Mitigation: show upload fallback.

## Security Considerations

- Enforce upload size limits on server.
- Do not write audio files to disk.
- Do not log request bodies.

## Next Steps

After STT, expand knowledge storage and PDF support.
