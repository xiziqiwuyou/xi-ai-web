# Phase 02 - Adapter Routing Layer

## Overview

Status: Planned  
Priority: P0  

把请求真正交给厂商适配器。前台只传 provider/model/capability，服务端根据注册表决定走哪个端点、什么协议、什么请求体。

## Related Files

- Modify: `C:\Users\56252\Documents\New project 2\server\index.mjs`
- Modify: `C:\Users\56252\Documents\New project 2\server\providers\registry.mjs`
- Modify: `C:\Users\56252\Documents\New project 2\server\providers\openai.mjs`
- Modify: `C:\Users\56252\Documents\New project 2\server\providers\anthropic.mjs`
- Modify: `C:\Users\56252\Documents\New project 2\server\providers\gemini.mjs`
- Modify: `C:\Users\56252\Documents\New project 2\server\providers\openai-compatible.mjs`

## Routing Rules

- Chat:
  - OpenAI -> Responses API
  - Claude -> Messages API
  - Gemini -> generateContent / streamGenerateContent
  - openai-compatible -> chat/completions fallback
- Image:
  - OpenAI or Gemini native only
  - Claude rejected early
- Audio:
  - OpenAI or Gemini native only
  - Claude rejected early
- Embeddings:
  - OpenAI or Gemini native
  - Claude uses external embedding provider or upstream fallback
- Tool calling:
  - Normalize into internal tool loop, then map to each vendor

## Internal Request Shape

```ts
type DispatchRequest = {
  providerId: string;
  modelId: string;
  capability: ProviderModelCapability;
  input: unknown;
  context?: unknown;
};
```

## Implementation Steps

1. Create a single dispatch entrypoint:

```js
dispatchProviderRequest({ providerId, modelId, capability, input })
```

2. Resolve provider and model from registry.
3. Validate capability before network call.
4. Dispatch to the correct adapter.
5. Normalize errors and redact keys.

## Success Criteria

- Same public request shape can route to OpenAI, Claude, Gemini, or custom compatible providers.
- Unsupported capability fails before calling the vendor.
- No page-specific code decides endpoint paths anymore.

## Risk

- Tooling and streaming shapes differ.
- Mitigation: keep the first version non-streaming for tool-assisted paths if needed.
