# Phase 01 - Provider 类型与能力模型

## Overview

Status: Planned  
Priority: P0  

先扩展类型系统和配置结构。不要直接改调用逻辑。目标是让前后端能描述 OpenAI、Claude、Gemini、OpenAI-compatible 的差异。

## Related Files

- Modify: `C:\Users\56252\Documents\New project 2\src\types.ts`
- Modify: `C:\Users\56252\Documents\New project 2\src\features\settings\userProviderConfig.ts`
- Modify: `C:\Users\56252\Documents\New project 2\src\features\settings\UserSettingsModule.tsx`
- Modify: `C:\Users\56252\Documents\New project 2\server\index.mjs`

## Requirements

- Add provider kind:
  - `openai`
  - `anthropic`
  - `gemini`
  - `openai-compatible`
- Expand capabilities:
  - `chat`
  - `vision`
  - `image`
  - `tts`
  - `stt`
  - `embedding`
  - `fileSearch`
  - `toolCalling`
  - `streaming`
- Add model map:
  - `chatModel`
  - `visionModel`
  - `imageModel`
  - `ttsModel`
  - `sttModel`
  - `embeddingModel`
- Keep old `model` for migration only.

## Proposed Types

```ts
export type ProviderKind =
  | "openai"
  | "anthropic"
  | "gemini"
  | "openai-compatible";

export type ProviderCapability =
  | "chat"
  | "vision"
  | "image"
  | "tts"
  | "stt"
  | "embedding"
  | "fileSearch"
  | "toolCalling"
  | "streaming";

export type ProviderModelMap = {
  chat?: string;
  vision?: string;
  image?: string;
  tts?: string;
  stt?: string;
  embedding?: string;
};
```

## Provider Defaults

```ts
const providerPresets = {
  openai: {
    baseUrl: "https://api.openai.com/v1",
    models: {
      chat: "gpt-4.1-mini",
      image: "gpt-image-1",
      tts: "gpt-4o-mini-tts",
      stt: "gpt-4o-transcribe",
      embedding: "text-embedding-3-small"
    }
  },
  anthropic: {
    baseUrl: "https://api.anthropic.com/v1",
    models: { chat: "claude-sonnet-4-5" }
  },
  gemini: {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    models: {
      chat: "gemini-2.5-flash",
      image: "gemini-2.5-flash-image",
      embedding: "gemini-embedding-001"
    }
  }
};
```

## Implementation Steps

1. Add provider type aliases in `src/types.ts`.
2. Extend `UserProviderConfig`.
3. Extend server provider normalization.
4. Add config migration:
   - old `model` becomes `models.chat`.
   - old missing `providerKind` becomes `openai-compatible` if custom URL, else `openai`.
5. Add capability presets per provider.
6. Keep backwards compatibility for existing request payloads.

## Success Criteria

- Existing app still boots.
- Settings can represent provider kind and per-capability models.
- Old session config does not crash.
- Server can classify provider capability without calling vendor APIs.

## Security

- Do not server-persist public user API keys.
- Redact API keys in errors.
- Do not expose provider capability internals that include secrets.
