# Phase 06 - 设置页、后台与验证

## Overview

Status: Planned  
Priority: P0 for settings, P1 for full QA  

把多厂商能力暴露到普通设置页，同时保持后台管理员入口独立。

## Related Files

- Modify: `C:\Users\56252\Documents\New project 2\src\features\settings\UserSettingsModule.tsx`
- Modify: `C:\Users\56252\Documents\New project 2\src\features\settings\userProviderConfig.ts`
- Modify: `C:\Users\56252\Documents\New project 2\src\features\generation\GenerationModule.tsx`
- Modify: `C:\Users\56252\Documents\New project 2\src\features\chat\ChatModule.tsx`
- Modify: `C:\Users\56252\Documents\New project 2\src\features\admin\AdminPortal.tsx`
- Modify: `C:\Users\56252\Documents\New project 2\server\index.mjs`

## Settings UX

普通用户设置页新增：

- Provider selector:
  - OpenAI
  - Claude
  - Gemini
  - OpenAI-compatible
- API URL auto-fill by provider.
- API Key input.
- Default chat model.
- Advanced model overrides.
- Capability badges:
  - 对话
  - 多模态
  - 工具调用
  - 画图
  - 语音
  - 向量

Do not show admin/system settings on public page.

## Admin UX

后台 can manage:

- menu visibility.
- provider kinds allowed on public settings page.
- default provider kind.
- max upload size.
- enabled tools.

Admin does not need to store public user API keys.

## Validation Plan

### Static

```powershell
npm run check
npm run build
```

### Unit-like Adapter Tests

Use Node built-in `node:test`, no extra dependency in MVP.

Test:

- OpenAI request mapping.
- Anthropic request mapping.
- Gemini request mapping.
- Tool call normalization.
- Capability rejection.
- API key redaction.

### Manual Smoke

For each provider:

1. Set provider kind + key + chat model.
2. Send text chat.
3. Send image input if supported.
4. Trigger one tool call.
5. Try image generation.
6. Try speech generation.
7. Try knowledge retrieval.

Expected:

- Supported features work.
- Unsupported features show readable UI message.
- No API key appears in logs, response errors, or data files.

## Rollout Order

1. OpenAI native adapter.
2. OpenAI-compatible regression check.
3. Anthropic chat/vision/tool adapter.
4. Gemini chat/vision/tool adapter.
5. Image/audio.
6. Embeddings/RAG.
7. UI polish and capability badges.

## Success Criteria

- Settings can switch between OpenAI, Claude, Gemini.
- Chat works for all three.
- Tool calling works for all three.
- Image/audio respects capability matrix.
- RAG works with OpenAI/Gemini embeddings and Claude chat.
- Public page still has no admin entry.

## Risk

- Official APIs evolve quickly.
- Mitigation:
  - adapter modules isolated.
  - provider presets editable.
  - tests assert normalized contracts, not every vendor field.
