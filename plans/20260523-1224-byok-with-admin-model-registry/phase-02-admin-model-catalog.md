# Phase 02 - Admin Model Catalog

## Overview

Status: Completed  
Priority: P0

后台只维护模型目录，不保存用户密钥。管理员管理的是厂商、模型、能力、默认项和启用状态。

## Related Files

- Modify: `C:\Users\56252\Documents\New project 2\src\features\admin\AdminDrawer.tsx`
- Modify: `C:\Users\56252\Documents\New project 2\src\features\admin\AdminPortal.tsx`
- Modify: `C:\Users\56252\Documents\New project 2\src\types.ts`
- Modify: `C:\Users\56252\Documents\New project 2\server\index.mjs`
- Create: `C:\Users\56252\Documents\New project 2\server\registry\model-registry.mjs`

## Catalog Schema

```ts
type ModelCatalogEntry = {
  id: string;
  vendor: "openai" | "anthropic" | "gemini" | "openai-compatible";
  model: string;
  label: string;
  capabilities: Array<"chat" | "vision" | "image" | "tts" | "stt" | "embedding" | "toolCalling" | "streaming">;
  defaultFor?: Array<"chat" | "image" | "tts" | "stt" | "embedding">;
  enabled: boolean;
};
```

## Admin Responsibilities

- Add/edit/remove model entries.
- Tag each model with capabilities.
- Mark defaults per capability.
- Toggle enabled state.
- Group models by vendor.

## Explicit Non-Goals

- Admin does not save public user URL/key.
- Admin does not act as a secret vault for the user.
- Admin does not own the public session connection.

## Success Criteria

- Admin can maintain a clean vendor/model catalog.
- Backend bootstrap exposes catalog metadata to public UI.
- No secret fields appear in admin model records.
