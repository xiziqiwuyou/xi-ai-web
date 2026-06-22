# Phase 01 - Public BYOK Connection

## Overview

Status: Completed  
Priority: P0

把前台恢复成明确的 BYOK 模式。用户仍然需要填写 `baseUrl` 和 `apiKey`，后台不接管这些凭据。

## Related Files

- Modify: `C:\Users\56252\Documents\New project 2\src\features\settings\userProviderConfig.ts`
- Modify: `C:\Users\56252\Documents\New project 2\src\features\settings\UserSettingsModule.tsx`
- Modify: `C:\Users\56252\Documents\New project 2\src\App.tsx`
- Modify: `C:\Users\56252\Documents\New project 2\src\app\ModuleRouter.tsx`

## Requirements

- Public settings keeps:
  - API URL
  - API Key
  - optional last selected model/provider preference
- Public settings removes:
  - any assumption that backend stores user key
  - any wording about admin-managed credentials
- Session persistence remains browser-side only.

## Implementation Notes

```ts
type UserConnectionConfig = {
  baseUrl: string;
  apiKey: string;
  lastModelId?: string;
  lastProviderKind?: ProviderKind;
};
```

The public UI can still expose preset buttons for convenience, but those presets only fill `baseUrl` and model preference. They do not create backend credentials.

## Success Criteria

- 用户不登录也能继续配置自己的 URL / Key。
- 页面文案不再暗示后台会托管用户凭据。
- 现有 sessionStorage 配置仍可用。

## Risk

- Existing code currently mixes model choice into user connection state.
- Mitigation: split connection info from model choice in later phases.
