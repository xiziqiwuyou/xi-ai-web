# Phase 03 - Admin Model Catalog

## Overview

Status: Planned  
Priority: P0  

把后台从“只管 provider”升级成“管 provider + model catalog”。管理员在这里配置每个厂商暴露哪些模型、哪些能力、默认模型是什么。

## Related Files

- Modify: `C:\Users\56252\Documents\New project 2\src\features\admin\AdminDrawer.tsx`
- Modify: `C:\Users\56252\Documents\New project 2\src\features\admin\AdminPortal.tsx`
- Modify: `C:\Users\56252\Documents\New project 2\src\api.ts`
- Modify: `C:\Users\56252\Documents\New project 2\server\index.mjs`

## Admin UX

- Select provider kind.
- Set provider credentials.
- Enable or disable models.
- Assign capability tags to each model.
- Mark default model per capability:
  - chat
  - vision
  - image
  - tts
  - stt
  - embedding
- Keep a separate custom provider section for `openai-compatible`.

## Data Rules

- Provider-level defaults are inherited by models.
- Model-level overrides win.
- Public bootstrap exposes only enabled models.

## Implementation Steps

1. Add model editor section under each provider.
2. Add model CRUD or inline list editing.
3. Add capability tag chips to the editor.
4. Persist provider + model registry together.
5. Migrate current provider editor to the new structure.

## Success Criteria

- Admin can turn specific models on/off.
- Admin can choose which model powers chat/image/audio/embedding.
- Public UI only sees what admin enabled.

## Risk

- The existing admin drawer is dense.
- Mitigation: keep provider details and model catalog in separate collapsible blocks.
