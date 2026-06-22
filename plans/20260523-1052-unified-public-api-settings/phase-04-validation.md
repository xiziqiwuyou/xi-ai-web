# Phase 04 - 验证、兼容与安全检查

## Overview

日期：2026-05-23  
状态：Planned  
优先级：P0  

验证菜单、设置页、共享配置、请求流和安全边界。确保公共首页没有管理员设置入口，普通设置页只用于用户自己的模型连接。

## Key Insights

- 旧 `data/app-data.json` 需要通过 `normalizeData()` 获得新增设置菜单。
- 现有后台菜单开关应该可以控制 `settings` 菜单。
- 用户 API Key 不能出现在服务端持久化文件。
- 编码问题已存在于部分源码显示中，改动时应尽量使用 UTF-8 正常中文，避免继续扩大乱码范围。

## Requirements

- TypeScript 编译通过。
- Vite 构建通过。
- 公共 bootstrap 返回 `settings` 菜单项。
- 浏览器中可从左侧进入设置。
- 设置后可完成至少一次聊天请求流程。
- 画图/音频/视频/智能体/知识库请求能使用同一配置构造 payload。
- `/admin` 仍可打开后台。

## Related Code Files

- Validate: `C:\Users\56252\Documents\New project 2\src\App.tsx`
- Validate: `C:\Users\56252\Documents\New project 2\src\app\LeftNav.tsx`
- Validate: `C:\Users\56252\Documents\New project 2\src\app\ModuleRouter.tsx`
- Validate: `C:\Users\56252\Documents\New project 2\src\features\settings\UserSettingsModule.tsx`
- Validate: `C:\Users\56252\Documents\New project 2\src\features\chat\ChatModule.tsx`
- Validate: `C:\Users\56252\Documents\New project 2\src\features\generation\GenerationModule.tsx`
- Validate: `C:\Users\56252\Documents\New project 2\server\index.mjs`
- Check: `C:\Users\56252\Documents\New project 2\data\app-data.json`

## Implementation Steps

1. Static checks:

```powershell
npm run check
npm run build
```

2. API bootstrap check:

```powershell
Invoke-RestMethod http://localhost:8787/api/public/bootstrap
```

Expected:

```json
{
  "menuItems": [
    { "id": "settings", "label": "设置", "enabled": true, "visible": true }
  ]
}
```

3. Security grep:

```powershell
rg -n "sk-|apiKey|API Key" data server src
```

Expected:

- Source code may contain field names and labels.
- `data/app-data.json` must not contain user-entered browser key.

4. Browser smoke:

- Open `http://localhost:8787/`.
- Click left nav “设置”.
- Fill API URL, API Key, model.
- Navigate to “对话”.
- Send a test prompt.
- Navigate to “画图”.
- Confirm no duplicate API Key form appears.
- Submit a test generation prompt if using a compatible endpoint.
- Open `http://localhost:8787/admin`.
- Confirm admin still requires/administers separately.

5. Menu admin smoke:

- In `/admin`, hide or disable “设置”.
- Refresh public homepage.
- Confirm “设置” follows menu visibility/enabled state.

## Todo List

- [ ] Run static checks.
- [ ] Run production build.
- [ ] Inspect public bootstrap.
- [ ] Smoke test public settings navigation.
- [ ] Smoke test chat request flow.
- [ ] Smoke test generation request payload flow.
- [ ] Confirm API Key not persisted to server data.
- [ ] Confirm `/admin` still isolated.

## Success Criteria

- No TypeScript/build errors.
- Left nav “设置” works.
- Unified config is consumed by all request flows.
- Public page has no “系统设置” or admin menu entry.
- User API Key stays browser-side except during actual proxy request.

## Risk Assessment

- Risk: Admin menu editor does not expect `settings`.
  - Mitigation: Since menu is data-driven, verify editor list after normalize. If needed, update admin labels/meta only.
- Risk: Generation endpoints differ by provider.
  - Mitigation: Keep endpoint override for video and existing options; this plan only changes provider config source.

## Security Considerations

- No server persistence for user-provided API Key.
- No localStorage by default.
- No logs containing request body with API Key.
- Password input masks Key on screen.

## Next Steps

After this phase, optional enhancements:

- Add “测试连接” button.
- Add explicit “记住本机” checkbox using `localStorage`.
- Add per-module model override only if users really need different models for image/audio/video.
