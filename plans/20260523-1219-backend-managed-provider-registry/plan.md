# Backend-Managed Provider Registry

## Goal

把现在的“用户自己填 API URL / API Key”的模式改成“后台统一托管厂商接口与模型目录”。管理员在后台配置 OpenAI、Claude、Gemini 等厂商的凭据和模型列表，前台对话页只选择“厂商 + 模型”，请求再由服务端分发到对应端点和协议。

## Current Shift

- 旧方案偏向 BYOK。
- 新方案是后台托管 provider registry。
- 公共设置页里的 API URL / API Key 应退场或降级为只读说明。
- 聊天页需要 provider + model 双选择，不再只有单个模型字符串。

## Research

- [provider-api-implications.md](./research/provider-api-implications.md)
- 之前的官方文档调研仍有效，可复用。

## Phases

1. [Phase 01 - Provider Registry Schema](./phase-01-provider-registry-schema.md)
   - 定义厂商、模型、能力、端点和凭据的服务器端数据结构。

2. [Phase 02 - Adapter Routing Layer](./phase-02-adapter-routing-layer.md)
   - 用 OpenAI / Claude / Gemini / openai-compatible 适配器统一服务端请求分发。

3. [Phase 03 - Admin Model Catalog](./phase-03-admin-model-catalog.md)
   - 后台配置各厂商的模型列表、能力标签、默认模型和启用状态。

4. [Phase 04 - Public Model Picker](./phase-04-public-model-picker.md)
   - 对话页、生成页从后台读取模型目录，按厂商和模型选择请求路径。

5. [Phase 05 - Media, Tools, Retrieval](./phase-05-media-tools-retrieval.md)
   - 语音、画图、多模态、工具调用、向量检索接入相应厂商能力。

6. [Phase 06 - Migration and Validation](./phase-06-migration-validation.md)
   - 迁移旧数据、验证路由、回归检查、清理旧 public API 设置。

## Key Decisions

- Provider credentials live in admin/backend, not in the public browser session.
- Public selection is provider + model, not raw baseUrl + apiKey.
- Provider kind drives request shape.
- Model capability drives endpoint choice.
- Unsupported capability should fail early and visibly.

## Open Questions

- 是否仍保留“自定义 openai-compatible 兼容接口”给管理员。
- 是否允许一个 provider 下挂多个 baseUrl profile。
- 是否把公共设置页完全删除，还是改成默认 provider/model 偏好页。
