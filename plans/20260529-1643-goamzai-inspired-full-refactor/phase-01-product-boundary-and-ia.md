# Phase 01 - Product Boundary and IA

## Overview

Status: Completed  
Priority: P0

Define exactly which reference-system features map into this project, then update module IDs, menu defaults, and route boundaries.

## Requirements

- Keep public no-login BYOK flow.
- Preserve `/admin` as separate admin entrance.
- Add portal-like modules:
  - 对话
  - 绘画
  - 音频/音乐
  - 视频
  - PPT
  - 应用/智能体
  - 知识库/PDF
  - 思维导图
  - 画廊
  - 助手库
  - 设置
- Hide or mark disabled modules if backend capability is unavailable.
- Remove public-facing system/admin concepts from home UI.

## Related Files

- Modify: `C:\Users\56252\Documents\New project 2\src\types.ts`
- Modify: `C:\Users\56252\Documents\New project 2\src\app\moduleRegistry.tsx`
- Modify: `C:\Users\56252\Documents\New project 2\server\index.mjs`
- Modify: `C:\Users\56252\Documents\New project 2\data\app-data.json`

## Implementation Steps

1. Extend `ModuleId` with `ppt`, `mindmap`, `gallery`, `apps` if needed.
2. Decide whether `agents` and `apps` merge or separate:
   - Recommended: rename public surface to `apps`, keep internal `agents` generation endpoint.
3. Update default menu items.
4. Add module metadata: clean Chinese labels, descriptions, icons, capability hints.
5. Add `featureCatalog` metadata if menu alone is not enough:
   - module ID
   - required model capabilities
   - status: stable/beta/disabled
   - default prompt presets
6. Preserve old menu IDs during migration where possible.

## Success Criteria

- Public menu matches target product shape.
- No broken active module when old data exists.
- Admin can toggle each new module.
- No public login, package, payment, promotion entries.

## Risks

- Too many new modules can feel unfinished.
- Mitigation: ship PPT/mindmap/gallery as MVP workflows first.
