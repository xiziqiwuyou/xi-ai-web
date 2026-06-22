# Phase 02 - Server Adapter 层

## Overview

Status: Planned  
Priority: P0  

把 `server/index.mjs` 里的厂商请求拼接抽出来，新增可测试的 adapter 层。当前单文件直接 fetch 的方式会越来越难维护。

## Related Files

- Create: `C:\Users\56252\Documents\New project 2\server\providers\types.mjs`
- Create: `C:\Users\56252\Documents\New project 2\server\providers\registry.mjs`
- Create: `C:\Users\56252\Documents\New project 2\server\providers\openai.mjs`
- Create: `C:\Users\56252\Documents\New project 2\server\providers\anthropic.mjs`
- Create: `C:\Users\56252\Documents\New project 2\server\providers\gemini.mjs`
- Create: `C:\Users\56252\Documents\New project 2\server\providers\openai-compatible.mjs`
- Modify: `C:\Users\56252\Documents\New project 2\server\index.mjs`

## Adapter Contract

```js
export function createProviderAdapter(provider) {
  return {
    kind,
    capabilities,
    streamChat,
    completeText,
    generateImage,
    synthesizeSpeech,
    transcribeAudio,
    embedText,
    fileSearch
  };
}
```

## Normalized Request Types

```ts
NormalizedPart =
  | { type: "text"; text: string }
  | { type: "image"; mimeType: string; data?: string; url?: string }
  | { type: "audio"; mimeType: string; data?: string; url?: string }
  | { type: "file"; mimeType: string; name: string; data?: string; url?: string }
  | { type: "toolCall"; id: string; name: string; input: unknown }
  | { type: "toolResult"; toolCallId: string; content: string };
```

## Provider Mapping

### OpenAI

- Native adapter uses Responses API for chat/multimodal/tools.
- Keep image/audio/embeddings on dedicated endpoints.
- Keep openai-compatible adapter for `/chat/completions`.

### Anthropic

- Uses Messages API.
- Headers:
  - `x-api-key`
  - `anthropic-version`
  - `content-type`
- Map system prompt to top-level `system`.
- Map multimodal to content blocks.
- Map tool calls to `tool_use`.

### Gemini

- Uses `models/{model}:generateContent`.
- Headers:
  - `x-goog-api-key`
  - `content-type`
- Map messages to `contents`.
- Map multimodal to `parts`.
- Map tools to `functionDeclarations`.

## Implementation Steps

1. Add `providers/types.mjs` with normalized interfaces.
2. Move shared helpers:
   - API key redaction.
   - timeout.
   - JSON / binary fetch.
   - SSE parser.
3. Implement `openai-compatible` by moving current logic unchanged.
4. Implement native `openai`.
5. Implement `anthropic`.
6. Implement `gemini`.
7. Change `resolveChatProvider()` usage to:

```js
const adapter = createProviderAdapter(provider);
await adapter.streamChat(...);
```

8. Add fallback errors:
   - `Capability image is not supported by anthropic`.
   - `Capability embedding is not supported by anthropic`.

## Success Criteria

- Existing OpenAI-compatible requests still work.
- Each provider has one adapter module.
- `server/index.mjs` no longer knows vendor-specific payload details.
- Unsupported features fail before network request.

## Risk

- Moving too much at once can break current chat.
- Mitigation: start with adapter wrapper around existing code, then replace provider by provider.
