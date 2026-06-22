# Phase 03: Feature Module Shells

Date: 2026-05-22
Priority: P1
Status: planned

## Overview

Add module shells for requested menu items. Keep chat functional. Other modules get production-quality UI shells and API contracts, then provider-specific generation can follow.

## Modules

### 对话

Move existing chat into:
- `C:\Users\56252\Documents\New project 2\src\features\chat\ChatModule.tsx`
- `C:\Users\56252\Documents\New project 2\src\features\chat\ConversationList.tsx`
- `C:\Users\56252\Documents\New project 2\src\features\chat\MessageList.tsx`
- `C:\Users\56252\Documents\New project 2\src\features\chat\Composer.tsx`

### 画图

Create:
- `C:\Users\56252\Documents\New project 2\src\features\image\ImageModule.tsx`

MVP UI:
- Prompt input.
- Style selector.
- Size selector.
- Generate button.
- Gallery grid.

Backend placeholder:
- `POST /api/image/generate`
- Return `501 Not configured` until provider chosen.

### 音频

Create:
- `C:\Users\56252\Documents\New project 2\src\features\audio\AudioModule.tsx`

MVP UI:
- Text-to-speech panel.
- Voice/model selector.
- Audio output history placeholder.

Backend placeholder:
- `POST /api/audio/speech`

### 视频

Create:
- `C:\Users\56252\Documents\New project 2\src\features\video\VideoModule.tsx`

MVP UI:
- Prompt input.
- Duration/aspect controls.
- Task history placeholder.

Backend placeholder:
- `POST /api/video/generate`

### 智能体

Create:
- `C:\Users\56252\Documents\New project 2\src\features\agents\AgentsModule.tsx`

MVP UI:
- Agent cards.
- Tool capability tags.
- Enable/disable indicator.

Data:
- Start with metadata only. Do not implement tool runtime yet.

### 知识库

Create:
- `C:\Users\56252\Documents\New project 2\src\features\knowledge\KnowledgeModule.tsx`

MVP UI:
- Collection list.
- Upload drop zone placeholder.
- Document table placeholder.

Backend placeholder:
- `GET /api/knowledge/collections`
- `POST /api/knowledge/collections`

### 助手库

Move current assistant panel into:
- `C:\Users\56252\Documents\New project 2\src\features\assistants\AssistantLibraryModule.tsx`

Public or admin decision:
- Recommended: public view can select assistants.
- Editing assistants requires admin.

## Implementation Steps

1. Define `FeatureModule` metadata registry.
2. Extract Chat module first.
3. Add shells for image/audio/video/agents/knowledge/assistants.
4. Use menu settings to hide disabled modules.
5. Add backend placeholder endpoints for modules that need server calls.
6. Display clear "需要在后台配置供应商" state when a feature lacks provider config.

## Success Criteria

- Every left menu item opens a real screen.
- Chat remains fully functional.
- Non-chat modules do not pretend to generate content before provider support exists.
- Admin can disable each module.

## Risks

- Too many shells may dilute quality. Keep each module simple, polished, and honest.
- Provider contracts differ heavily for image/audio/video. Defer exact integrations until provider choices are known.
