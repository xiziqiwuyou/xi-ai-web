# Phase 04: Module Empty States

Status: planned
Priority: P1

## Goal

Show requested module capability clearly without creating a permanent manual-like sidebar.

## Public Empty State Copy

Use concise cards:
- 画图: `文生图、风格模板、作品瀑布流`
- 音频: `语音合成、语音识别、音色库`
- 视频: `文生视频、任务队列、成片管理`
- 智能体: `工具调用、自动任务、工作流编排`
- 知识库: `文档上传、检索增强、资料问答`
- 助手库: `角色提示词、场景模板、团队共享`

Rules:
- Do not show all feature descriptions at once in a global sidebar.
- Show only the active module's short description.
- Use actions like `新建任务`, `上传文档`, `创建智能体` only when the workflow exists.

## Files

Modify:
- `src/app/ModuleRouter.tsx`
- `src/app/moduleRegistry.tsx`
- `src/styles.css`

## Success Criteria

- Modules feel complete enough.
- UI does not read like documentation.
- Disabled modules are cleanly hidden or marked.
