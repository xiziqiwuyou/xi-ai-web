# Phase 05 - Media, Tools, Retrieval

## Overview

Status: Planned  
Priority: P1  

把画图、语音、多模态、工具调用、向量检索接到厂商能力矩阵里。每个能力都按 provider/model 能力标签路由，不再靠一个通用字符串模型硬顶。

## Related Files

- Modify: `C:\Users\56252\Documents\New project 2\server\providers\*.mjs`
- Modify: `C:\Users\56252\Documents\New project 2\server\index.mjs`
- Modify: `C:\Users\56252\Documents\New project 2\src\features\generation\GenerationModule.tsx`
- Modify: `C:\Users\56252\Documents\New project 2\src\features\chat\ChatModule.tsx`

## Capability Matrix

- OpenAI:
  - chat
  - vision
  - image
  - tts
  - stt
  - embeddings
  - file search
  - tools
- Claude:
  - chat
  - vision
  - tools
- Gemini:
  - chat
  - vision
  - image
  - tts/stt where supported
  - embeddings
  - semantic retrieval
  - tools

## Implementation Steps

1. Add capability checks to selectors.
2. Add backend tool loop.
3. Add embedding adapter.
4. Add retrieval store.
5. Route media features to the matching provider/model.
6. Reject unsupported combinations before network calls.

## Success Criteria

- Chat can use different vendors and models.
- Image/audio only show supported provider/model options.
- Tool calling works through the server loop.
- Vector retrieval uses backend-managed embedding models.
