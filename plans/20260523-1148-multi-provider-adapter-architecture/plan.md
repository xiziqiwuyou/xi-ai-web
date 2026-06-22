# OpenAI / Claude / Gemini 多厂商接口适配计划

## Goal

把当前单一 `openai-compatible` 调用方式升级为多厂商适配架构。支持 OpenAI、Anthropic Claude、Google Gemini，并覆盖对话、语音、画图、多模态、工具调用、向量检索。普通用户仍在设置页配置 API，后台仍控制菜单和系统级开关。

## Research

官方文档调研见：

- [provider-api-official-docs.md](./research/provider-api-official-docs.md)

## Current State

- `server/index.mjs` 现在直接拼 OpenAI-compatible endpoint：
  - `/chat/completions`
  - `/images/generations`
  - `/audio/speech`
- `UserProviderConfig` 只有 `providerName/baseUrl/apiKey/model`。
- `Provider.kind` 只有 `"openai-compatible"`。
- 工具调用、上传附件、多模态消息、embedding、向量索引还没有统一协议。

## Recommended Architecture

新增 server-side provider adapter 层：

```ts
ProviderKind = "openai" | "anthropic" | "gemini" | "openai-compatible"
```

每个厂商 adapter 把本项目的内部请求协议翻译成厂商协议，再把厂商响应归一化为统一结果。

## Phases

1. [Phase 01 - Provider 类型与能力模型](./phase-01-provider-contracts.md)
2. [Phase 02 - Server Adapter 层](./phase-02-server-adapters.md)
3. [Phase 03 - 对话、多模态与工具调用](./phase-03-chat-multimodal-tools.md)
4. [Phase 04 - 语音与画图适配](./phase-04-media-adapters.md)
5. [Phase 05 - 向量检索与知识库](./phase-05-vector-retrieval.md)
6. [Phase 06 - 设置页、后台与验证](./phase-06-ui-admin-validation.md)

## Key Decisions

- Keep `openai-compatible` as custom endpoint fallback.
- Use native adapters for OpenAI, Anthropic, Gemini.
- Do not fake unsupported provider capabilities.
- Use local vector store MVP first, provider-native file search second.
- Add capability-specific model overrides instead of forcing one model to do chat/image/audio/embedding.

## Capability Defaults

| Feature | Preferred provider path |
| --- | --- |
| 对话 | all providers |
| 多模态图像输入 | all providers |
| 工具调用 | all providers, server-side loop |
| 画图 | OpenAI or Gemini; Claude disabled |
| 语音输入/输出 | OpenAI or Gemini; Claude disabled |
| 向量检索 | OpenAI/Gemini embeddings; Claude consumes retrieved context |

## Risks

- Streaming formats differ strongly.
- Tool calling loops are easy to get stuck in recursive calls.
- File upload security must be handled before multimodal.
- Provider docs and model names change frequently.

## Unresolved Questions

- 是否允许额外接入 Voyage AI 作为 Claude 推荐的 embedding provider。推荐先不加，除非你明确需要。
- 是否要接 Google Vertex AI OAuth 模式。推荐先只做 Gemini API key 模式。
- 视频生成是否纳入本轮。当前请求未点名视频，建议先不做原生 Veo/OpenAI video。
