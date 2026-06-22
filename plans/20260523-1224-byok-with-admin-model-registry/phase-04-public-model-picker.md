# Phase 04 - Public Model Picker

## Overview

Status: Completed  
Priority: P0

前台模型选择来自后台模型目录，但用户仍然自己输入 URL / Key。模型项需要显示厂商标签，帮助用户知道这个模型走哪家协议。

## Related Files

- Modify: `C:\Users\56252\Documents\New project 2\src\features\chat\ChatModule.tsx`
- Modify: `C:\Users\56252\Documents\New project 2\src\features\generation\GenerationModule.tsx`
- Modify: `C:\Users\56252\Documents\New project 2\src\app\ModuleRouter.tsx`
- Modify: `C:\Users\56252\Documents\New project 2\src\features\settings\UserSettingsModule.tsx`

## UI Behavior

- Chat page shows:
  - current connection status
  - model selector from admin catalog
  - vendor badge on each model
- Generation pages show:
  - only models allowed for that capability
  - vendor badge
  - unsupported entries hidden or disabled

## Success Criteria

- 用户输入自己的 URL / Key。
- 用户在前台只选模型，不用登录。
- 选择模型时能看出它属于哪家厂商。
- 选中后请求会走对应端点协议。
