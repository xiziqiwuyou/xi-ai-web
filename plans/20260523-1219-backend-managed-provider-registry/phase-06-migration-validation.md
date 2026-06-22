# Phase 06 - Migration and Validation

## Overview

Status: Planned  
Priority: P0  

最后做迁移和回归。确保旧数据可读，旧 public API 配置不会把系统搞坏，新的 provider/model 路由在实际请求里能跑通。

## Validation

- `npm run check`
- `npm run build`
- `GET /api/public/bootstrap`
- `GET /api/admin/bootstrap`
- 选择 OpenAI / Claude / Gemini 各自跑一次 chat
- 选一个 image model 跑一次画图
- 选一个 audio model 跑一次语音
- 选一个 embedding model 跑一次知识库检索

## Migration Rules

- Old provider records become registry entries.
- Old `defaultModel` becomes chat model default.
- Old `capabilities` become model capability tags.
- Public API credential fields get removed or ignored.

## Security Checks

- No API keys in public payloads.
- No keys in console logs.
- No keys in local/session storage.
- Unsupported capabilities must fail with a clear message.

## Success Criteria

- Old data migrates cleanly.
- Public page only exposes provider/model choices.
- Backend is the source of truth for provider credentials and model lists.
