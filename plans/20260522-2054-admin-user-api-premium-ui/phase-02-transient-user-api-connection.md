# Phase 02: Transient User API Connection

Priority: high
Status: planned

## Overview

Let normal users use the app without registration or admin setup by entering their own OpenAI-compatible API URL, API key, and model. The server proxies calls, but does not persist the key.

## Requirements

- User can provide:
  - `baseUrl`
  - `apiKey`
  - `model`
  - optional display name
- No persistence to `data/app-data.json`.
- No admin login required for public chat.
- Server validates and normalizes `baseUrl`.
- Server redacts transient API key from errors.
- Existing admin provider flow can remain, but public chat must not depend on it.

## Related Code Files

- Modify: `C:\Users\56252\Documents\New project 2\src\types.ts`
- Modify: `C:\Users\56252\Documents\New project 2\src\api.ts`
- Modify: `C:\Users\56252\Documents\New project 2\src\features\chat\ChatModule.tsx`
- Modify: `C:\Users\56252\Documents\New project 2\server\index.mjs`

## Type Design

Add a transient provider type:

```ts
export type UserProviderConfig = {
  providerName?: string;
  baseUrl: string;
  apiKey: string;
  model: string;
};

export type ChatStreamPayload = {
  conversationId?: string;
  assistantId: string;
  model: string;
  temperature: number;
  content: string;
  providerId?: string;
  transientProvider?: UserProviderConfig;
};
```

Server rule:

- If `transientProvider` exists, use it.
- Else use `providerId`.
- If neither exists, return `400`.

## Server Design

Add:

```js
function transientProviderFromBody(body) {
  const config = body?.transientProvider;
  if (!config) return null;
  return {
    id: "user-direct",
    name: String(config.providerName || "User Direct").trim(),
    kind: "openai-compatible",
    baseUrl: normalizeBaseUrl(config.baseUrl),
    apiKey: String(config.apiKey || "").trim(),
    defaultModel: String(config.model || "").trim(),
    modelOptions: [String(config.model || "").trim()],
    capabilities: ["chat"],
    enabled: true,
    transient: true
  };
}
```

Do not call `saveData()` with transient provider data.

## Frontend Design

Create a compact public connection component inside chat UX:

- Label should feel user-facing: `模型接入`
- Fields:
  - URL
  - Key
  - Model
- Keep it as a popover/drawer or compact panel, not a full admin form.
- Show connected state with provider/model chip.
- Do not show "后台", "管理员", "系统设置", or "菜单开关" in this public flow.

## Success Criteria

- A user can send a chat request with only URL/key/model.
- `data/app-data.json` remains unchanged except for conversation messages.
- Error messages never include the API key.
- Build and type check pass.

## Security Considerations

- Do not log request body for `/api/chat/stream`.
- Redact transient key in thrown provider errors.
- Limit JSON body remains small (`4mb` current setting is OK).
- Validate `http://` and `https://`; consider warning for non-local `http://` in production.

