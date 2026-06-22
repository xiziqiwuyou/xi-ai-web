# Phase 03 - Provider Routing With User Connection

## Overview

Status: Completed  
Priority: P0

请求路由把两部分合起来：

- 用户提供的 `baseUrl + apiKey`
- 后台提供的 `vendor + model + capabilities`

## Related Files

- Modify: `C:\Users\56252\Documents\New project 2\server\providers\registry.mjs`
- Modify: `C:\Users\56252\Documents\New project 2\server\providers\openai.mjs`
- Modify: `C:\Users\56252\Documents\New project 2\server\providers\anthropic.mjs`
- Modify: `C:\Users\56252\Documents\New project 2\server\providers\gemini.mjs`
- Modify: `C:\Users\56252\Documents\New project 2\server\providers\openai-compatible.mjs`
- Modify: `C:\Users\56252\Documents\New project 2\server\index.mjs`

## Request Shape

```ts
type RoutedRequest = {
  connection: {
    baseUrl: string;
    apiKey: string;
  };
  modelId: string;
  capability: string;
  input: unknown;
};
```

## Rules

- The backend resolves `modelId` to a catalog entry.
- The catalog entry determines vendor kind and protocol.
- The user connection determines the actual target URL and authorization header.
- If model capability does not match, reject before any network call.

## Success Criteria

- Same public user connection can be used with different catalog models.
- Server never needs to persist user key.
- Provider-specific endpoint selection is automatic.
