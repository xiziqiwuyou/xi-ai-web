# Phase 04 - 语音与画图适配

## Overview

Status: Planned  
Priority: P1  

把现有 `/api/generate/image` 和 `/api/generate/audio` 从 OpenAI-compatible endpoint 改成 adapter 分发。

## Related Files

- Modify: `C:\Users\56252\Documents\New project 2\server\providers\openai.mjs`
- Modify: `C:\Users\56252\Documents\New project 2\server\providers\anthropic.mjs`
- Modify: `C:\Users\56252\Documents\New project 2\server\providers\gemini.mjs`
- Modify: `C:\Users\56252\Documents\New project 2\server\index.mjs`
- Modify: `C:\Users\56252\Documents\New project 2\src\features\generation\GenerationModule.tsx`
- Modify: `C:\Users\56252\Documents\New project 2\src\features\settings\UserSettingsModule.tsx`

## Requirements

- Image generation:
  - OpenAI native.
  - Gemini native.
  - Claude disabled with clear UI message.
- Speech output:
  - OpenAI native.
  - Gemini native if configured with speech model.
  - Claude disabled.
- Speech input/transcription:
  - OpenAI transcription.
  - Gemini audio understanding.
  - Claude disabled.

## API Shape

```ts
generateImage({
  prompt,
  model,
  size,
  aspectRatio
}) => Promise<{ assets: Asset[]; text?: string; raw?: unknown }>

synthesizeSpeech({
  input,
  model,
  voice,
  format
}) => Promise<{ asset: Asset }>

transcribeAudio({
  file,
  model,
  language
}) => Promise<{ text: string }>
```

## UI Changes

- Settings page shows provider capability cards.
- Feature pages disable submit if selected provider lacks capability.
- Advanced settings exposes per-feature model override:
  - chat
  - image
  - speech
  - transcription
  - embedding

## Implementation Steps

1. Add `supportsCapability(provider, capability)`.
2. Replace direct `/images/generations` call with `adapter.generateImage`.
3. Replace direct `/audio/speech` call with `adapter.synthesizeSpeech`.
4. Add upload support for transcription if needed.
5. Return normalized `GenerationResult`.

## Success Criteria

- OpenAI image/audio still works.
- Gemini image/audio works when model supports it.
- Claude image/audio requests fail before vendor call with readable message.
- UI does not show false capability.

## Risk

- Model names for image/audio change often.
- Mitigation: keep model inputs editable and ship sane presets only.
