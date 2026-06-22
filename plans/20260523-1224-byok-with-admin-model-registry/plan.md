# BYOK + Admin Model Registry

## Goal

纠正之前的边界错误。这个项目没有用户登录，所以前台必须继续 BYOK，用户自己带 `URL + Key` 才能用。后台只负责维护模型目录，包括模型厂商、模型名称、模型功能、默认项和启用状态。前台在对话页选择“模型”，服务端再结合用户自带的 `URL + Key` 和后台模型目录，走对应厂商的端点和协议。

## Corrected rule

- Public user owns connection.
- Admin owns catalog.
- Server owns routing.
- No admin-stored user credentials.

## Research

- [architecture-correction.md](./research/architecture-correction.md)
- 之前的官方厂商文档调研继续有效，可复用。

## Phases

1. [Phase 01 - Public BYOK Connection](./phase-01-public-byok-connection.md)
   - 前台保留 URL / Key 设置，去掉“后台托管凭据”思路。

2. [Phase 02 - Admin Model Catalog](./phase-02-admin-model-catalog.md)
   - 后台只维护模型目录、厂商、能力和默认映射，不保存用户 key。

3. [Phase 03 - Provider Routing With User Connection](./phase-03-provider-routing-with-user-connection.md)
   - 服务端把用户 URL / Key + 后台模型元数据合并成请求。

4. [Phase 04 - Public Model Picker](./phase-04-public-model-picker.md)
   - 对话页按后台模型目录选模型，模型自带厂商标签。

5. [Phase 05 - Media, Tools, Retrieval](./phase-05-media-tools-retrieval.md)
   - 画图、语音、多模态、工具调用、向量检索按厂商能力路由。

6. [Phase 06 - Migration and Validation](./phase-06-migration-validation.md)
   - 迁移旧数据，验证前台 BYOK 流程和后台模型管理流程。

## Key Decisions

- Keep user API URL and key in public settings/session state.
- Remove any backend storage of public API key.
- Admin model catalog should be metadata only.
- Public model selection should come from admin-managed catalog.
- Model selection determines vendor kind and request protocol.

## Open Questions

- 是否保留 `openai-compatible` 作为后台可维护的特殊模型类目。
- 是否让模型目录按能力过滤展示，而不是单纯按厂商展示。
- 是否把默认模型记忆在浏览器本地，还是只保留当前会话。
