# Phase 04 - Public Model Picker

## Overview

Status: Planned  
Priority: P0  

前台改成“选厂商 + 选模型”。不再暴露 API URL / API Key 输入。用户在对话页直接选可用模型，后台负责分发到对应厂商接口。

## Related Files

- Modify: `C:\Users\56252\Documents\New project 2\src\features\chat\ChatModule.tsx`
- Modify: `C:\Users\56252\Documents\New project 2\src\features\generation\GenerationModule.tsx`
- Modify: `C:\Users\56252\Documents\New project 2\src\app\ModuleRouter.tsx`
- Modify: `C:\Users\56252\Documents\New project 2\src\App.tsx`
- Modify: `C:\Users\56252\Documents\New project 2\src\features\settings\UserSettingsModule.tsx`

## UI Changes

- Chat header:
  - provider selector
  - model selector
  - optional capability badge
- Generation pages:
  - model selector filtered by capability
  - provider shown as the source of the selected model
- Settings page:
  - remove raw API URL / API Key editing
  - keep only default provider/model preference if needed, or remove entirely

## Request Payload

```ts
type PublicRequest = {
  providerId: string;
  modelId: string;
  capability: "chat" | "image" | "tts" | "stt" | "embedding" | "toolCalling";
  prompt: string;
  attachments?: unknown[];
};
```

## Implementation Steps

1. Load provider + model catalog from bootstrap.
2. Build selector options from enabled models only.
3. Disable incompatible models per feature.
4. Persist only the last selected provider/model, not keys.
5. Update request flows to send provider/model identifiers.

## Success Criteria

- Public users can choose provider and model from admin-managed lists.
- No public API credential form remains.
- Switching model switches the endpoint path and request protocol on the server.

## Risk

- Existing user-side session config will become obsolete.
- Mitigation: migrate it into a default provider/model preference only, then retire it.
